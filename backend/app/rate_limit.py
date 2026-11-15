import ipaddress
import logging
import math
import time
import uuid
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request

try:
    import redis
    import redis.exceptions
except ImportError:  # pragma: no cover
    redis = None

from app.config import RATE_LIMIT_FAIL_CLOSED, REDIS_URL, TRUSTED_PROXIES

logger = logging.getLogger("coroomies.rate_limit")

_PRUNE_AFTER = 3600  # forget in-memory counters older than an hour

# Atomic sliding-window rate limit script for Redis.
# KEYS[1] = rate limit key (e.g. ratelimit:login:ip:1.2.3.4)
# ARGV[1] = current timestamp (float string)
# ARGV[2] = window cutoff timestamp (now - window)
# ARGV[3] = maximum allowed hits (integer string)
# ARGV[4] = key TTL in seconds (integer string)
# ARGV[5] = unique hit member identifier
_SLIDING_WINDOW_LUA = """
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[2])
local current_hits = redis.call('ZCARD', KEYS[1])
if current_hits >= tonumber(ARGV[3]) then
    return 0
end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[5])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4]))
return 1
"""


def is_trusted_proxy(host: str) -> bool:
    """Check if the immediate peer socket address belongs to a trusted proxy or tunnel.
    
    CRITICAL FOR PRODUCTION:
    In production deployments (behind Cloudflare, AWS ALB, Nginx, etc.), TRUSTED_PROXIES
    must be explicitly configured to match the exact IP or CIDR block of the upstream
    reverse proxy. Only requests from these trusted socket addresses will have their
    forwarded headers (CF-Connecting-IP, X-Forwarded-For) honored. If TRUSTED_PROXIES
    is empty or does not match the proxy, forwarded headers are ignored and the peer socket
    address is used, preventing header spoofing attacks.
    """
    if not host:
        return False
    if host in TRUSTED_PROXIES:
        return True
    try:
        ip = ipaddress.ip_address(host)
        for entry in TRUSTED_PROXIES:
            try:
                if "/" in entry and ip in ipaddress.ip_network(entry, strict=False):
                    return True
                elif ip == ipaddress.ip_address(entry):
                    return True
            except ValueError:
                pass
    except ValueError:
        pass
    return False


def get_client_ip(request: Request) -> str:
    """Best-effort client IP.
    
    Forwarded headers (CF-Connecting-IP, X-Forwarded-For) are trusted ONLY when
    the immediate peer is an explicitly trusted proxy or tunnel. Direct client
    connections cannot spoof client IP addresses by sending arbitrary headers.
    """
    peer = request.client.host if request.client else ""
    if not peer:
        return "unknown"

    if is_trusted_proxy(peer):
        cf = request.headers.get("cf-connecting-ip")
        if cf and cf.strip():
            return cf.strip()
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded and forwarded.strip():
            client = forwarded.split(",")[0].strip()
            if client:
                return client

    return peer


class RateLimiter:
    """Production-grade hybrid sliding-window rate limiter.
    
    1. Primary mode (Distributed): Uses Redis with an atomic Lua script across
       all workers and instances when REDIS_URL is configured and reachable.
    
    2. Failure Policy & Fail-Closed Behavior:
       - If fail_closed is True (default in production):
         If Redis is unconfigured, unreachable, or encounters any network/connection
         error, the limiter immediately raises HTTP 503 Service Unavailable with a
         controlled response. Sensitive endpoints NEVER silently downgrade to
         per-process in-memory limits in production.
       - If fail_closed is False (default in development):
         If Redis is unconfigured or fails, the limiter logs a warning and falls
         back to thread-safe local in-memory sliding-window limiting for local
         development convenience.
    """

    def __init__(
        self,
        redis_url: str = REDIS_URL,
        redis_client=None,
        fail_closed: bool = RATE_LIMIT_FAIL_CLOSED,
    ):
        self._redis_url = redis_url
        self._redis_client = redis_client
        self._lua_sha = None
        self._fail_closed = fail_closed
        self._hits = defaultdict(deque)
        self._lock = Lock()
        self._last_connect_attempt = 0.0

        if self._redis_client is not None:
            self._load_script()
        elif self._redis_url:
            self._init_redis()

    @property
    def is_distributed(self) -> bool:
        """True ONLY if Redis is configured, reachable, authenticated, and script is loaded."""
        return self._redis_client is not None and self._lua_sha is not None

    def _init_redis(self):
        if not self._redis_url or redis is None:
            self._redis_client = None
            self._lua_sha = None
            return

        try:
            client = redis.from_url(
                self._redis_url,
                decode_responses=True,
                socket_timeout=1.5,
                socket_connect_timeout=1.5,
                health_check_interval=30,
            )
            # Actively test connectivity with PING before claiming active status
            client.ping()
            sha = client.script_load(_SLIDING_WINDOW_LUA)
            self._redis_client = client
            self._lua_sha = sha
            logger.info("Shared Redis rate limiter connected and active (%s).", self._redis_url)
        except Exception as exc:
            self._redis_client = None
            self._lua_sha = None
            logger.warning(
                "Redis rate limiter unavailable at %s (%s: %s).",
                self._redis_url,
                type(exc).__name__,
                exc,
            )

    def _load_script(self):
        if self._redis_client:
            try:
                self._lua_sha = self._redis_client.script_load(_SLIDING_WINDOW_LUA)
            except Exception as exc:
                logger.warning("Failed to load Redis rate limit Lua script: %s", exc)
                self._lua_sha = None

    def _eval_redis(self, key: str, limit: int, window: float) -> bool:
        now = time.time()
        cutoff = now - window
        ttl = max(1, math.ceil(window) + 1)
        hit_id = f"{now}:{uuid.uuid4().hex[:8]}"
        redis_key = f"ratelimit:{key}"

        if self._lua_sha:
            try:
                res = self._redis_client.evalsha(
                    self._lua_sha,
                    1,
                    redis_key,
                    str(now),
                    str(cutoff),
                    str(limit),
                    str(ttl),
                    hit_id,
                )
                return bool(res)
            except Exception as script_exc:
                # If script cache was lost on Redis restart (NOSCRIPT), reload and retry
                if redis and isinstance(
                    script_exc, getattr(redis.exceptions, "NoScriptError", ())
                ):
                    self._load_script()
                    res = self._redis_client.eval(
                        _SLIDING_WINDOW_LUA,
                        1,
                        redis_key,
                        str(now),
                        str(cutoff),
                        str(limit),
                        str(ttl),
                        hit_id,
                    )
                    return bool(res)
                raise script_exc
        else:
            res = self._redis_client.eval(
                _SLIDING_WINDOW_LUA,
                1,
                redis_key,
                str(now),
                str(cutoff),
                str(limit),
                str(ttl),
                hit_id,
            )
            return bool(res)

    def allow(self, key: str, limit: int, window: float) -> bool:
        """Sliding-window check. Returns True if this attempt is within limits."""
        # Periodic reconnection attempt if Redis was previously unreachable
        if not self.is_distributed and self._redis_url and self._redis_client is None:
            now_mono = time.monotonic()
            if now_mono - self._last_connect_attempt > 5.0:
                self._last_connect_attempt = now_mono
                self._init_redis()

        if self._fail_closed:
            # Production policy: fail closed with 503 if Redis is required but unavailable.
            if not self.is_distributed:
                logger.error(
                    "Rate limiter fail-closed triggered: Redis is required but unavailable (key=%s).",
                    key,
                )
                raise HTTPException(
                    status_code=503,
                    detail="Rate limiter service temporarily unavailable. Please try again later.",
                )

            try:
                return self._eval_redis(key, limit, window)
            except Exception as exc:
                logger.error(
                    "Rate limiter fail-closed triggered: Redis operation failed (%s: %s) for key=%s.",
                    type(exc).__name__,
                    exc,
                    key,
                )
                self._redis_client = None
                self._lua_sha = None
                raise HTTPException(
                    status_code=503,
                    detail="Rate limiter service temporarily unavailable. Please try again later.",
                )

        # Development mode policy: fall back to thread-safe in-memory sliding window
        if self.is_distributed:
            try:
                return self._eval_redis(key, limit, window)
            except Exception as exc:
                logger.warning(
                    "Redis rate limit check failed (%s); falling back to in-memory limiting: %s",
                    type(exc).__name__,
                    exc,
                )
                self._redis_client = None
                self._lua_sha = None
                return self._allow_in_memory(key, limit, window)

        return self._allow_in_memory(key, limit, window)

    def _allow_in_memory(self, key: str, limit: int, window: float) -> bool:
        now = time.monotonic()
        with self._lock:
            window_hits = self._hits[key]
            while window_hits and now - window_hits[0] > window:
                window_hits.popleft()
            if len(window_hits) >= limit:
                self._prune(now)
                return False
            window_hits.append(now)
            return True

    def _prune(self, now: float):
        if len(self._hits) < 5000:
            return
        for key in list(self._hits):
            hits = self._hits[key]
            while hits and now - hits[0] > _PRUNE_AFTER:
                hits.popleft()
            if not hits:
                del self._hits[key]

    def reset_in_memory(self):
        """Clear local in-memory hit tracking (primarily for test isolation)."""
        with self._lock:
            self._hits.clear()


# Default singleton instance
_limiter = RateLimiter()


def enforce(key: str, limit: int, window: float):
    """Enforce a sliding-window rate limit, raising HTTP 429 when exceeded."""
    if not _limiter.allow(key, limit, window):
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please wait a moment and try again.",
        )

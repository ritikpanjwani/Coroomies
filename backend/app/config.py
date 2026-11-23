import os

from pathlib import Path
from dotenv import load_dotenv

_backend_env = Path(__file__).resolve().parent.parent / ".env"
if _backend_env.exists():
    load_dotenv(_backend_env)
load_dotenv()


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc


def _env_list(name: str) -> tuple[str, ...]:
    raw = os.getenv(name, "")
    values = []
    for item in raw.split(","):
        value = item.strip().rstrip("/")
        if value:
            values.append(value)
    return tuple(dict.fromkeys(values))


ENVIRONMENT = os.getenv("ENVIRONMENT", os.getenv("APP_ENV", "development")).strip().lower()
IS_PRODUCTION = ENVIRONMENT in ("production", "prod", "staging")

# Development-only OTP logging is hard-disabled in production, even if the
# environment file still contains DEV_MODE=true.
_DEV_MODE_REQUESTED = _env_bool("DEV_MODE", False)
DEV_MODE = _DEV_MODE_REQUESTED and not IS_PRODUCTION
DEV_MODE_OVERRIDDEN = _DEV_MODE_REQUESTED and IS_PRODUCTION

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "").strip()
if not JWT_SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY must be set in environment variables")
if IS_PRODUCTION and len(JWT_SECRET_KEY) < 32:
    raise RuntimeError("JWT_SECRET_KEY must be at least 32 characters in production")

OTP_PEPPER_KEY = os.getenv("OTP_PEPPER_KEY", "").strip()
if not OTP_PEPPER_KEY:
    raise RuntimeError("OTP_PEPPER_KEY must be set in environment variables")
if IS_PRODUCTION and len(OTP_PEPPER_KEY) < 32:
    raise RuntimeError("OTP_PEPPER_KEY must be at least 32 characters in production")

ACCESS_TOKEN_EXPIRE_MINUTES = _env_int("ACCESS_TOKEN_EXPIRE_MINUTES", 1440)
if ACCESS_TOKEN_EXPIRE_MINUTES <= 0:
    raise RuntimeError("ACCESS_TOKEN_EXPIRE_MINUTES must be positive")

_DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
)
_configured_cors_origins = _env_list("CORS_ORIGINS")
if IS_PRODUCTION:
    if not _configured_cors_origins:
        raise RuntimeError("CORS_ORIGINS must list the trusted frontend origin(s) in production")
    CORS_ORIGINS = _configured_cors_origins
else:
    CORS_ORIGINS = tuple(dict.fromkeys(_DEFAULT_CORS_ORIGINS + _configured_cors_origins))

if any("*" in origin or origin == "null" for origin in CORS_ORIGINS):
    raise RuntimeError("CORS_ORIGINS must contain explicit origins, not wildcards")

# Random quick-tunnel hostnames are a development convenience only.
ALLOW_CLOUDFLARE_TUNNELS = (
    _env_bool("CORS_ALLOW_TUNNELS", False) and not IS_PRODUCTION
)

# Trusted reverse proxies / tunnels whose forwarded client IP headers are accepted.
# By default in dev, loopback addresses are trusted (e.g. cloudflared tunnel or local nginx).
_DEFAULT_TRUSTED_PROXIES = ("127.0.0.1", "::1", "localhost")
_configured_trusted_proxies = _env_list("TRUSTED_PROXIES")
if IS_PRODUCTION:
    TRUSTED_PROXIES = _configured_trusted_proxies
else:
    TRUSTED_PROXIES = tuple(dict.fromkeys(_DEFAULT_TRUSTED_PROXIES + _configured_trusted_proxies))

# Shared Redis connection URL for distributed rate limiting.
# Optional in dev; if omitted or unreachable in dev, rate limiter falls back to in-memory limiting.
REDIS_URL = os.getenv("REDIS_URL", "").strip()

# Fail-closed policy for rate limiting:
# In production, defaults to True: sensitive endpoints fail closed with HTTP 503
# if Redis is required but unavailable or fails, preventing silent downgrade
# to per-process limits. In development, defaults to False for convenience.
RATE_LIMIT_FAIL_CLOSED = _env_bool("RATE_LIMIT_FAIL_CLOSED", default=IS_PRODUCTION)

CSP_POLICY = os.getenv(
    "CONTENT_SECURITY_POLICY",
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; "
    "frame-src https://accounts.google.com; "
    "object-src 'none'; form-action 'self'; img-src 'self' data: blob:; "
    "media-src 'self' data: blob:; "
    "script-src 'self' https://accounts.google.com; "
    "style-src 'self' 'unsafe-inline' https://accounts.google.com; "
    "style-src-elem 'self' 'unsafe-inline' https://accounts.google.com; "
    "connect-src 'self' https://accounts.google.com",
).strip()

# Enable only when the public deployment is guaranteed to be HTTPS-only.
HSTS_ENABLED = _env_bool("HSTS_ENABLED", False)
HSTS_MAX_AGE = _env_int("HSTS_MAX_AGE", 31536000)
HSTS_INCLUDE_SUBDOMAINS = _env_bool("HSTS_INCLUDE_SUBDOMAINS", False)

DB_POOL_MIN_SIZE = _env_int("DB_POOL_MIN_SIZE", 1)
DB_POOL_MAX_SIZE = _env_int("DB_POOL_MAX_SIZE", 10)
DB_POOL_TIMEOUT_SECONDS = float(os.getenv("DB_POOL_TIMEOUT_SECONDS", "5"))
if DB_POOL_MIN_SIZE < 1 or DB_POOL_MAX_SIZE < DB_POOL_MIN_SIZE:
    raise RuntimeError("DB pool sizes must satisfy 1 <= DB_POOL_MIN_SIZE <= DB_POOL_MAX_SIZE")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_ALLOWED_ISSUERS = (
    "https://accounts.google.com",
    "accounts.google.com",
)

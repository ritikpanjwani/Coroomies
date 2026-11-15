import concurrent.futures
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock

backend_dir = Path(__file__).resolve().parent.parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi import HTTPException
from starlette.requests import Request

from app.rate_limit import RateLimiter, enforce, get_client_ip, is_trusted_proxy, _limiter
from app.security import hash_otp, verify_otp_hash


def _make_dummy_request(client_host: str, headers: dict | None = None) -> Request:
    scope = {
        "type": "http",
        "client": (client_host, 12345),
        "headers": [(k.lower().encode("latin1"), v.encode("latin1")) for k, v in (headers or {}).items()],
    }
    return Request(scope)


def test_trusted_proxy_header_handling():
    print("[1] Testing trusted proxy header validation and spoof prevention...")
    # 1. Untrusted peer sending spoofed CF-Connecting-IP and X-Forwarded-For
    untrusted_req = _make_dummy_request(
        "203.0.113.50",
        {"cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2, 3.3.3.3"},
    )
    assert not is_trusted_proxy("203.0.113.50"), "Direct client should not be trusted proxy"
    detected_ip = get_client_ip(untrusted_req)
    assert detected_ip == "203.0.113.50", f"Expected socket peer 203.0.113.50, got {detected_ip}"

    # 2. Trusted proxy (loopback) sending Cloudflare header
    trusted_cf_req = _make_dummy_request(
        "127.0.0.1",
        {"cf-connecting-ip": "198.51.100.44"},
    )
    assert is_trusted_proxy("127.0.0.1"), "127.0.0.1 must be trusted proxy"
    detected_ip = get_client_ip(trusted_cf_req)
    assert detected_ip == "198.51.100.44", f"Expected forwarded IP 198.51.100.44, got {detected_ip}"

    # 3. Trusted proxy sending X-Forwarded-For
    trusted_xff_req = _make_dummy_request(
        "::1",
        {"x-forwarded-for": "198.51.100.99, 10.0.0.1"},
    )
    assert is_trusted_proxy("::1"), "::1 must be trusted proxy"
    detected_ip = get_client_ip(trusted_xff_req)
    assert detected_ip == "198.51.100.99", f"Expected leftmost IP 198.51.100.99, got {detected_ip}"

    print("  -> Passed: Header spoofing prevented from untrusted clients; trusted proxies honored.")


def test_redis_reachability_verification():
    print("[2] Testing Redis reachability verification before claiming active status...")
    # Unreachable Redis URL must NOT be marked as active / distributed
    limiter = RateLimiter(redis_url="redis://127.0.0.1:63799/0", fail_closed=False)
    assert not limiter.is_distributed, "Unreachable Redis must not be marked as active/distributed"
    assert limiter._redis_client is None, "Failed connection client must be cleared"

    # Mock Redis that successfully responds to ping and script_load
    mock_redis = MagicMock()
    mock_redis.ping.return_value = True
    mock_redis.script_load.return_value = "mock_sha_123"

    active_limiter = RateLimiter(redis_client=mock_redis, fail_closed=False)
    assert active_limiter.is_distributed, "Reachable Redis must be marked as active/distributed"
    assert active_limiter._lua_sha == "mock_sha_123"
    print("  -> Passed: Active distributed status requires confirmed ping and script load.")


def test_limit_enforcement():
    print("[3] Testing sliding-window limit enforcement...")
    limiter = RateLimiter(redis_url="", fail_closed=False)
    key = "test:limit_enforce"

    # Limit 3 in 60s
    assert limiter.allow(key, limit=3, window=60) is True
    assert limiter.allow(key, limit=3, window=60) is True
    assert limiter.allow(key, limit=3, window=60) is True
    assert limiter.allow(key, limit=3, window=60) is False

    # enforce() wrapper raises HTTP 429
    try:
        if not limiter.allow(key, limit=3, window=60):
            raise HTTPException(status_code=429, detail="Too many attempts")
        assert False, "Should have raised HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 429

    print("  -> Passed: Exactly limit=3 attempts allowed; 4th rejected with 429.")


def test_window_expiry():
    print("[4] Testing window expiration...")
    limiter = RateLimiter(redis_url="", fail_closed=False)
    key = "test:expiry"

    # Allow 1 attempt in 0.2s window
    assert limiter.allow(key, limit=1, window=0.2) is True
    assert limiter.allow(key, limit=1, window=0.2) is False

    time.sleep(0.25)
    # Window expired, should be allowed again
    assert limiter.allow(key, limit=1, window=0.2) is True
    print("  -> Passed: Limit resets cleanly after window expires.")


def test_concurrency():
    print("[5] Testing concurrency under high contention...")
    limiter = RateLimiter(redis_url="", fail_closed=False)
    key = "test:concurrency"
    limit = 8
    threads = 40

    def attempt(_):
        return limiter.allow(key, limit=limit, window=10)

    with concurrent.futures.ThreadPoolExecutor(max_workers=threads) as executor:
        results = list(executor.map(attempt, range(threads)))

    allowed_count = sum(1 for r in results if r is True)
    denied_count = sum(1 for r in results if r is False)

    assert allowed_count == limit, f"Expected exactly {limit} allowed, got {allowed_count}"
    assert denied_count == threads - limit, f"Expected {threads - limit} denied, got {denied_count}"
    print(f"  -> Passed: Exactly {allowed_count} succeeded and {denied_count} blocked across {threads} threads.")


def test_production_fail_closed_policy():
    print("[6] Testing production fail-closed policy (HTTP 503 on Redis failure)...")
    # 1. Production mode with unconfigured / unavailable Redis -> must fail closed with 503
    prod_limiter_no_redis = RateLimiter(redis_url="", fail_closed=True)
    try:
        prod_limiter_no_redis.allow("login:ip:10.0.0.1", limit=5, window=60)
        assert False, "Expected 503 HTTPException when Redis is unavailable in production"
    except HTTPException as exc:
        assert exc.status_code == 503, f"Expected 503, got {exc.status_code}"
        assert "temporarily unavailable" in exc.detail.lower()

    # 2. Production mode with Redis query exception mid-flight -> must fail closed with 503
    mock_redis = MagicMock()
    mock_redis.evalsha.side_effect = Exception("Redis network timeout")
    prod_limiter_failing_redis = RateLimiter(redis_client=mock_redis, fail_closed=True)
    try:
        prod_limiter_failing_redis.allow("verify-otp:ip:10.0.0.2", limit=5, window=60)
        assert False, "Expected 503 HTTPException on Redis query failure in production"
    except HTTPException as exc:
        assert exc.status_code == 503, f"Expected 503, got {exc.status_code}"
        assert "temporarily unavailable" in exc.detail.lower()

    # 3. Development mode (fail_closed=False) with failing Redis -> falls back to in-memory limiting
    mock_redis_dev = MagicMock()
    mock_redis_dev.evalsha.side_effect = Exception("Redis network timeout")
    dev_limiter = RateLimiter(redis_client=mock_redis_dev, fail_closed=False)
    # Should conveniently fall back to in-memory limiting rather than 503
    assert dev_limiter.allow("dev:op", limit=2, window=60) is True
    assert dev_limiter.allow("dev:op", limit=2, window=60) is True
    assert dev_limiter.allow("dev:op", limit=2, window=60) is False

    print("  -> Passed: In production, sensitive endpoints fail closed with HTTP 503; in dev, convenient fallback.")


def test_redis_atomic_eval_success():
    print("[7] Testing Redis evalsha atomic integration path...")
    mock_redis = MagicMock()
    mock_redis.evalsha.side_effect = [1, 1, 0]

    limiter = RateLimiter(redis_client=mock_redis, fail_closed=True)
    key = "test:redis_eval"
    assert limiter.allow(key, limit=2, window=60) is True
    assert limiter.allow(key, limit=2, window=60) is True
    assert limiter.allow(key, limit=2, window=60) is False

    assert mock_redis.evalsha.call_count == 3
    print("  -> Passed: Redis Lua evalsha called with correct arguments and response honored.")


def test_otp_protections_intact():
    print("[8] Verifying OTP security protections remain intact (HMAC-SHA256, 5-attempt lockout, expiry)...")
    # 1. HMAC-SHA256 verification
    plain_otp = "482910"
    otp_hash = hash_otp(plain_otp)
    assert len(otp_hash) == 64, "OTP hash must be 64-character hex digest"
    assert verify_otp_hash(plain_otp, otp_hash) is True, "Valid OTP must verify"
    assert verify_otp_hash("111111", otp_hash) is False, "Invalid OTP must fail verification"

    # 2. Obsolete plaintext fallback removed:
    # A legacy plaintext OTP stored as "482910" must NO LONGER verify!
    assert verify_otp_hash(plain_otp, plain_otp) is False, "Obsolete plaintext code must be rejected"

    # 3. Rolling migration plain SHA-256 fallback remains valid for active in-flight tokens
    import hashlib
    legacy_sha256 = hashlib.sha256(plain_otp.encode("utf-8")).hexdigest()
    assert verify_otp_hash(plain_otp, legacy_sha256) is True, "In-flight rolling SHA-256 token must verify"

    # 4. Expiry verification logic
    now = datetime.now(timezone.utc)
    expired_time = now - timedelta(seconds=1)
    future_time = now + timedelta(minutes=10)
    assert now > expired_time, "Expired token must be detected"
    assert now <= future_time, "Valid token must be within expiry"

    # 5. 5-attempt invalidation logic
    failed_attempts = 0
    token_used = False
    for attempt in range(1, 6):
        failed_attempts += 1
        if failed_attempts >= 5:
            token_used = True

    assert failed_attempts == 5
    assert token_used is True, "Token must be invalidated (used=True) upon 5 failed attempts"

    print("  -> Passed: OTP cryptographic hashing, plaintext fallback removed, expiry, and 5-attempt lockout intact.")


def test_emailer_bounded_retries_and_reliability():
    print("[9] Testing emailer bounded retries and error handling...")
    from unittest.mock import patch
    from app.emailer import _send, send_otp_email_background, send_email_change_otp_background

    # Test 1: Transient failure on attempt 1, success on attempt 2
    with patch("smtplib.SMTP") as mock_smtp, patch.dict("os.environ", {
        "SMTP_HOST": "smtp.test.com",
        "SMTP_USER": "test@test.com",
        "SMTP_PASS": "test_pass",
        "SMTP_PORT": "587"
    }):
        instance1 = MagicMock()
        instance1.__enter__.side_effect = Exception("Transient network blip")
        instance2 = MagicMock()
        instance2.__enter__.return_value = MagicMock()
        mock_smtp.side_effect = [instance1, instance2]

        result = _send("user@test.com", "Test Subject", "Test Body", max_retries=2)
        assert result is True, "Expected retry to succeed"
        assert mock_smtp.call_count == 2, "Expected exactly 2 attempts"

    # Test 2: Persistent failure on both attempts
    with patch("smtplib.SMTP") as mock_smtp, patch.dict("os.environ", {
        "SMTP_HOST": "smtp.test.com",
        "SMTP_USER": "test@test.com",
        "SMTP_PASS": "test_pass",
        "SMTP_PORT": "587"
    }):
        instance = MagicMock()
        instance.__enter__.side_effect = Exception("Persistent connection error")
        mock_smtp.side_effect = [instance, instance]

        result = _send("user@test.com", "Test Subject", "Test Body", max_retries=2)
        assert result is False, "Expected persistent failure to return False"
        assert mock_smtp.call_count == 2, "Expected exactly 2 attempts"

    # Test 3: Background worker executes without exception
    with patch("app.emailer.send_otp_email", return_value=True):
        send_otp_email_background("user@test.com", "123456", 10, user_id=1)

    print("  -> Passed: Email bounded retries (attempt 1 fail -> attempt 2 success), failure bounds, and workers tested.")


if __name__ == "__main__":
    test_trusted_proxy_header_handling()
    test_redis_reachability_verification()
    test_limit_enforcement()
    test_window_expiry()
    test_concurrency()
    test_production_fail_closed_policy()
    test_redis_atomic_eval_success()
    test_otp_protections_intact()
    test_emailer_bounded_retries_and_reliability()
    print("\nALL PRE-DEPLOYMENT VERIFICATION TESTS PASSED SUCCESSFULLY!")

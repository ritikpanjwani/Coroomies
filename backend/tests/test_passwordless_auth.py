import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks, HTTPException

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-abcdefghijklmnopqrstuvwxyz")
os.environ.setdefault("OTP_PEPPER_KEY", "test-pepper-abcdefghijklmnopqrstuvwxyz")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/coroomies_test")

from app.Routers import auth
from app.schemas import SendOtpRequest, VerifyLoginOtpRequest, GoogleLinkRequest
from app.security import hash_otp


class _FakePasswordlessCursor:
    def __init__(
        self,
        existing_user=None,
        active_otp_row=None,
    ):
        self.existing_user = existing_user
        self.active_otp_row = active_otp_row  # (id, expires_at, otp_hash, failed_attempts, user_id)
        self.rowcount = 0
        self.inserted_otp = False
        self.invalidated_previous = False
        self.inserted_user = False
        self.updated_otp_attempts = None
        self.token_marked_used = False
        self.queries = []
        self._result = None

    def execute(self, query, params=()):
        self.queries.append((query, params))
        if "UPDATE auth_otps" in query and "failed_attempts = %s" in query:
            self.updated_otp_attempts = params[0]
            self.rowcount = 1
            self._result = None
        elif "UPDATE auth_otps" in query and "WHERE id = %s" in query:
            self.token_marked_used = True
            self.rowcount = 1
            self._result = None
        elif "UPDATE auth_otps" in query and "used = TRUE" in query:
            self.invalidated_previous = True
            self.rowcount = 1
            self._result = None
        elif "INSERT INTO auth_otps" in query:
            self.inserted_otp = True
            self.rowcount = 1
            self._result = None
        elif "FROM auth_otps" in query:
            self._result = self.active_otp_row
        elif "FROM users" in query and "lower(" in query:
            self._result = self.existing_user
        elif "SELECT 1 FROM users WHERE username" in query:
            self._result = None  # username is available
        elif "INSERT INTO users" in query:
            self.inserted_user = True
            self.rowcount = 1
            self._result = (42,)
        elif "SELECT u.id, u.name" in query and "WHERE u.id = %s" in query:
            # Loaded after user insert
            self._result = (
                42,
                "New User",
                "newuser@example.com",
                "hash",
                "newuser",
                None,
                0,
                None,
                False,
            )
        elif "WHERE google_sub = %s" in query:
            self._result = None
        elif "UPDATE users" in query and "SET google_sub" in query:
            self.rowcount = 1
            self._result = None
        else:
            self._result = None

    def fetchone(self):
        return self._result

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeConnection:
    def __init__(self, cursor):
        self.cursor_val = cursor
        self.committed = False
        self.rolled_back = False

    def cursor(self):
        return self.cursor_val

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        pass


def test_send_login_otp_for_new_email(monkeypatch):
    cursor = _FakePasswordlessCursor(existing_user=None)
    conn = _FakeConnection(cursor)
    enforced_keys = []

    monkeypatch.setattr(auth, "get_connection", lambda: conn)
    monkeypatch.setattr(auth, "enforce", lambda key, limit, window: enforced_keys.append(key))
    monkeypatch.setattr(auth, "get_client_ip", lambda req: "10.0.0.1")

    bg_tasks = BackgroundTasks()
    res = auth.send_login_otp(
        SendOtpRequest(email="newuser@example.com"),
        SimpleNamespace(),
        bg_tasks,
    )

    assert "Verification code sent" in res["message"]
    assert res["expires_in_minutes"] == 10
    assert cursor.inserted_otp is True
    assert cursor.invalidated_previous is True
    assert conn.committed is True
    assert "otp-send:ip:10.0.0.1" in enforced_keys
    assert "otp-send:email:newuser@example.com" in enforced_keys
    assert len(bg_tasks.tasks) == 1


def test_send_login_otp_for_existing_user(monkeypatch):
    existing = (99, "Jane Doe", "jane@example.com", "hash", "janedoe", None, 0, None, True)
    cursor = _FakePasswordlessCursor(existing_user=existing)
    conn = _FakeConnection(cursor)

    monkeypatch.setattr(auth, "get_connection", lambda: conn)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda req: "10.0.0.1")

    bg_tasks = BackgroundTasks()
    res = auth.send_login_otp(
        SendOtpRequest(email="jane@example.com"),
        SimpleNamespace(),
        bg_tasks,
    )

    assert "Verification code sent" in res["message"]
    assert cursor.inserted_otp is True
    assert conn.committed is True
    assert len(bg_tasks.tasks) == 1


def test_verify_login_otp_for_existing_user(monkeypatch):
    test_otp = "123456"
    test_hash = hash_otp(test_otp)
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    existing = (99, "Jane Doe", "jane@example.com", "hash", "janedoe", "https://avatar.png", 0, "jane@upi", True)

    cursor = _FakePasswordlessCursor(
        existing_user=existing,
        active_otp_row=(1, expires, test_hash, 0, 99),
    )
    conn = _FakeConnection(cursor)

    monkeypatch.setattr(auth, "get_connection", lambda: conn)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda req: "10.0.0.1")
    monkeypatch.setattr(auth, "create_access_token", lambda uid, ver: f"token-for-{uid}")

    result = auth.verify_login_otp(
        VerifyLoginOtpRequest(email="jane@example.com", otp=test_otp),
        SimpleNamespace(),
    )

    assert result["access_token"] == "token-for-99"
    assert result["is_new_user"] is False
    assert result["profile_complete"] is True
    assert result["user"]["id"] == 99
    assert result["user"]["username"] == "janedoe"
    assert result["user"]["upi_id"] == "jane@upi"
    assert cursor.token_marked_used is True
    assert conn.committed is True


def test_verify_login_otp_auto_provisions_new_user(monkeypatch):
    test_otp = "654321"
    test_hash = hash_otp(test_otp)
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)

    cursor = _FakePasswordlessCursor(
        existing_user=None,
        active_otp_row=(2, expires, test_hash, 0, None),
    )
    conn = _FakeConnection(cursor)

    monkeypatch.setattr(auth, "get_connection", lambda: conn)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda req: "10.0.0.1")
    monkeypatch.setattr(auth, "create_access_token", lambda uid, ver: f"token-for-{uid}")

    result = auth.verify_login_otp(
        VerifyLoginOtpRequest(email="newuser@example.com", otp=test_otp),
        SimpleNamespace(),
    )

    assert result["access_token"] == "token-for-42"
    assert result["is_new_user"] is True
    assert result["profile_complete"] is False
    assert result["user"]["id"] == 42
    assert cursor.inserted_user is True
    assert cursor.token_marked_used is True
    assert conn.committed is True


def test_verify_login_otp_rejects_incorrect_code(monkeypatch):
    correct_hash = hash_otp("111111")
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)

    cursor = _FakePasswordlessCursor(
        existing_user=None,
        active_otp_row=(3, expires, correct_hash, 1, None),
    )
    conn = _FakeConnection(cursor)

    monkeypatch.setattr(auth, "get_connection", lambda: conn)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda req: "10.0.0.1")

    with pytest.raises(HTTPException) as exc:
        auth.verify_login_otp(
            VerifyLoginOtpRequest(email="user@example.com", otp="999999"),
            SimpleNamespace(),
        )

    assert exc.value.status_code == 400
    assert "Invalid or expired verification code" in exc.value.detail
    assert cursor.updated_otp_attempts == 2


def test_verify_login_otp_locks_out_after_max_attempts(monkeypatch):
    correct_hash = hash_otp("111111")
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)

    # 4 attempts previously failed, this 5th one should invalidate
    cursor = _FakePasswordlessCursor(
        existing_user=None,
        active_otp_row=(4, expires, correct_hash, 4, None),
    )
    conn = _FakeConnection(cursor)

    monkeypatch.setattr(auth, "get_connection", lambda: conn)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda req: "10.0.0.1")

    with pytest.raises(HTTPException) as exc:
        auth.verify_login_otp(
            VerifyLoginOtpRequest(email="user@example.com", otp="999999"),
            SimpleNamespace(),
        )

    assert exc.value.status_code == 400
    assert "Too many incorrect attempts" in exc.value.detail
    assert cursor.updated_otp_attempts == 5


def test_verify_login_otp_rejects_expired_code(monkeypatch):
    correct_hash = hash_otp("111111")
    expired_time = datetime.now(timezone.utc) - timedelta(minutes=1)

    cursor = _FakePasswordlessCursor(
        existing_user=None,
        active_otp_row=(5, expired_time, correct_hash, 0, None),
    )
    conn = _FakeConnection(cursor)

    monkeypatch.setattr(auth, "get_connection", lambda: conn)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda req: "10.0.0.1")

    with pytest.raises(HTTPException) as exc:
        auth.verify_login_otp(
            VerifyLoginOtpRequest(email="user@example.com", otp="111111"),
            SimpleNamespace(),
        )

    assert exc.value.status_code == 400
    assert "expired" in exc.value.detail.lower()


def test_google_account_link_via_otp(monkeypatch):
    test_otp = "789123"
    test_hash = hash_otp(test_otp)
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    existing = (7, "Existing User", "user@example.com", "hash", "existing_user", None, 0, None, True)

    cursor = _FakePasswordlessCursor(
        existing_user=existing,
        active_otp_row=(6, expires, test_hash, 0, 7),
    )
    conn = _FakeConnection(cursor)

    claims = {
        "iss": "https://accounts.google.com",
        "sub": "google-sub-otp",
        "email": "user@example.com",
        "email_verified": True,
        "name": "Existing User",
        "picture": "https://example.com/avatar.png",
    }

    monkeypatch.setattr(auth, "verify_google_id_token", lambda cred: claims)
    monkeypatch.setattr(auth, "get_connection", lambda: conn)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda req: "127.0.0.1")
    monkeypatch.setattr(auth, "create_access_token", lambda uid, ver: "session-token")
    monkeypatch.setattr(auth, "_load_google_user", lambda cur, uid: (7, "Existing User", "user@example.com", "hash", "existing_user", None, 0, None, True))

    result = auth.google_link(
        GoogleLinkRequest(credential="valid-google-cred", otp=test_otp),
        SimpleNamespace(),
    )

    assert result["access_token"] == "session-token"
    assert cursor.token_marked_used is True
    assert conn.committed is True


def test_mask_email_utility():
    assert auth.mask_email("sarah@example.com") == "s***h@e******.com"
    assert auth.mask_email("a@b.com") == "a*@b.com"
    assert auth.mask_email("john.doe@sub.example.com") == "j******e@s**.example.com"
    assert auth.mask_email("invalid") == "***@***"


def test_account_link_required_409_includes_email_and_masked_email(monkeypatch):
    existing = (7, "Existing User", "sarah@example.com", "hash", "sarah", None, 0, None, True)
    cursor = _FakePasswordlessCursor(existing_user=existing)
    conn = _FakeConnection(cursor)

    claims = {
        "iss": "https://accounts.google.com",
        "sub": "google-sub-sarah",
        "email": "sarah@example.com",
        "email_verified": True,
        "name": "Sarah Connor",
        "picture": "https://example.com/avatar.png",
    }

    monkeypatch.setattr(auth, "verify_google_id_token", lambda cred: claims)
    monkeypatch.setattr(auth, "get_connection", lambda: conn)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda req: "127.0.0.1")

    with pytest.raises(HTTPException) as exc:
        auth.google_login(
            auth.GoogleAuthRequest(credential="valid-google-cred"),
            SimpleNamespace(),
        )

    assert exc.value.status_code == 409
    detail = exc.value.detail
    assert detail["code"] == "account_link_required"
    assert detail["email"] == "sarah@example.com"
    assert "masked_email" in detail
    assert "s***h@" in detail["masked_email"]


def test_send_google_link_otp_derives_email_from_token(monkeypatch):
    existing = (7, "Existing User", "sarah@example.com", "hash", "sarah", None, 0, None, True)
    cursor = _FakePasswordlessCursor(existing_user=existing)
    conn = _FakeConnection(cursor)

    claims = {
        "iss": "https://accounts.google.com",
        "sub": "google-sub-sarah",
        "email": "sarah@example.com",
        "email_verified": True,
        "name": "Sarah Connor",
        "picture": "https://example.com/avatar.png",
    }

    monkeypatch.setattr(auth, "verify_google_id_token", lambda cred: claims)
    monkeypatch.setattr(auth, "get_connection", lambda: conn)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda req: "127.0.0.1")

    bg_tasks = BackgroundTasks()
    res = auth.send_google_link_otp(
        auth.GoogleAuthRequest(credential="valid-google-cred"),
        SimpleNamespace(),
        bg_tasks,
    )

    assert res["email"] == "sarah@example.com"
    assert res["masked_email"] == "s***h@e******.com"
    assert cursor.inserted_otp is True
    assert conn.committed is True
    assert len(bg_tasks.tasks) == 1


def test_send_google_link_otp_rejects_non_existent_account(monkeypatch):
    cursor = _FakePasswordlessCursor(existing_user=None)
    conn = _FakeConnection(cursor)

    claims = {
        "iss": "https://accounts.google.com",
        "sub": "google-sub-unregistered",
        "email": "unregistered@example.com",
        "email_verified": True,
        "name": "Unregistered",
    }

    monkeypatch.setattr(auth, "verify_google_id_token", lambda cred: claims)
    monkeypatch.setattr(auth, "get_connection", lambda: conn)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda req: "127.0.0.1")

    bg_tasks = BackgroundTasks()
    with pytest.raises(HTTPException) as exc:
        auth.send_google_link_otp(
            auth.GoogleAuthRequest(credential="valid-google-cred"),
            SimpleNamespace(),
            bg_tasks,
        )

    assert exc.value.status_code == 404
    assert "No existing account found" in exc.value.detail


def test_email_status_in_development(monkeypatch):
    monkeypatch.setattr(auth, "IS_PRODUCTION", False)
    req = SimpleNamespace(headers={})
    res = auth.email_status(req)
    assert "configured" in res
    assert "connected" in res
    assert "authenticated" in res


def test_email_status_in_production_unauthenticated_returns_404(monkeypatch):
    monkeypatch.setattr(auth, "IS_PRODUCTION", True)
    req = SimpleNamespace(headers={})
    with pytest.raises(HTTPException) as exc:
        auth.email_status(req)
    assert exc.value.status_code == 404


def test_email_status_in_production_admin_redacts_credentials(monkeypatch):
    monkeypatch.setattr(auth, "IS_PRODUCTION", True)
    monkeypatch.setattr(auth, "_verify_token_and_get_user_id", lambda token: 1)
    monkeypatch.setenv("ADMIN_EMAIL", "admin@example.com")

    cursor = _FakePasswordlessCursor(existing_user=("admin@example.com",))
    conn = _FakeConnection(cursor)
    monkeypatch.setattr(auth, "get_connection", lambda: conn)

    req = SimpleNamespace(headers={"Authorization": "Bearer admin-token"})
    res = auth.email_status(req)
    assert "configured" in res
    assert "connected" in res
    assert "authenticated" in res
    assert "host" not in res
    assert "user" not in res
    assert "port" not in res


def test_send_login_otp_fails_in_production_when_smtp_unconfigured(monkeypatch):
    monkeypatch.setattr(auth, "IS_PRODUCTION", True)
    monkeypatch.setattr(auth, "smtp_configured", lambda: False)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda req: "127.0.0.1")

    with pytest.raises(HTTPException) as exc:
        auth.send_login_otp(
            SendOtpRequest(email="test@example.com"),
            SimpleNamespace(),
            BackgroundTasks(),
        )
    assert exc.value.status_code == 503
    assert "Email delivery service is currently unavailable" in exc.value.detail


def test_send_google_link_otp_fails_in_production_when_smtp_unconfigured(monkeypatch):
    monkeypatch.setattr(auth, "IS_PRODUCTION", True)
    monkeypatch.setattr(auth, "smtp_configured", lambda: False)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda req: "127.0.0.1")

    with pytest.raises(HTTPException) as exc:
        auth.send_google_link_otp(
            auth.GoogleAuthRequest(credential="mock-credential"),
            SimpleNamespace(),
            BackgroundTasks(),
        )
    assert exc.value.status_code == 503
    assert "Email delivery service is currently unavailable" in exc.value.detail



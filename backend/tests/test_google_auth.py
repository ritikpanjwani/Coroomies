import base64
import json
import os
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-abcdefghijklmnopqrstuvwxyz")
os.environ.setdefault("OTP_PEPPER_KEY", "test-pepper-abcdefghijklmnopqrstuvwxyz")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/coroomies_test")

from app import google_auth
from app.Routers import auth


def _claims(**overrides):
    claims = {
        "iss": "https://accounts.google.com",
        "sub": "google-sub-123",
        "email": "User@Example.com",
        "email_verified": True,
        "iat": datetime.now(timezone.utc).timestamp(),
        "exp": datetime.now(timezone.utc).timestamp() + 300,
        "name": "Example User",
        "picture": "https://example.com/avatar.png",
    }
    claims.update(overrides)
    return claims


def test_google_token_claims_are_normalized(monkeypatch):
    monkeypatch.setattr(google_auth, "GOOGLE_CLIENT_ID", "client-id")
    monkeypatch.setattr(
        google_auth.id_token,
        "verify_oauth2_token",
        lambda credential, request, audience, **kwargs: _claims(),
    )

    identity = google_auth.verify_google_id_token("credential")

    assert identity["sub"] == "google-sub-123"
    assert identity["email"] == "user@example.com"
    assert identity["name"] == "Example User"


def test_google_token_verifier_allows_bounded_clock_skew(monkeypatch):
    observed = {}
    monkeypatch.setattr(google_auth, "GOOGLE_CLIENT_ID", "client-id")

    def verify(credential, request, audience, **kwargs):
        observed.update(kwargs)
        return _claims(iat=datetime.now(timezone.utc).timestamp() + 30)

    monkeypatch.setattr(google_auth.id_token, "verify_oauth2_token", verify)

    google_auth.verify_google_id_token("credential")

    assert observed["clock_skew_in_seconds"] == 60


@pytest.mark.parametrize(
    "claims",
    [
        {"iss": "https://attacker.example"},
        {"email_verified": False},
        {"sub": ""},
        {"exp": datetime.now(timezone.utc).timestamp() - 1},
    ],
)
def test_google_token_rejects_untrusted_claims(monkeypatch, claims):
    monkeypatch.setattr(google_auth, "GOOGLE_CLIENT_ID", "client-id")
    monkeypatch.setattr(
        google_auth.id_token,
        "verify_oauth2_token",
        lambda credential, request, audience, **kwargs: _claims(**claims),
    )

    with pytest.raises(HTTPException) as error:
        google_auth.verify_google_id_token("credential")

    assert error.value.status_code == 401


def test_google_token_verifier_rejects_provider_validation_failure(monkeypatch):
    monkeypatch.setattr(google_auth, "GOOGLE_CLIENT_ID", "client-id")

    def reject(*args, **kwargs):
        raise ValueError("invalid signature")

    monkeypatch.setattr(google_auth.id_token, "verify_oauth2_token", reject)

    with pytest.raises(HTTPException) as error:
        google_auth.verify_google_id_token("credential")

    assert error.value.status_code == 401


def test_google_token_verifier_reports_audience_mismatch_without_exposing_token(monkeypatch):
    monkeypatch.setattr(google_auth, "GOOGLE_CLIENT_ID", "expected-client")

    def reject(*args, **kwargs):
        import base64
        import json

        payload = json.dumps({
            "aud": "different-client",
            "iss": "https://accounts.google.com",
            "exp": datetime.now(timezone.utc).timestamp() + 300,
            "email_verified": True,
        }).encode("utf-8")
        segment = base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")
        raise ValueError(
            "Audience mismatch",
        )

    monkeypatch.setattr(google_auth.id_token, "verify_oauth2_token", reject)

    with pytest.raises(HTTPException) as error:
        google_auth.verify_google_id_token(
            "header." + base64.urlsafe_b64encode(json.dumps({
                "aud": "different-client",
                "iss": "https://accounts.google.com",
                "exp": datetime.now(timezone.utc).timestamp() + 300,
                "email_verified": True,
            }).encode("utf-8")).decode("ascii").rstrip("=") + ".signature"
        )

    assert error.value.status_code == 401
    assert "different OAuth client" in error.value.detail


class _FakeCursor:
    def __init__(self, email_user=None, google_user=None):
        self.email_user = email_user
        self.google_user = google_user
        self.rowcount = 0
        self.updated = False
        self.inserted = False
        self._result = None

    def execute(self, query, params=()):
        if "WHERE google_sub = %s" in query:
            self._result = self.google_user
        elif "lower(email)" in query:
            self._result = self.email_user
        elif "UPDATE users" in query:
            self.updated = True
            self.rowcount = 1
            self._result = None
        elif "INSERT INTO users" in query:
            self.inserted = True
            self._result = (7,)
        elif "SELECT u.id" in query:
            self._result = (7, "Example User", "user@example.com", "hash", "user", None, 0, None, False)
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
        self.cursor_value = cursor
        self.committed = False

    def cursor(self):
        return self.cursor_value

    def commit(self):
        self.committed = True

    def rollback(self):
        pass

    def close(self):
        pass


def test_existing_email_requires_explicit_account_link(monkeypatch):
    cursor = _FakeCursor(email_user=(7, "hash"))
    connection = _FakeConnection(cursor)
    monkeypatch.setattr(auth, "verify_google_id_token", lambda credential: _claims())
    monkeypatch.setattr(auth, "get_connection", lambda: connection)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda request: "127.0.0.1")

    with pytest.raises(HTTPException) as error:
        auth._authenticate_google(
            SimpleNamespace(credential="credential"),
            SimpleNamespace(),
        )

    assert error.value.status_code == 409
    assert error.value.detail["code"] == "account_link_required"
    assert not cursor.updated


def test_account_link_requires_password_and_issues_session(monkeypatch):
    cursor = _FakeCursor(email_user=(7, "hash"))
    connection = _FakeConnection(cursor)
    monkeypatch.setattr(auth, "verify_google_id_token", lambda credential: _claims())
    monkeypatch.setattr(auth, "get_connection", lambda: connection)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda request: "127.0.0.1")
    monkeypatch.setattr(auth, "verify_password", lambda password, stored: password == "correct")
    monkeypatch.setattr(auth, "create_access_token", lambda user_id, version: "session-token")

    result = auth._authenticate_google(
        SimpleNamespace(credential="credential"),
        SimpleNamespace(),
        link_password="correct",
    )

    assert result["access_token"] == "session-token"
    assert result["user"]["id"] == 7
    assert cursor.updated
    assert connection.committed


def test_existing_google_account_issues_session(monkeypatch):
    cursor = _FakeCursor(google_user=(7,))
    connection = _FakeConnection(cursor)
    monkeypatch.setattr(auth, "verify_google_id_token", lambda credential: _claims())
    monkeypatch.setattr(auth, "get_connection", lambda: connection)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda request: "127.0.0.1")
    monkeypatch.setattr(auth, "create_access_token", lambda user_id, version: "session-token")

    result = auth._authenticate_google(
        SimpleNamespace(credential="credential"),
        SimpleNamespace(),
    )

    assert result["access_token"] == "session-token"
    assert result["token_type"] == "bearer"
    assert result["profile_complete"] is False
    assert result["user"]["id"] == 7
    assert connection.committed


def test_new_google_account_is_created_and_issued_session(monkeypatch):
    cursor = _FakeCursor(email_user=None, google_user=None)
    connection = _FakeConnection(cursor)
    monkeypatch.setattr(auth, "verify_google_id_token", lambda credential: _claims())
    monkeypatch.setattr(auth, "get_connection", lambda: connection)
    monkeypatch.setattr(auth, "enforce", lambda *args, **kwargs: None)
    monkeypatch.setattr(auth, "get_client_ip", lambda request: "127.0.0.1")
    monkeypatch.setattr(auth, "create_access_token", lambda user_id, version: "session-token")
    monkeypatch.setattr(auth, "hash_password", lambda password: "random-password-hash")

    result = auth._authenticate_google(
        SimpleNamespace(credential="credential"),
        SimpleNamespace(),
    )

    assert cursor.inserted
    assert result["access_token"] == "session-token"
    assert result["token_type"] == "bearer"
    assert result["user"]["id"] == 7
    assert connection.committed

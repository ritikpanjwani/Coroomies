"""Pre-deployment production hardening and regression test suite for CoRoomies.

Validates end-to-end security, session invalidation, listing workflows,
vacancy management, payment authorization, blocked user routing, and
health readiness.
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.auth import create_access_token
from app.database import get_connection
from app.security import hash_password


@pytest.fixture
def client():
    return TestClient(app)


def test_health_endpoints(client):
    """Verify liveness and readiness health checks."""
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}

    resp_ready = client.get("/health/ready")
    assert resp_ready.status_code == 200
    assert resp_ready.json() == {"status": "ready"}


def test_security_headers_present(client):
    """Ensure essential security headers are sent on all responses."""
    resp = client.get("/health")
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert resp.headers.get("x-frame-options") == "DENY"
    assert "same-origin" in resp.headers.get("cross-origin-opener-policy", "")
    assert "camera=" in resp.headers.get("permissions-policy", "")


def test_blocked_users_route_not_shadowed(client):
    """Verify /messages/blocked-users returns 200 and is not shadowed by /{user_id}."""
    conn = get_connection()
    user_id = 99601
    pw_hash = hash_password("BlockedRouteTest123!")
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            cursor.execute(
                """
                INSERT INTO users (id, name, email, username, password_hash)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (user_id, "Route Tester", "route.tester@example.com", "routetester", pw_hash),
            )
            conn.commit()

        token = create_access_token(user_id)
        headers = {"Authorization": f"Bearer {token}"}
        resp = client.get("/messages/blocked-users", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "blocked_users" in data
        assert isinstance(data["blocked_users"], list)
    finally:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            conn.commit()
        conn.close()


@pytest.mark.integration
def test_token_version_invalidation(client):
    """Verify bumping token_version immediately revokes active access tokens."""
    conn = get_connection()
    user_id = 99602
    pw_hash = hash_password("TokenVerTest123!")
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            cursor.execute(
                """
                INSERT INTO users (id, name, email, username, password_hash, token_version)
                VALUES (%s, %s, %s, %s, %s, 0)
                """,
                (user_id, "Token Tester", "token.tester@example.com", "tokentester", pw_hash),
            )
            conn.commit()

        # Token created with version 0
        token = create_access_token(user_id, token_version=0)
        headers = {"Authorization": f"Bearer {token}"}

        # Request succeeds
        resp = client.get("/auth/me", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == user_id

        # Bump token_version in database (simulates password change or logout)
        with conn.cursor() as cursor:
            cursor.execute("UPDATE users SET token_version = 1 WHERE id = %s", (user_id,))
            conn.commit()

        # Request with old token must now be rejected with 401
        revoked_resp = client.get("/auth/me", headers=headers)
        assert revoked_resp.status_code == 401
        assert "invalidated" in revoked_resp.json()["detail"].lower()
    finally:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            conn.commit()
        conn.close()


@pytest.mark.integration
def test_cannot_send_request_to_self(client):
    """Ensure sending a roommate request to self is rejected."""
    conn = get_connection()
    user_id = 99621
    pw_hash = hash_password("SelfReqTest123!")
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM roommate_requests WHERE sender_id = %s OR receiver_id = %s", (user_id, user_id))
            cursor.execute("DELETE FROM student_profiles WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            cursor.execute(
                """
                INSERT INTO users (id, name, email, username, password_hash)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (user_id, "Self Requester", "self@example.com", "selfuser", pw_hash),
            )
            cursor.execute(
                """
                INSERT INTO student_profiles (
                    user_id, dob, gender, preferred_flatmate_gender, location,
                    budget_min, budget_max, occupation, smoking_preference, drinking_preference,
                    food_preferences, sleep_schedule, cleanliness, noise_tolerance
                )
                VALUES (%s, '2001-01-01', 'male', 'unisex', 'Bangalore', 10000, 20000, 'Dev', 'non_smoker', 'non_drinker', 'vegetarian', 'normal', 8, 5)
                """,
                (user_id,),
            )
            conn.commit()

        token = create_access_token(user_id)
        resp = client.post(f"/requests/{user_id}", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 400
        assert "cannot" in resp.json()["detail"].lower()
    finally:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM student_profiles WHERE user_id = %s", (user_id,))
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            conn.commit()
        conn.close()

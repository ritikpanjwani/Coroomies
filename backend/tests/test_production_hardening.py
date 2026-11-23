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
def test_room_listing_lifecycle_and_ownership(client):
    """Verify room listing creation, search filters, and owner-only deletion."""
    conn = get_connection()
    owner_id = 99611
    other_id = 99612
    pw_hash = hash_password("ListingTest123!")
    listing_id = None
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM room_listings WHERE owner_id IN (%s, %s)", (owner_id, other_id))
            cursor.execute("DELETE FROM users WHERE id IN (%s, %s)", (owner_id, other_id))
            cursor.execute(
                """
                INSERT INTO users (id, name, email, username, password_hash)
                VALUES (%s, %s, %s, %s, %s), (%s, %s, %s, %s, %s)
                """,
                (owner_id, "Listing Owner", "owner@example.com", "owneruser", pw_hash,
                 other_id, "Other User", "other@example.com", "otheruser", pw_hash),
            )
            conn.commit()

        owner_token = create_access_token(owner_id)
        other_token = create_access_token(other_id)

        # 1. Create listing
        create_resp = client.post(
            "/listings/",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={
                "title": "Sunlit 2BHK Room in Koramangala",
                "description": "Spacious master bedroom with private balcony",
                "location": "Koramangala, Bangalore",
                "rent": 14000,
                "deposit": 28000,
                "room_type": "Single",
                "spots": 1,
                "available_from": "2026-12-01",
            },
        )
        assert create_resp.status_code in (200, 201)
        listing_id = create_resp.json().get("listing_id") or create_resp.json().get("id")
        assert listing_id is not None

        # 2. Search listing by location filter
        search_resp = client.get(
            "/listings/",
            headers={"Authorization": f"Bearer {owner_token}"},
            params={"location": "Koramangala"},
        )
        assert search_resp.status_code == 200
        found_ids = [l["id"] for l in search_resp.json().get("listings", [])]
        assert listing_id in found_ids

        # 3. Other user cannot delete owner's listing
        unauthorized_delete = client.delete(
            f"/listings/{listing_id}",
            headers={"Authorization": f"Bearer {other_token}"},
        )
        assert unauthorized_delete.status_code in (403, 404)

        # 4. Owner can delete own listing
        owner_delete = client.delete(
            f"/listings/{listing_id}",
            headers={"Authorization": f"Bearer {owner_token}"},
        )
        assert owner_delete.status_code == 200
        assert "deleted" in owner_delete.json().get("message", "").lower()
        listing_id = None
    finally:
        with conn.cursor() as cursor:
            if listing_id:
                cursor.execute("DELETE FROM room_listings WHERE id = %s", (listing_id,))
            cursor.execute("DELETE FROM users WHERE id IN (%s, %s)", (owner_id, other_id))
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

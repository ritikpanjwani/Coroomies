import json
import os
import sys
import urllib.request
import urllib.error

sys.path.insert(0, "backend")

from app.auth import create_access_token
from app.database import get_connection

BASE_URL = "http://127.0.0.1:8000"

def request_api(path, method="GET", data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            res_body = response.read().decode("utf-8")
            return response.status, json.loads(res_body) if res_body else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            parsed = json.loads(err_body)
        except Exception:
            parsed = {"raw": err_body}
        return e.code, parsed

def test_profile_and_settings_flow():
    print(">>> 1. Fetching test user from database...")
    user_id = None
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, email, username, upi_id, COALESCE(token_version, 0) FROM users ORDER BY id LIMIT 1")
            row = cur.fetchone()
            assert row is not None, "No user found in DB"
            user_id = row[0]
            user_name = row[1]
            user_email = row[2]
            user_uname = row[3]
            user_upi = row[4]
            token_ver = row[5]
            print(f"    User ID: {user_id}, Name: {user_name}, Email: {user_email}, Username: {user_uname}, UPI: {user_upi}")

    token = create_access_token(user_id, token_ver)

    print(">>> 2. Testing GET /settings/...")
    status, data = request_api("/settings/", method="GET", token=token)
    assert status == 200, f"Expected 200, got {status}: {data}"
    assert data["name"] == user_name
    assert data["email"] == user_email
    print(f"    [OK] Settings retrieved successfully (can_change_username: {data.get('can_change_username')})")

    print(">>> 3. Testing PUT /settings/account with invalid UPI ID...")
    status, data = request_api(
        "/settings/account",
        method="PUT",
        data={"name": user_name, "username": user_uname, "upi_id": "invalid_upi_format"},
        token=token,
    )
    assert status == 422, f"Expected 422 for invalid UPI ID, got {status}: {data}"
    print(f"    [OK] Backend correctly rejected invalid UPI format (status {status})")

    print(">>> 4. Testing PUT /settings/account with empty name...")
    status, data = request_api(
        "/settings/account",
        method="PUT",
        data={"name": "   ", "username": user_uname, "upi_id": None},
        token=token,
    )
    assert status == 422, f"Expected 422 for empty name, got {status}: {data}"
    print(f"    [OK] Backend correctly rejected empty name (status {status})")

    print(">>> 5. Testing PUT /settings/account with valid UPI ID...")
    valid_test_upi = "testuser@okhdfcbank"
    status, data = request_api(
        "/settings/account",
        method="PUT",
        data={"name": user_name, "username": user_uname, "upi_id": valid_test_upi},
        token=token,
    )
    assert status == 200, f"Expected 200, got {status}: {data}"
    assert data["upi_id"] == valid_test_upi
    print(f"    [OK] Account details updated with UPI ID: {data['upi_id']}")

    print(">>> 6. Testing GET /profile/...")
    status, prefs_data = request_api("/profile/", method="GET", token=token)
    if status == 404:
        print("    Profile does not exist yet, creating initial profile...")
        create_status, create_data = request_api(
            "/profile/",
            method="POST",
            data={
                "sleep_schedule": "normal",
                "cleanliness": 7,
                "noise_tolerance": 4,
                "study_habits": "morning",
                "smoking_preference": "non_smoker",
                "food_preferences": "vegetarian",
                "social_preferences": "moderate",
                "guest_preferences": "sometimes",
                "work_from_home": "sometimes",
                "study_environment": "low_noise",
                "pets_preference": "no_preference",
            },
            token=token,
        )
        assert create_status == 200, f"Create profile failed: {create_data}"
        status, prefs_data = request_api("/profile/", method="GET", token=token)

    assert status == 200, f"Expected 200, got {status}: {prefs_data}"
    print(f"    [OK] Profile retrieved (cleanliness: {prefs_data.get('cleanliness')}, noise: {prefs_data.get('noise_tolerance')})")

    print(">>> 7. Testing PUT /profile/ with updated living preferences...")
    update_payload = {
        "sleep_schedule": "early",
        "cleanliness": 8,
        "noise_tolerance": 3,
        "study_habits": "morning",
        "smoking_preference": "non_smoker",
        "food_preferences": "vegan",
        "social_preferences": "high",
        "guest_preferences": "often",
        "work_from_home": "most_days",
        "study_environment": "silence",
        "pets_preference": "must_have",
        "college": "IIT Bombay",
        "degree": "B.Tech Computer Science",
        "stream": "Computer Science",
        "year": 2026,
    }
    update_status, update_data = request_api("/profile/", method="PUT", data=update_payload, token=token)
    assert update_status == 200, f"Expected 200, got {update_status}: {update_data}"
    print(f"    [OK] PUT /profile/ succeeded: {update_data}")

    print(">>> 8. Verifying saved preferences persist on GET /profile/...")
    v_status, saved = request_api("/profile/", method="GET", token=token)
    assert v_status == 200
    assert saved["sleep_schedule"] == "early"
    assert saved["cleanliness"] == 8
    assert saved["noise_tolerance"] == 3
    assert saved["food_preferences"] == "vegan"
    assert saved["college"] == "IIT Bombay"
    assert saved["year"] == 2026
    print(f"    [OK] Verified persistence: Cleanliness={saved['cleanliness']}, Food={saved['food_preferences']}, College={saved['college']}, Year={saved['year']}")

    print("\n==============================================")
    print("  ALL PROFILE & SETTINGS TESTS PASSED (100%)  ")
    print("==============================================")
    os._exit(0)

if __name__ == "__main__":
    test_profile_and_settings_flow()

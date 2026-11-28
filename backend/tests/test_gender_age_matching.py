import os
from datetime import date, timedelta
import pytest
from pydantic import ValidationError

from app.profile_models import calculate_age_from_dob
from app.matching import is_gender_compatible, is_age_compatible
from app.Routers.matches import compare_preferences
from app.schemas import ProfileCreate, GenderEnum, PreferredGenderEnum, DrinkingPreference
from app.Routers.profile import compute_profile_completeness


# ============================================================================
# 1. Age Calculation & DOB Validation Tests
# ============================================================================

def test_calculate_age_accurate():
    today = date.today()
    # Exactly 25 years old today
    dob_25 = date(today.year - 25, today.month, today.day)
    assert calculate_age_from_dob(dob_25) == 25

    # Birthday tomorrow (hasn't had birthday this year yet -> 24)
    tomorrow = today + timedelta(days=1)
    dob_almost_25 = date(today.year - 25, tomorrow.month, tomorrow.day)
    assert calculate_age_from_dob(dob_almost_25) == 24

    # String format parsing
    assert calculate_age_from_dob(dob_25.isoformat()) == 25

    # None and invalid inputs
    assert calculate_age_from_dob(None) is None
    assert calculate_age_from_dob("") is None
    assert calculate_age_from_dob("not-a-date") is None


def test_dob_pydantic_validation_future_date():
    today = date.today()
    future_date = today + timedelta(days=5)
    with pytest.raises(ValidationError) as exc:
        ProfileCreate(dob=future_date.isoformat())
    assert "Date of birth cannot be in the future" in str(exc.value)


def test_dob_pydantic_validation_underage():
    today = date.today()
    # 17 years old
    dob_17 = date(today.year - 17, today.month, today.day)
    with pytest.raises(ValidationError) as exc:
        ProfileCreate(dob=dob_17.isoformat())
    assert "must be at least 18 years old" in str(exc.value)


def test_dob_pydantic_validation_over_100():
    today = date.today()
    # 102 years old
    dob_102 = date(today.year - 102, today.month, today.day)
    with pytest.raises(ValidationError) as exc:
        ProfileCreate(dob=dob_102.isoformat())
    assert "maximum age is 100" in str(exc.value)


def test_dob_pydantic_validation_valid():
    today = date.today()
    dob_22 = date(today.year - 22, today.month, today.day)
    p = ProfileCreate(
        dob=dob_22.isoformat(),
        gender=GenderEnum.female,
        preferred_flatmate_gender=PreferredGenderEnum.unisex,
        location="Koramangala, Bangalore",
        budget_min=8000,
        budget_max=15000,
        occupation="Software Engineer",
        drinking_preference=DrinkingPreference.social_drinker,
    )
    assert p.dob == dob_22
    assert p.gender == GenderEnum.female
    assert p.preferred_flatmate_gender == PreferredGenderEnum.unisex
    assert p.location == "Koramangala, Bangalore"
    assert p.budget_min == 8000
    assert p.budget_max == 15000


# ============================================================================
# 2. Mandatory Profile Completeness Tests
# ============================================================================

def test_profile_completeness_empty():
    is_complete, pct, missing = compute_profile_completeness(None, {})
    assert is_complete is False
    assert pct == 0
    assert len(missing) == 7
    assert "Full Name" in missing
    assert "Date of Birth (Age)" in missing
    assert "Gender" in missing
    assert "Preferred Flatmate Gender" in missing
    assert "Location" in missing
    assert "Budget Range" in missing
    assert "Housing Intent" in missing


def test_profile_completeness_partial():
    user_name = "Priya Sharma"
    prof = {
        "dob": "2000-05-15",
        "gender": "female",
        "preferred_flatmate_gender": "female",
        "location": "South Delhi",
        # missing budget, housing intent
    }
    is_complete, pct, missing = compute_profile_completeness(user_name, prof)
    assert is_complete is False
    assert pct < 100
    assert "Budget Range" in missing
    assert "Housing Intent" in missing


def test_profile_completeness_full():
    user_name = "Ritik Panjwani"
    prof = {
        "dob": "2001-08-20",
        "gender": "male",
        "preferred_flatmate_gender": "unisex",
        "location": "Indiranagar, Bangalore",
        "budget_min": 10000,
        "budget_max": 20000,
        "housing_intent": "find_together",
        "occupation": "Product Engineer",
        "smoking_preference": "non_smoker",
        "drinking_preference": "social_drinker",
        "food_preferences": "vegetarian",
        "sleep_schedule": "normal",
        "cleanliness": 4,
    }
    is_complete, pct, missing = compute_profile_completeness(user_name, prof)
    assert is_complete is True
    assert pct == 100
    assert missing == []


# ============================================================================
# 3. Mutual Gender Compatibility Engine Tests
# ============================================================================

def test_gender_compatibility_both_female_seeking_female():
    # User A: Female preferring Female
    # User B: Female preferring Female
    assert is_gender_compatible("female", "female", "female", "female") is True


def test_gender_compatibility_female_excludes_male():
    # User A: Female preferring Female
    # User B: Male preferring Female
    # Even though Male wants Female, Female rejects Male!
    assert is_gender_compatible("female", "female", "male", "female") is False
    # Reverse symmetric check
    assert is_gender_compatible("male", "female", "female", "female") is False


def test_gender_compatibility_both_male_seeking_male():
    # User A: Male preferring Male
    # User B: Male preferring Male
    assert is_gender_compatible("male", "male", "male", "male") is True


def test_gender_compatibility_male_excludes_female():
    # User A: Male preferring Male
    # User B: Female preferring Male
    assert is_gender_compatible("male", "male", "female", "male") is False


def test_gender_compatibility_unisex_matches_reciprocal():
    # User A: Male preferring Unisex
    # User B: Female preferring Unisex
    assert is_gender_compatible("male", "unisex", "female", "unisex") is True

    # User A: Male preferring Unisex
    # User B: Female preferring Male
    # Male accepts Female (Unisex), Female accepts Male -> True!
    assert is_gender_compatible("male", "unisex", "female", "male") is True

    # User A: Male preferring Unisex
    # User B: Female preferring Female
    # Male accepts Female (Unisex), but Female REJECTS Male -> False!
    assert is_gender_compatible("male", "unisex", "female", "female") is False


def test_gender_compatibility_prefer_not_to_say():
    # "Users who select Prefer not to say for their gender should not be automatically classified
    # as male or female. Handle this case conservatively according to matching policy."
    # Can only match with someone who selects unisex!
    assert is_gender_compatible("prefer_not_to_say", "unisex", "male", "unisex") is True
    assert is_gender_compatible("prefer_not_to_say", "unisex", "female", "unisex") is True
    # If other user explicitly wants male, prefer_not_to_say is not classified as male
    assert is_gender_compatible("prefer_not_to_say", "unisex", "male", "male") is False
    # If other user explicitly wants female, prefer_not_to_say is not classified as female
    assert is_gender_compatible("prefer_not_to_say", "unisex", "female", "female") is False


def test_gender_compatibility_missing_data():
    # If either user has not set their gender or preference, cannot verify
    assert is_gender_compatible(None, "unisex", "male", "unisex") is False
    assert is_gender_compatible("male", None, "female", "unisex") is False
    assert is_gender_compatible("male", "unisex", None, "unisex") is False
    assert is_gender_compatible("male", "unisex", "female", None) is False


# ============================================================================
# 4. Age Filtering Tests
# ============================================================================

def test_age_filtering():
    # Within range
    assert is_age_compatible(25, min_age=20, max_age=30) is True
    # At exact boundaries
    assert is_age_compatible(20, min_age=20, max_age=30) is True
    assert is_age_compatible(30, min_age=20, max_age=30) is True
    # Out of range
    assert is_age_compatible(19, min_age=20, max_age=30) is False
    assert is_age_compatible(31, min_age=20, max_age=30) is False
    # Open-ended bounds
    assert is_age_compatible(22, min_age=20, max_age=None) is True
    assert is_age_compatible(18, min_age=20, max_age=None) is False
    assert is_age_compatible(25, min_age=None, max_age=30) is True
    assert is_age_compatible(35, min_age=None, max_age=30) is False
    # No filter configured -> accept all
    assert is_age_compatible(25, min_age=None, max_age=None) is True
    assert is_age_compatible(None, min_age=None, max_age=None) is True
    # If filter configured but candidate age is missing -> reject
    assert is_age_compatible(None, min_age=20, max_age=30) is False


# ============================================================================
# 5. Regression Test: Matching Engine Score
# ============================================================================

def test_compare_preferences_regression():
    my_profile = {
        "sleep_schedule": "early",
        "cleanliness": 5,
        "noise_tolerance": 5,
        "study_habits": "morning",
        "smoking_preference": "non_smoker",
        "food_preferences": "vegetarian",
        "social_preferences": "moderate",
        "guest_preferences": "rarely",
    }
    # Exactly identical profile -> 100%
    score, reasons = compare_preferences(my_profile, my_profile)
    assert score == 100
    assert len(reasons) == 8
    assert all(r["match"] is True for r in reasons)

    # Completely mismatched profile
    other_profile = {
        "sleep_schedule": "late",
        "cleanliness": 1,
        "noise_tolerance": 1,
        "study_habits": "night",
        "smoking_preference": "smoker",
        "food_preferences": "non_vegetarian",
        "social_preferences": "high",
        "guest_preferences": "often",
    }
    score, reasons = compare_preferences(my_profile, other_profile)
    assert score == 0
    assert all(r["match"] is False for r in reasons)


# ============================================================================
# 6. FastAPI Client Integration Tests
# ============================================================================

@pytest.fixture
def test_client():
    from fastapi.testclient import TestClient
    from app.main import app
    return TestClient(app)


@pytest.mark.integration
def test_api_public_profile_never_exposes_dob(test_client):
    """Ensure GET /profile/{target_id} NEVER exposes dob in response."""
    from app.auth import create_access_token
    from app.database import get_connection
    from app.security import hash_password

    conn = get_connection()
    caller_id = 99891
    subject_id = 99892
    pw_hash = hash_password("PrivacyTest123!")

    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM users WHERE id IN (%s, %s)", (caller_id, subject_id))
            cursor.execute(
                """
                INSERT INTO users (id, name, email, password_hash)
                VALUES (%s, %s, %s, %s), (%s, %s, %s, %s)
                """,
                (
                    caller_id, "Privacy Caller", "privacy-caller@example.test", pw_hash,
                    subject_id, "Privacy Subject", "privacy-subject@example.test", pw_hash,
                ),
            )
            cursor.execute(
                """
                INSERT INTO student_profiles (user_id, dob, gender, preferred_flatmate_gender)
                VALUES (%s, %s, %s, %s)
                """,
                (subject_id, "2000-06-15", "female", "female"),
            )
        conn.commit()
    finally:
        conn.close()

    caller_token = create_access_token(caller_id)
    headers = {"Authorization": f"Bearer {caller_token}"}
    response = test_client.get(f"/profile/{subject_id}", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "dob" not in data
    assert "dob" not in data.get("profile", {})
    assert "age" in data.get("profile", {})


@pytest.mark.integration
def test_api_completion_status_endpoint(test_client):
    """Ensure GET /profile/completion-status returns is_complete and missing_fields."""
    from app.auth import create_access_token
    from app.database import get_connection
    from app.security import hash_password

    conn = get_connection()
    user_id = 99893
    pw_hash = hash_password("CompletionTest123!")
    try:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            cursor.execute(
                """
                INSERT INTO users (id, name, email, password_hash)
                VALUES (%s, %s, %s, %s)
                """,
                (user_id, "Completion User", "completion-user@example.test", pw_hash),
            )
        conn.commit()
    finally:
        conn.close()

    token = create_access_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    response = test_client.get("/profile/completion-status", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert "is_complete" in data
    assert "completion_percentage" in data
    assert "missing_fields" in data
    assert isinstance(data["missing_fields"], list)


@pytest.mark.integration
def test_api_gender_filtering_and_mutual_exclusion(test_client):
    """End-to-end integration test verifying that Female preferring Female never sees or gets requested by Male."""
    from app.database import get_connection
    from app.auth import create_access_token
    from app.security import hash_password

    conn = get_connection()
    pw_hash = hash_password("TestPass123!")

    u_alice_id = 99901
    u_bob_id = 99902
    u_clara_id = 99903

    try:
        with conn.cursor() as cursor:
            # Clean up if existing
            cursor.execute("DELETE FROM roommate_requests WHERE sender_id IN (%s, %s, %s) OR receiver_id IN (%s, %s, %s)",
                           (u_alice_id, u_bob_id, u_clara_id, u_alice_id, u_bob_id, u_clara_id))
            cursor.execute("DELETE FROM student_profiles WHERE user_id IN (%s, %s, %s)", (u_alice_id, u_bob_id, u_clara_id))
            cursor.execute("DELETE FROM users WHERE id IN (%s, %s, %s)", (u_alice_id, u_bob_id, u_clara_id))

            # 1. Create Alice: Female, wants Female
            cursor.execute(
                """
                INSERT INTO users (id, name, email, username, password_hash)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (u_alice_id, "Alice Test", "alice.test@example.com", "alice_test", pw_hash),
            )
            cursor.execute(
                """
                INSERT INTO student_profiles (
                    user_id, dob, gender, preferred_flatmate_gender, location,
                    budget_min, budget_max, occupation, smoking_preference, drinking_preference,
                    food_preferences, sleep_schedule, cleanliness, noise_tolerance
                )
                VALUES (%s, '2002-05-10', 'female', 'female', 'Bangalore', 10000, 20000, 'Student', 'non_smoker', 'non_drinker', 'vegetarian', 'normal', 8, 5)
                """,
                (u_alice_id,),
            )

            # 2. Create Bob: Male, wants Female
            cursor.execute(
                """
                INSERT INTO users (id, name, email, username, password_hash)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (u_bob_id, "Bob Test", "bob.test@example.com", "bob_test", pw_hash),
            )
            cursor.execute(
                """
                INSERT INTO student_profiles (
                    user_id, dob, gender, preferred_flatmate_gender, location,
                    budget_min, budget_max, occupation, smoking_preference, drinking_preference,
                    food_preferences, sleep_schedule, cleanliness, noise_tolerance
                )
                VALUES (%s, '2000-02-15', 'male', 'female', 'Bangalore', 10000, 20000, 'Engineer', 'non_smoker', 'non_drinker', 'vegetarian', 'normal', 8, 5)
                """,
                (u_bob_id,),
            )

            # 3. Create Clara: Female, wants Female
            cursor.execute(
                """
                INSERT INTO users (id, name, email, username, password_hash)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (u_clara_id, "Clara Test", "clara.test@example.com", "clara_test", pw_hash),
            )
            cursor.execute(
                """
                INSERT INTO student_profiles (
                    user_id, dob, gender, preferred_flatmate_gender, location,
                    budget_min, budget_max, occupation, smoking_preference, drinking_preference,
                    food_preferences, sleep_schedule, cleanliness, noise_tolerance
                )
                VALUES (%s, '2001-11-20', 'female', 'female', 'Bangalore', 10000, 20000, 'Designer', 'non_smoker', 'non_drinker', 'vegetarian', 'normal', 8, 5)
                """,
                (u_clara_id,),
            )
            conn.commit()

        # Alice token
        alice_token = create_access_token(u_alice_id)
        alice_headers = {"Authorization": f"Bearer {alice_token}"}

        # Alice queries /matches/
        resp = test_client.get("/matches/", headers=alice_headers)
        assert resp.status_code == 200
        matches_data = resp.json()["matches"]
        match_ids = [m["user_id"] for m in matches_data]

        # Clara MUST be in Alice's matches
        assert u_clara_id in match_ids, "Compatible female flatmate should be in matches"
        # Bob MUST NOT be in Alice's matches
        assert u_bob_id not in match_ids, "Incompatible male user must be excluded from female-only preferences"

        # Bob token
        bob_token = create_access_token(u_bob_id)
        bob_headers = {"Authorization": f"Bearer {bob_token}"}

        # Bob attempts direct API call to send request to Alice
        req_resp = test_client.post(f"/requests/{u_alice_id}", headers=bob_headers)
        assert req_resp.status_code == 400
        assert "gender preferences are mutually incompatible" in req_resp.json()["detail"]

        # Clara sends request to Alice -> MUST succeed
        clara_token = create_access_token(u_clara_id)
        clara_headers = {"Authorization": f"Bearer {clara_token}"}
        clara_req_resp = test_client.post(f"/requests/{u_alice_id}", headers=clara_headers)
        assert clara_req_resp.status_code == 200
        assert "request sent" in clara_req_resp.json()["message"].lower()

    finally:
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM roommate_requests WHERE sender_id IN (%s, %s, %s) OR receiver_id IN (%s, %s, %s)",
                           (u_alice_id, u_bob_id, u_clara_id, u_alice_id, u_bob_id, u_clara_id))
            cursor.execute("DELETE FROM student_profiles WHERE user_id IN (%s, %s, %s)", (u_alice_id, u_bob_id, u_clara_id))
            cursor.execute("DELETE FROM users WHERE id IN (%s, %s, %s)", (u_alice_id, u_bob_id, u_clara_id))
            conn.commit()
        conn.close()

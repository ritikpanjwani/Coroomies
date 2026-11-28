import json
from datetime import date
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.database import get_connection
from app.schemas import ProfileCreate
from app.profile_models import calculate_age_from_dob

router = APIRouter(prefix="/profile", tags=["Profile"])

MANDATORY_FIELDS = [
    ("Full Name", lambda u_name, p: bool(u_name and str(u_name).strip())),
    ("Date of Birth (Age)", lambda u_name, p: 18 <= (calculate_age_from_dob(p.get("dob")) or 0) <= 100),
    ("Gender", lambda u_name, p: p.get("gender") in ("male", "female", "prefer_not_to_say")),
    ("Preferred Flatmate Gender", lambda u_name, p: p.get("preferred_flatmate_gender") in ("male", "female", "unisex")),
    ("Location", lambda u_name, p: bool(p.get("location") and str(p.get("location")).strip())),
    ("Budget Range", lambda u_name, p: p.get("budget_min") is not None or p.get("budget_max") is not None),
    ("Housing Intent", lambda u_name, p: p.get("housing_intent") in ("have_flat", "need_room", "find_together")),
]

RECOMMENDED_FIELDS = [
    ("Smoking Preference", lambda u_name, p: bool(p.get("smoking_preference"))),
    ("Drinking Preference", lambda u_name, p: bool(p.get("drinking_preference"))),
    ("Food Preference", lambda u_name, p: bool(p.get("food_preferences"))),
    ("Sleep Schedule", lambda u_name, p: bool(p.get("sleep_schedule"))),
    ("Cleanliness Standard", lambda u_name, p: p.get("cleanliness") is not None),
    ("Noise Tolerance", lambda u_name, p: p.get("noise_tolerance") is not None),
]


def _parse_json_list(val) -> list[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            return [val]
    return []


def compute_profile_completeness(user_name: str | None, profile_dict: dict) -> tuple[bool, int, list[str]]:
    missing = []
    for field_name, validator in MANDATORY_FIELDS:
        if not validator(user_name, profile_dict):
            missing.append(field_name)

    total_required = len(MANDATORY_FIELDS)
    completed_count = total_required - len(missing)
    percentage = int((completed_count / total_required) * 100)
    return len(missing) == 0, percentage, missing


@router.post("/")
def create_profile(
    profile: ProfileCreate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM student_profiles WHERE user_id = %s",
                (user_id,),
            )

            if cursor.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="Profile already exists. Use PUT to update.",
                )

            provided = profile.model_dump(exclude_unset=True)
            cleaned_provided = {
                k: (v.value if hasattr(v, "value") else v)
                for k, v in provided.items()
            }

            # New profiles default to hidden until discovery is explicitly enabled
            if "profile_visibility" not in cleaned_provided or not cleaned_provided["profile_visibility"]:
                cleaned_provided["profile_visibility"] = "hidden"

            # Serialize structured JSON columns
            if "preferred_localities" in cleaned_provided and cleaned_provided["preferred_localities"] is not None:
                cleaned_provided["preferred_localities"] = json.dumps(cleaned_provided["preferred_localities"])
            if "deal_breakers" in cleaned_provided and cleaned_provided["deal_breakers"] is not None:
                cleaned_provided["deal_breakers"] = json.dumps(cleaned_provided["deal_breakers"])

            allowed_columns = [
                "sleep_schedule", "cleanliness", "noise_tolerance", "study_habits",
                "smoking_preference", "food_preferences", "social_preferences", "guest_preferences",
                "work_from_home", "study_environment", "pets_preference", "college", "degree",
                "stream", "year", "dob", "gender", "preferred_flatmate_gender", "location",
                "budget_min", "budget_max", "occupation", "drinking_preference",
                "preferred_age_min", "preferred_age_max",
                "housing_intent", "move_in_date", "preferred_localities", "deal_breakers",
                "bio", "profile_visibility"
            ]
            columns = [c for c in allowed_columns if c in cleaned_provided]
            values = [cleaned_provided[c] for c in columns]

            insert_columns = ", ".join(["user_id"] + columns)
            placeholders = ", ".join(["%s"] * (len(columns) + 1))

            cursor.execute(
                f"""
                INSERT INTO student_profiles ({insert_columns})
                VALUES ({placeholders})
                RETURNING id
                """,
                [user_id] + values,
            )

            profile_id = cursor.fetchone()[0]
            connection.commit()

            return {"message": "Profile created", "profile_id": profile_id}

    except HTTPException:
        connection.rollback()
        raise
    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create profile: {str(e)}",
        )
    finally:
        connection.close()


@router.put("/")
def update_profile(
    profile: ProfileCreate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            provided = profile.model_dump(exclude_unset=True)
            cleaned_provided = {
                k: (v.value if hasattr(v, "value") else v)
                for k, v in provided.items()
            }

            # Serialize structured JSON columns
            if "preferred_localities" in cleaned_provided and cleaned_provided["preferred_localities"] is not None:
                cleaned_provided["preferred_localities"] = json.dumps(cleaned_provided["preferred_localities"])
            if "deal_breakers" in cleaned_provided and cleaned_provided["deal_breakers"] is not None:
                cleaned_provided["deal_breakers"] = json.dumps(cleaned_provided["deal_breakers"])

            allowed_columns = set(ProfileCreate.model_fields)
            columns = [c for c in cleaned_provided if c in allowed_columns]
            if not columns:
                raise HTTPException(status_code=400, detail="No fields to update")

            values = [cleaned_provided[c] for c in columns]
            insert_columns = ", ".join(["user_id"] + columns)
            placeholders = ", ".join(["%s"] * len(columns))
            updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in columns)

            cursor.execute(
                f"""
                INSERT INTO student_profiles ({insert_columns})
                VALUES (%s, {placeholders})
                ON CONFLICT (user_id)
                DO UPDATE SET {updates}
                RETURNING id
                """,
                [user_id] + values,
            )

            updated = cursor.fetchone()
            connection.commit()

            return {
                "message": "Profile updated",
                "profile_id": updated[0],
            }

    except HTTPException:
        connection.rollback()
        raise
    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update profile: {str(e)}",
        )
    finally:
        connection.close()


@router.get("/completion-status")
def get_profile_completion_status(
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            user_row = cursor.fetchone()
            user_name = user_row[0] if user_row else None

            cursor.execute(
                """
                SELECT
                    dob, gender, preferred_flatmate_gender, location,
                    budget_min, budget_max, housing_intent
                FROM student_profiles
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cursor.fetchone()
            if not row:
                is_comp, pct, missing = compute_profile_completeness(user_name, {})
                return {
                    "is_complete": False,
                    "completion_percentage": pct,
                    "missing_fields": missing,
                }

            prof_dict = {
                "dob": row[0],
                "gender": row[1],
                "preferred_flatmate_gender": row[2],
                "location": row[3],
                "budget_min": row[4],
                "budget_max": row[5],
                "housing_intent": row[6],
            }

            is_comp, pct, missing = compute_profile_completeness(user_name, prof_dict)
            return {
                "is_complete": is_comp,
                "completion_percentage": pct,
                "missing_fields": missing,
            }
    finally:
        connection.close()


@router.get("/")
def get_profile(
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT name, email FROM users WHERE id = %s", (user_id,))
            user_row = cursor.fetchone()
            user_name = user_row[0] if user_row else None
            user_email = user_row[1] if user_row else None

            cursor.execute(
                """
                SELECT
                    sleep_schedule,
                    cleanliness,
                    noise_tolerance,
                    study_habits,
                    smoking_preference,
                    food_preferences,
                    social_preferences,
                    guest_preferences,
                    work_from_home,
                    study_environment,
                    pets_preference,
                    college,
                    degree,
                    stream,
                    year,
                    dob,
                    gender,
                    preferred_flatmate_gender,
                    location,
                    budget_min,
                    budget_max,
                    occupation,
                    drinking_preference,
                    preferred_age_min,
                    preferred_age_max,
                    housing_intent,
                    move_in_date,
                    preferred_localities,
                    deal_breakers,
                    bio,
                    profile_visibility
                FROM student_profiles
                WHERE user_id = %s
                """,
                (user_id,),
            )

            profile = cursor.fetchone()

            if not profile:
                is_comp, pct, missing = compute_profile_completeness(user_name, {})
                return {
                    "name": user_name,
                    "email": user_email,
                    "sleep_schedule": None,
                    "cleanliness": None,
                    "noise_tolerance": None,
                    "study_habits": None,
                    "smoking_preference": None,
                    "food_preferences": None,
                    "social_preferences": None,
                    "guest_preferences": None,
                    "work_from_home": None,
                    "study_environment": None,
                    "pets_preference": None,
                    "college": None,
                    "degree": None,
                    "stream": None,
                    "year": None,
                    "dob": None,
                    "age": None,
                    "gender": None,
                    "preferred_flatmate_gender": None,
                    "location": None,
                    "budget_min": None,
                    "budget_max": None,
                    "occupation": None,
                    "drinking_preference": None,
                    "preferred_age_min": None,
                    "preferred_age_max": None,
                    "housing_intent": None,
                    "move_in_date": None,
                    "preferred_localities": [],
                    "deal_breakers": [],
                    "bio": None,
                    "profile_visibility": "hidden",
                    "is_complete": False,
                    "completion_percentage": pct,
                    "missing_fields": missing,
                }

            prof_dict = {
                "sleep_schedule": profile[0],
                "cleanliness": profile[1],
                "noise_tolerance": profile[2],
                "study_habits": profile[3],
                "smoking_preference": profile[4],
                "food_preferences": profile[5],
                "social_preferences": profile[6],
                "guest_preferences": profile[7],
                "work_from_home": profile[8],
                "study_environment": profile[9],
                "pets_preference": profile[10],
                "college": profile[11],
                "degree": profile[12],
                "stream": profile[13],
                "year": profile[14],
                "dob": profile[15].isoformat() if isinstance(profile[15], date) else (str(profile[15]) if profile[15] else None),
                "age": calculate_age_from_dob(profile[15]),
                "gender": profile[16],
                "preferred_flatmate_gender": profile[17],
                "location": profile[18],
                "budget_min": profile[19],
                "budget_max": profile[20],
                "occupation": profile[21],
                "drinking_preference": profile[22],
                "preferred_age_min": profile[23],
                "preferred_age_max": profile[24],
                "housing_intent": profile[25],
                "move_in_date": profile[26],
                "preferred_localities": _parse_json_list(profile[27]),
                "deal_breakers": _parse_json_list(profile[28]),
                "bio": profile[29],
                "profile_visibility": profile[30] or "hidden",
            }

            is_comp, pct, missing = compute_profile_completeness(user_name, prof_dict)
            prof_dict["name"] = user_name
            prof_dict["email"] = user_email
            prof_dict["is_complete"] = is_comp
            prof_dict["completion_percentage"] = pct
            prof_dict["missing_fields"] = missing

            return prof_dict

    finally:
        connection.close()


@router.get("/{target_user_id}")
def get_user_profile(
    target_user_id: int,
    current_user_id: int = Depends(get_current_user_id),
):
    """View another user's public flatmate profile. Strict privacy: DOB is never returned."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, name, avatar_url
                FROM users
                WHERE id = %s
                """,
                (target_user_id,),
            )
            user_row = cursor.fetchone()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")

            # Check if users are connected
            cursor.execute(
                """
                SELECT id, status FROM roommate_requests
                WHERE (sender_id = %s AND receiver_id = %s)
                   OR (sender_id = %s AND receiver_id = %s)
                """,
                (current_user_id, target_user_id, target_user_id, current_user_id),
            )
            req_row = cursor.fetchone()
            is_connected = req_row and req_row[1] == "accepted"

            cursor.execute(
                """
                SELECT
                    sleep_schedule, cleanliness, noise_tolerance, study_habits,
                    smoking_preference, food_preferences, social_preferences, guest_preferences,
                    work_from_home, study_environment, pets_preference, college, degree, stream, year,
                    dob, gender, preferred_flatmate_gender, location, budget_min, budget_max,
                    occupation, drinking_preference, preferred_age_min, preferred_age_max,
                    housing_intent, move_in_date, preferred_localities, deal_breakers,
                    bio, profile_visibility
                FROM student_profiles
                WHERE user_id = %s
                """,
                (target_user_id,),
            )
            profile = cursor.fetchone()

            # Enforce visibility: hidden profiles are private unless viewer is owner or connected
            if profile:
                visibility = profile[30] or "hidden"
                if visibility == "hidden" and current_user_id != target_user_id and not is_connected:
                    raise HTTPException(status_code=404, detail="This profile is private or not discoverable.")

            # Email only revealed if connected
            email = None
            if is_connected:
                cursor.execute("SELECT email FROM users WHERE id = %s", (target_user_id,))
                e_row = cursor.fetchone()
                if e_row:
                    email = e_row[0]

            # DOB is deliberately excluded from public serialization for privacy.
            age = calculate_age_from_dob(profile[15]) if profile else None

            return {
                "user_id": user_row[0],
                "name": user_row[1],
                "email": email,
                "avatar_url": user_row[2],
                "is_connected": is_connected,
                "profile": {
                    "sleep_schedule": profile[0] if profile else None,
                    "cleanliness": profile[1] if profile else None,
                    "noise_tolerance": profile[2] if profile else None,
                    "study_habits": profile[3] if profile else None,
                    "smoking_preference": profile[4] if profile else None,
                    "food_preferences": profile[5] if profile else None,
                    "social_preferences": profile[6] if profile else None,
                    "guest_preferences": profile[7] if profile else None,
                    "work_from_home": profile[8] if profile else None,
                    "study_environment": profile[9] if profile else None,
                    "pets_preference": profile[10] if profile else None,
                    "college": profile[11] if profile else None,
                    "degree": profile[12] if profile else None,
                    "stream": profile[13] if profile else None,
                    "year": profile[14] if profile else None,
                    "age": age,
                    "gender": profile[16] if profile else None,
                    "preferred_flatmate_gender": profile[17] if profile else None,
                    "location": profile[18] if profile else None,
                    "budget_min": profile[19] if profile else None,
                    "budget_max": profile[20] if profile else None,
                    "occupation": profile[21] if profile else None,
                    "drinking_preference": profile[22] if profile else None,
                    "preferred_age_min": profile[23] if profile else None,
                    "preferred_age_max": profile[24] if profile else None,
                    "housing_intent": profile[25] if profile else None,
                    "move_in_date": profile[26] if profile else None,
                    "preferred_localities": _parse_json_list(profile[27]) if profile else [],
                    "deal_breakers": _parse_json_list(profile[28]) if profile else [],
                    "bio": profile[29] if profile else None,
                    "profile_visibility": (profile[30] or "hidden") if profile else "hidden",
                } if profile else None,
            }
    finally:
        connection.close()

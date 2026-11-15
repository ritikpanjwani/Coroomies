from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.database import get_connection
from app.schemas import ProfileCreate

router = APIRouter(prefix="/profile", tags=["Profile"])


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

            cursor.execute(
                """
                INSERT INTO student_profiles (
                    user_id,
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
                    year
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id
                """,
                (
                    user_id,
                    profile.sleep_schedule,
                    profile.cleanliness,
                    profile.noise_tolerance,
                    profile.study_habits,
                    profile.smoking_preference,
                    profile.food_preferences,
                    profile.social_preferences,
                    profile.guest_preferences,
                    profile.work_from_home,
                    profile.study_environment,
                    profile.pets_preference,
                    profile.college,
                    profile.degree,
                    profile.stream,
                    profile.year,
                ),
            )

            profile_id = cursor.fetchone()[0]
            connection.commit()

            return {"message": "Profile created", "profile_id": profile_id}

    except HTTPException:
        connection.rollback()
        raise
    except Exception:
        connection.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to create profile",
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
            # Backward-compatible partial update: only columns explicitly
            # present in the request are changed. Omitted fields keep their
            # stored value, while a field explicitly sent as null is cleared.
            provided = profile.model_dump(exclude_unset=True)
            allowed_columns = set(ProfileCreate.model_fields)
            columns = [c for c in provided if c in allowed_columns]
            if not columns:
                raise HTTPException(status_code=400, detail="No fields to update")

            values = [provided[c] for c in columns]
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
    except Exception:
        connection.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to update profile",
        )
    finally:
        connection.close()

@router.get("/")
def get_profile(
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
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
                    year
                FROM student_profiles
                WHERE user_id = %s
                """,
                (user_id,),
            )

            profile = cursor.fetchone()

            if not profile:
                raise HTTPException(
                    status_code=404,
                    detail="Profile not found",
                )

            return {
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
            }

    finally:
        connection.close()


@router.get("/{target_user_id}")
def get_user_profile(
    target_user_id: int,
    current_user_id: int = Depends(get_current_user_id),
):
    """View another user's public flatmate profile."""
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

            # Email only revealed if connected
            email = None
            if is_connected:
                cursor.execute("SELECT email FROM users WHERE id = %s", (target_user_id,))
                e_row = cursor.fetchone()
                if e_row:
                    email = e_row[0]

            cursor.execute(
                """
                SELECT
                    sleep_schedule, cleanliness, noise_tolerance, study_habits,
                    smoking_preference, food_preferences, social_preferences, guest_preferences,
                    work_from_home, study_environment, pets_preference, college, degree, stream, year
                FROM student_profiles
                WHERE user_id = %s
                """,
                (target_user_id,),
            )
            profile = cursor.fetchone()

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
                } if profile else None,
            }
    finally:
        connection.close()
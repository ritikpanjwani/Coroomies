from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.database import get_connection
from app.Routers.matches import compare_preferences

router = APIRouter(
    prefix="/team-ups",
    tags=["Team Ups"],
)


class TeamUpCreate(BaseModel):
    headline: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    area: str = Field(min_length=1, max_length=200)
    budget_min: int | None = Field(default=None, ge=0)
    budget_max: int | None = Field(default=None, ge=0)


def _profile_dict(cursor, user_id: int):
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
            guest_preferences
        FROM student_profiles
        WHERE user_id = %s
        """,
        (user_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None
    return {
        "sleep_schedule": row[0],
        "cleanliness": row[1],
        "noise_tolerance": row[2],
        "study_habits": row[3],
        "smoking_preference": row[4],
        "food_preferences": row[5],
        "social_preference": row[6],
        "guest_preferences": row[7],
    }


def _row_to_dict(row):
    return {
        "id": row[0],
        "user_id": row[1],
        "user_name": row[2],
        "headline": row[3],
        "description": row[4],
        "area": row[5],
        "budget_min": row[6],
        "budget_max": row[7],
        "created_at": row[8].isoformat() if row[8] else None,
    }


@router.post("/")
def create_team_up(
    data: TeamUpCreate,
    user_id: int = Depends(get_current_user_id),
):
    if data.budget_min is not None and data.budget_max is not None:
        if data.budget_max < data.budget_min:
            raise HTTPException(
                status_code=400,
                detail="Max budget cannot be less than min budget",
            )

    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id FROM team_ups WHERE user_id = %s
                """,
                (user_id,),
            )
            if cursor.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="You already have a team-up post. Delete it before posting a new one.",
                )

            cursor.execute(
                """
                INSERT INTO team_ups
                (user_id, headline, description, area, budget_min, budget_max, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                RETURNING id
                """,
                (
                    user_id,
                    data.headline.strip(),
                    data.description.strip(),
                    data.area.strip(),
                    data.budget_min,
                    data.budget_max,
                ),
            )
            team_up_id = cursor.fetchone()[0]
            connection.commit()

            return {
                "message": "Team-up post created",
                "team_up_id": team_up_id,
            }

    except HTTPException:
        connection.rollback()
        raise
    except Exception:
        connection.rollback()
        raise HTTPException(status_code=500, detail="Failed to create team-up post")
    finally:
        connection.close()


@router.get("/")
def list_team_ups(
    user_id: int = Depends(get_current_user_id),
):
    """Users posting themselves (no place yet) — ranked by compatibility."""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            my_profile = _profile_dict(cursor, user_id)

            cursor.execute(
                """
                SELECT
                    t.id,
                    t.user_id,
                    u.name,
                    t.headline,
                    t.description,
                    t.area,
                    t.budget_min,
                    t.budget_max,
                    t.created_at
                FROM team_ups t
                JOIN users u ON u.id = t.user_id
                WHERE t.user_id != %s
                ORDER BY t.created_at DESC
                """,
                (user_id,),
            )
            rows = cursor.fetchall()

            posts = []
            for row in rows:
                post = _row_to_dict(row)
                compatibility = None
                if my_profile is not None:
                    other_profile = _profile_dict(cursor, post["user_id"])
                    if other_profile is not None:
                        compatibility, _ = compare_preferences(
                            my_profile, other_profile
                        )
                post["compatibility"] = compatibility
                posts.append(post)

            posts.sort(key=lambda p: -(p["compatibility"] or 0))

            return {"team_ups": posts}

    finally:
        connection.close()


@router.get("/mine")
def my_team_up(
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    t.id,
                    t.user_id,
                    u.name,
                    t.headline,
                    t.description,
                    t.area,
                    t.budget_min,
                    t.budget_max,
                    t.created_at
                FROM team_ups t
                JOIN users u ON u.id = t.user_id
                WHERE t.user_id = %s
                """,
                (user_id,),
            )
            row = cursor.fetchone()
            if not row:
                return {"team_up": None}
            return {"team_up": _row_to_dict(row)}

    finally:
        connection.close()


@router.delete("/{team_up_id}")
def delete_team_up(
    team_up_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM team_ups
                WHERE id = %s AND user_id = %s
                RETURNING id
                """,
                (team_up_id, user_id),
            )
            deleted = cursor.fetchone()
            if not deleted:
                raise HTTPException(
                    status_code=404,
                    detail="Team-up post not found or not yours",
                )
            connection.commit()
            return {"message": "Team-up post deleted"}

    finally:
        connection.close()
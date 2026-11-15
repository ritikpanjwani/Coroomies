from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.database import get_connection
from app.group_auth import get_membership, require_active_member, require_admin
from app.Routers.matches import compare_preferences

router = APIRouter(
    prefix="/vacancies",
    tags=["Vacancies"],
)


class OpenSlotsUpdate(BaseModel):
    open_slots: int = Field(ge=0, le=50)


def _get_active_member_ids(cursor, group_id: int):
    cursor.execute(
        """
        SELECT user_id
        FROM group_members
        WHERE group_id = %s AND status = 'active'
        """,
        (group_id,),
    )
    return [row[0] for row in cursor.fetchall()]


def _fetch_profiles(cursor):
    cursor.execute(
        """
        SELECT
            u.id,
            u.name,
            sp.sleep_schedule,
            sp.cleanliness,
            sp.noise_tolerance,
            sp.study_habits,
            sp.smoking_preference,
            sp.food_preferences,
            sp.social_preferences,
            sp.guest_preferences
        FROM users u
        JOIN student_profiles sp ON sp.user_id = u.id
        """
    )
    rows = cursor.fetchall()
    result = {}
    for row in rows:
        result[row[0]] = {
            "name": row[1],
            "profile": {
                "sleep_schedule": row[2],
                "cleanliness": row[3],
                "noise_tolerance": row[4],
                "study_habits": row[5],
                "smoking_preference": row[6],
                "food_preferences": row[7],
                "social_preference": row[8],
                "guest_preferences": row[9],
            },
        }
    return result


def _group_aggregate(profiles):
    numeric = {"cleanliness": [], "noise_tolerance": []}
    counts = {}
    for profile in profiles:
        for f in numeric:
            v = profile[f]
            if v is not None:
                numeric[f].append(int(v))
        for f in ["sleep_schedule", "study_habits", "smoking_preference",
                  "food_preferences", "social_preference", "guest_preferences"]:
            v = profile[f]
            if v is not None:
                key = str(v).lower()
                counts.setdefault(f, {}).setdefault(key, 0)
                counts[f][key] += 1

    agg = {}
    for f in numeric:
        agg[f] = round(sum(numeric[f]) / len(numeric[f])) if numeric[f] else None
    for f in counts:
        agg[f] = max(counts[f], key=counts[f].get) if counts[f] else None
    return agg


@router.get("/")
def list_vacancies(
    user_id: int = Depends(get_current_user_id),
):
    """Living groups with open slots that the user is not a member of."""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    g.id,
                    g.name,
                    g.description,
                    g.open_slots,
                    (
                        SELECT COUNT(*)
                        FROM group_members m
                        WHERE m.group_id = g.id AND m.status = 'active'
                    ) AS active_members
                FROM living_groups g
                WHERE g.open_slots > 0
                  AND g.id NOT IN (
                      SELECT group_id FROM group_members WHERE user_id = %s
                  )
                ORDER BY g.open_slots DESC, g.created_at DESC
                """,
                (user_id,),
            )
            rows = cursor.fetchall()

            profiles = _fetch_profiles(cursor)
            my_profile = profiles.get(user_id, {}).get("profile")

            vacancies = []
            for row in rows:
                group_id = row[0]
                member_ids = _get_active_member_ids(cursor, group_id)
                member_profiles = [
                    profiles[mid]["profile"] for mid in member_ids if mid in profiles
                ]

                fit_score = None
                reasons = []
                if my_profile is not None and member_profiles:
                    aggregate = _group_aggregate(member_profiles)
                    fit_score, reasons = compare_preferences(my_profile, aggregate)

                vacancies.append({
                    "group_id": group_id,
                    "name": row[1],
                    "description": row[2],
                    "open_slots": row[3],
                    "active_members": row[4],
                    "fit_score": fit_score,
                    "reasons": reasons,
                })

            return {"vacancies": vacancies}

    finally:
        connection.close()


@router.get("/{group_id}/candidates")
def group_candidates(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Rank users by fit with a group (admin's reverse-matching view)."""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            require_active_member(cursor, group_id, user_id)

            profiles = _fetch_profiles(cursor)
            member_ids = _get_active_member_ids(cursor, group_id)
            member_profiles = [
                profiles[mid]["profile"] for mid in member_ids if mid in profiles
            ]
            if not member_profiles:
                return {"candidates": []}

            aggregate = _group_aggregate(member_profiles)

            candidates = []
            for oid, data in profiles.items():
                if oid in member_ids:
                    continue
                score, reasons = compare_preferences(aggregate, data["profile"])
                candidates.append({
                    "user_id": oid,
                    "name": data["name"],
                    "compatibility": score,
                    "reasons": reasons,
                })

            candidates.sort(key=lambda x: -x["compatibility"])

            return {
                "group_id": group_id,
                "candidates": candidates,
            }

    finally:
        connection.close()


@router.put("/{group_id}")
def set_open_slots(
    group_id: int,
    data: OpenSlotsUpdate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            require_admin(cursor, group_id, user_id)

            cursor.execute(
                """
                UPDATE living_groups
                SET open_slots = %s
                WHERE id = %s
                """,
                (data.open_slots, group_id),
            )
            connection.commit()

            return {
                "message": "Open slots updated",
                "open_slots": data.open_slots,
            }

    finally:
        connection.close()


@router.post("/{group_id}/apply")
def apply_to_vacancy(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Apply to fill a vacancy in a living group (creates a pending membership)."""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, name, open_slots
                FROM living_groups
                WHERE id = %s
                """,
                (group_id,),
            )
            group = cursor.fetchone()
            if not group:
                raise HTTPException(status_code=404, detail="Group not found")
            if group[2] <= 0:
                raise HTTPException(status_code=400, detail="This group has no open slots")

            existing = get_membership(cursor, group_id, user_id)
            if existing and existing[2] in ["active", "pending"]:
                raise HTTPException(status_code=400, detail="You already have an active or pending membership in this group")

            cursor.execute(
                """
                INSERT INTO group_members
                (group_id, user_id, role, status, joined_at)
                VALUES (%s, %s, 'member', 'pending', NOW())
                RETURNING id
                """,
                (group_id, user_id),
            )
            member_id = cursor.fetchone()[0]

            cursor.execute(
                "SELECT name FROM users WHERE id = %s",
                (user_id,),
            )
            applicant_name = cursor.fetchone()[0]

            cursor.execute(
                """
                SELECT u.id
                FROM group_members gm
                JOIN users u ON u.id = gm.user_id
                WHERE gm.group_id = %s AND gm.role = 'admin'
                """,
                (group_id,),
            )
            admin_ids = [row[0] for row in cursor.fetchall()]

            for admin_id in admin_ids:
                cursor.execute(
                    """
                    INSERT INTO notifications (user_id, title, message, is_read)
                    VALUES (%s, %s, %s, FALSE)
                    """,
                    (
                        admin_id,
                        "New vacancy application",
                        f"{applicant_name} applied to fill a spot in {group[1]}",
                    ),
                )

            connection.commit()

            return {
                "message": "Application sent",
                "member_id": member_id,
                "status": "pending",
            }

    finally:
        connection.close()
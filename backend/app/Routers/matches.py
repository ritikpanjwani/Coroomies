from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.database import get_connection
from app.group_auth import require_active_member
from app.matching import stable_match, find_blocking_pairs

router = APIRouter(
    prefix="/matches",
    tags=["Matches"],
)

PROFILE_FIELDS = [
    "sleep_schedule",
    "cleanliness",
    "noise_tolerance",
    "study_habits",
    "smoking_preference",
    "food_preferences",
    "social_preferences",
    "guest_preferences",
]


class PreferenceUpdate(BaseModel):
    preferred_user_ids: list[int] = Field(default_factory=list)


def _format_preference_val(field: str, val):
    if val is None:
        return "Not set"
    if field in ("cleanliness", "noise_tolerance"):
        return f"{val}/5"
    s = str(val).replace("_", " ").strip()
    return s.title()


def compare_preferences(my_profile, other_profile):

    weights = {
        "sleep_schedule": 20,
        "cleanliness": 15,
        "noise_tolerance": 15,
        "study_habits": 10,
        "smoking_preference": 10,
        "food_preferences": 10,
        "social_preferences": 10,
        "guest_preferences": 10,
    }

    labels = {
        "sleep_schedule": "Sleep schedule",
        "cleanliness": "Cleanliness",
        "noise_tolerance": "Noise tolerance",
        "study_habits": "Study habits",
        "smoking_preference": "Smoking",
        "food_preferences": "Food preference",
        "social_preferences": "Social preference",
        "guest_preferences": "Guests",
    }

    score = 0
    reasons = []

    for field, weight in weights.items():

        my_value = my_profile.get(field) if my_profile.get(field) is not None else my_profile.get("social_preference" if field == "social_preferences" else field)
        other_value = other_profile.get(field) if other_profile.get(field) is not None else other_profile.get("social_preference" if field == "social_preferences" else field)

        if my_value is None or other_value is None:
            reasons.append({
                "field": field,
                "label": labels[field],
                "match": None,
                "my_value": _format_preference_val(field, my_value),
                "other_value": _format_preference_val(field, other_value),
            })
            continue

        if field in ["cleanliness", "noise_tolerance"]:
            try:
                difference = abs(int(my_value) - int(other_value))
            except (ValueError, TypeError):
                difference = 2

            if difference == 0:
                score += weight
                matched = True
            elif difference == 1:
                score += weight * 0.5
                matched = True
            else:
                matched = False
        else:
            matched = (
                str(my_value).strip().lower()
                == str(other_value).strip().lower()
            )
            if matched:
                score += weight

        reasons.append({
            "field": field,
            "label": labels[field],
            "match": matched,
            "my_value": _format_preference_val(field, my_value),
            "other_value": _format_preference_val(field, other_value),
        })

    return round(score), reasons


@router.get("/")
def get_matches(
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            # Get current user's profile
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

            my_row = cursor.fetchone()

            if not my_row:
                return {
                    "matches": []
                }

            my_profile = {
                "sleep_schedule": my_row[0],
                "cleanliness": my_row[1],
                "noise_tolerance": my_row[2],
                "study_habits": my_row[3],
                "smoking_preference": my_row[4],
                "food_preferences": my_row[5],
                "social_preference": my_row[6],
                "social_preferences": my_row[6],
                "guest_preferences": my_row[7],
            }

            # Get everyone else
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
                    sp.guest_preferences,
                    sp.college,
                    sp.degree,
                    sp.stream,
                    sp.year,
                    sp.pets_preference,
                    sp.work_from_home
                FROM users u
                JOIN student_profiles sp
                    ON sp.user_id = u.id
                WHERE u.id != %s
                  AND NOT EXISTS (
                      SELECT 1 FROM blocked_pairs bp
                      WHERE bp.user_a_id = LEAST(u.id, %s) AND bp.user_b_id = GREATEST(u.id, %s)
                  )
                """,
                (user_id, user_id, user_id),
            )

            rows = cursor.fetchall()

            matches = []

            for row in rows:

                other_profile = {
                    "sleep_schedule": row[2],
                    "cleanliness": row[3],
                    "noise_tolerance": row[4],
                    "study_habits": row[5],
                    "smoking_preference": row[6],
                    "food_preferences": row[7],
                    "social_preference": row[8],
                    "social_preferences": row[8],
                    "guest_preferences": row[9],
                }

                compatibility, reasons = compare_preferences(
                    my_profile,
                    other_profile,
                )

                matches.append({
                    "user_id": row[0],
                    "name": row[1],
                    "compatibility": compatibility,
                    "reasons": reasons,
                    "college": row[10] or "",
                    "degree": row[11] or "",
                    "stream": row[12] or "",
                    "year": row[13] or "",
                    "pets_preference": row[14] or "",
                    "work_from_home": row[15] or "",
                })

            # Best matches first
            matches.sort(
                key=lambda x: x["compatibility"],
                reverse=True,
            )

            return {
                "matches": matches
            }

    finally:
        connection.close()


def _fetch_all_profiles(cursor):
    """Return {user_id: (name, profile_dict)} for every user with a profile."""
    cursor.execute(
        f"""
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
    """Average cleanliness/noise, majority vote on exact fields."""
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
        if numeric[f]:
            agg[f] = round(sum(numeric[f]) / len(numeric[f]))
        else:
            agg[f] = None
    for f in counts:
        agg[f] = max(counts[f], key=counts[f].get) if counts[f] else None
    return agg


def _user_preferences(cursor, user_id):
    """Ordered list of preferred user_ids from the user's ranking, best first."""
    cursor.execute(
        """
        SELECT preferred_user_id
        FROM match_preferences
        WHERE user_id = %s
        ORDER BY rank ASC
        """,
        (user_id,),
    )
    return [row[0] for row in cursor.fetchall()]


@router.get("/preferences")
def get_preferences(
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            ranked = _user_preferences(cursor, user_id)
            if not ranked:
                return {"preferences": []}

            cursor.execute(
                f"""
                SELECT u.id, u.name
                FROM users u
                WHERE u.id = ANY(%s)
                """,
                (ranked,),
            )
            name_map = {row[0]: row[1] for row in cursor.fetchall()}

            return {
                "preferences": [
                    {"user_id": uid, "name": name_map.get(uid, "User")}
                    for uid in ranked
                ]
            }

    finally:
        connection.close()


@router.put("/preferences")
def update_preferences(
    data: PreferenceUpdate,
    user_id: int = Depends(get_current_user_id),
):
    if len(set(data.preferred_user_ids)) != len(data.preferred_user_ids):
        raise HTTPException(status_code=400, detail="Duplicate users in ranking")
    if user_id in data.preferred_user_ids:
        raise HTTPException(status_code=400, detail="You cannot rank yourself")

    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            if data.preferred_user_ids:
                cursor.execute(
                    """
                    SELECT id FROM users WHERE id = ANY(%s)
                    """,
                    (data.preferred_user_ids,),
                )
                found = {row[0] for row in cursor.fetchall()}
                missing = [uid for uid in data.preferred_user_ids if uid not in found]
                if missing:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unknown users: {missing}",
                    )

            cursor.execute(
                "DELETE FROM match_preferences WHERE user_id = %s",
                (user_id,),
            )
            for rank, preferred_id in enumerate(data.preferred_user_ids, start=1):
                cursor.execute(
                    """
                    INSERT INTO match_preferences (user_id, preferred_user_id, rank)
                    VALUES (%s, %s, %s)
                    """,
                    (user_id, preferred_id, rank),
                )
            connection.commit()

            return {"message": "Preferences saved", "count": len(data.preferred_user_ids)}

    finally:
        connection.close()


@router.get("/stable")
def get_stable_matching(
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            all_profiles = _fetch_all_profiles(cursor)
            user_ids = list(all_profiles.keys())
            if len(user_ids) < 2:
                return {"pairs": [], "unmatched": [], "blocking_pairs": [], "matches": []}

            # Fetch all blocked pairs so blocked users are not paired
            cursor.execute("SELECT user_a_id, user_b_id FROM blocked_pairs")
            blocked_pairs_set = {(r[0], r[1]) for r in cursor.fetchall()}

            # Build each user's preference list: explicit ranking first,
            # then remaining users sorted by compatibility descending.
            preferences = {}
            compat_map = {}
            for uid in user_ids:
                my_profile = all_profiles[uid]["profile"]
                others = []
                for oid in user_ids:
                    if oid == uid:
                        continue
                    if (min(uid, oid), max(uid, oid)) in blocked_pairs_set:
                        continue
                    score, _ = compare_preferences(my_profile, all_profiles[oid]["profile"])
                    compat_map[(uid, oid)] = score
                    others.append((oid, score))
                others.sort(key=lambda x: -x[1])
                ranked = _user_preferences(cursor, uid)
                explicit = [
                    r for r in ranked
                    if r in all_profiles and r != uid and (min(uid, r), max(uid, r)) not in blocked_pairs_set
                ]
                rest = [oid for oid, _ in others if oid not in explicit]
                preferences[uid] = explicit + rest

            pairs, unmatched = stable_match(preferences)
            blocking = find_blocking_pairs(preferences, pairs)

            # Only the caller's own blocking pairs are returned. Global
            # blocking-pair detection reveals two OTHER users' internal
            # preferences, so any pair the caller is not part of is dropped.
            # pairings of other users are never serialized.
            blocking_with_names = [
                {
                    "user_a_id": bp["user_a_id"],
                    "user_a_name": all_profiles[bp["user_a_id"]]["name"],
                    "user_b_id": bp["user_b_id"],
                    "user_b_name": all_profiles[bp["user_b_id"]]["name"],
                    "reason": bp["reason"],
                }
                for bp in blocking
                if bp["user_a_id"] == user_id or bp["user_b_id"] == user_id
            ]

            my_pair = next(
                (
                    {
                        "partner_id": b if a == user_id else a,
                        "partner_name": all_profiles[b]["name"] if a == user_id else all_profiles[a]["name"],
                        "compatibility": compat_map.get(
                            (user_id, b if a == user_id else a), 0
                        ),
                    }
                    for a, b in pairs
                    if a == user_id or b == user_id
                ),
                None,
            )

            return {
                # Global tables are intentionally not serialized here —
                # the complete pairing graph belongs to no single user and
                # would expose every other user's assignment, scores and
                # blocking reasons. The frontend shows an empty state when
                # these lists are absent.
                "pairs": [],
                "unmatched": [],
                "blocking_pairs": blocking_with_names,
                "my_match": my_pair,
            }

    finally:
        connection.close()


@router.get("/reverse")
def reverse_matching(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Reverse matching: rank users by fit with a living group's aggregate profile."""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id FROM living_groups WHERE id = %s
                """,
                (group_id,),
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Group not found")

            require_active_member(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT gm.user_id
                FROM group_members gm
                WHERE gm.group_id = %s AND gm.status = 'active'
                """,
                (group_id,),
            )
            member_ids = [row[0] for row in cursor.fetchall()]

            all_profiles = _fetch_all_profiles(cursor)
            if not member_ids:
                return {"candidates": []}

            member_profiles = [
                all_profiles[mid]["profile"] for mid in member_ids if mid in all_profiles
            ]
            if not member_profiles:
                return {"candidates": []}

            aggregate = _group_aggregate(member_profiles)

            candidates = []
            for oid, data in all_profiles.items():
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
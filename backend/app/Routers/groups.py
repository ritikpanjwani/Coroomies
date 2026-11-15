import os
import secrets
import string
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.database import get_connection
from app.notification_service import create_notification
from app.group_auth import get_membership, require_active_member, require_admin
from app.image_validation import (
    ALLOWED_EXTENSIONS,
    InvalidImageError,
    detect_image_extension,
    read_limited,
)

router = APIRouter(
    prefix="/groups",
    tags=["Groups"],
)

GROUP_AVATAR_DIR = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "uploads", "groups"
)
os.makedirs(GROUP_AVATAR_DIR, exist_ok=True)

ACTIVE_STATUSES = ["active", "pending"]


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    open_slots: int = Field(default=0, ge=0, le=50)


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class GroupJoin(BaseModel):
    invite_code: str = Field(min_length=1, max_length=12)


class GroupMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class GroupNotificationSettingsUpdate(BaseModel):
    is_muted: bool = False
    mute_messages: bool = False
    mute_expenses: bool = False
    mute_activity: bool = False


class GroupInviteUser(BaseModel):
    user_id: int | None = None
    username_or_email: str | None = None


def _generate_invite_code(cursor) -> str:
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(8))
        cursor.execute(
            "SELECT id FROM living_groups WHERE invite_code = %s",
            (code,),
        )
        if not cursor.fetchone():
            return code


def is_group_muted_for_user(
    cursor, user_id: int, group_id: int, category: str = "activity"
) -> bool:
    cursor.execute(
        """
        SELECT is_muted, mute_messages, mute_expenses, mute_activity
        FROM group_notification_settings
        WHERE user_id = %s AND group_id = %s
        """,
        (user_id, group_id),
    )
    row = cursor.fetchone()
    if not row:
        return False
    is_muted, mute_messages, mute_expenses, mute_activity = row
    if is_muted:
        return True
    if category == "messages" and mute_messages:
        return True
    if category == "expenses" and mute_expenses:
        return True
    if category == "activity" and mute_activity:
        return True
    return False


def _notify(
    cursor,
    user_id: int,
    title: str,
    message: str,
    notification_type: str = "general",
    reference_id: str | None = None,
    reference_type: str | None = "group",
    sender_id: int | None = None,
    sender_name: str | None = None,
    category: str = "activity",
):
    if reference_type == "group" and reference_id:
        try:
            gid = int(reference_id)
            if is_group_muted_for_user(cursor, user_id, gid, category=category):
                return
        except (ValueError, TypeError):
            pass

    create_notification(
        cursor=cursor,
        user_id=user_id,
        title=title,
        message=message,
        notification_type=notification_type,
        reference_id=reference_id,
        reference_type=reference_type,
        sender_id=sender_id,
        sender_name=sender_name,
    )


def _get_group(cursor, group_id: int):
    cursor.execute(
        """
        SELECT id, name, description, invite_code, created_by, created_at, open_slots, avatar_url
        FROM living_groups
        WHERE id = %s
        """,
        (group_id,),
    )
    return cursor.fetchone()


def _require_active_member(cursor, group_id: int, user_id: int):
    return require_active_member(cursor, group_id, user_id)


@router.post("/")
def create_group(
    group: GroupCreate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT COUNT(*) FROM group_members
                WHERE user_id = %s AND status = 'active'
                """,
                (user_id,),
            )
            active_count = cursor.fetchone()[0]
            if active_count >= 15:
                raise HTTPException(
                    status_code=400,
                    detail="You have reached the maximum number of active living groups (15).",
                )

            invite_code = _generate_invite_code(cursor)

            cursor.execute(
                """
                INSERT INTO living_groups
                (name, description, invite_code, created_by, created_at, open_slots)
                VALUES (%s, %s, %s, %s, NOW(), %s)
                RETURNING id
                """,
                (
                    group.name.strip(),
                    group.description.strip() if group.description else None,
                    invite_code,
                    user_id,
                    group.open_slots,
                ),
            )

            group_id = cursor.fetchone()[0]

            cursor.execute(
                """
                INSERT INTO group_members
                (group_id, user_id, role, status, joined_at)
                VALUES (%s, %s, 'admin', 'active', NOW())
                """,
                (group_id, user_id),
            )

            connection.commit()

            return {
                "group_id": group_id,
                "invite_code": invite_code,
            }

    finally:
        connection.close()


@router.get("/")
def get_my_groups(
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT
                    g.id,
                    g.name,
                    g.description,
                    g.invite_code,
                    g.created_at,
                    gm.role,
                    gm.status,
                    (
                        SELECT COUNT(*)
                        FROM group_members m
                        WHERE m.group_id = g.id AND m.status = 'active'
                    ) AS member_count,
                    g.open_slots,
                    g.avatar_url
                FROM group_members gm
                JOIN living_groups g ON g.id = gm.group_id
                WHERE gm.user_id = %s
                  AND gm.status IN ('active', 'pending')
                ORDER BY g.created_at DESC
                """,
                (user_id,),
            )

            rows = cursor.fetchall()

            return {
                "groups": [
                    {
                        "group_id": row[0],
                        "name": row[1],
                        "description": row[2],
                        "invite_code": row[3],
                        "created_at": row[4].isoformat() if row[4] else None,
                        "role": row[5],
                        "status": row[6],
                        "member_count": row[7],
                        "open_slots": row[8],
                        "avatar_url": row[9],
                    }
                    for row in rows
                ]
            }

    finally:
        connection.close()


@router.get("/preview/{invite_code}")
def preview_group_invite(
    invite_code: str,
    user_id: int = Depends(get_current_user_id),
):
    code = invite_code.strip().upper()
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
                    g.avatar_url,
                    g.created_at,
                    (
                        SELECT COUNT(*)
                        FROM group_members m
                        WHERE m.group_id = g.id AND m.status = 'active'
                    ) AS member_count,
                    (
                        SELECT u.name
                        FROM group_members gm
                        JOIN users u ON u.id = gm.user_id
                        WHERE gm.group_id = g.id AND gm.role = 'admin' AND gm.status = 'active'
                        ORDER BY gm.joined_at ASC
                        LIMIT 1
                    ) AS admin_name
                FROM living_groups g
                WHERE g.invite_code = %s
                """,
                (code,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Invalid or expired invite code")

            group_id = row[0]
            membership = get_membership(cursor, group_id, user_id)
            my_status = membership[2] if membership else None
            my_role = membership[1] if membership else None

            can_join = my_status not in ACTIVE_STATUSES

            return {
                "group_id": group_id,
                "name": row[1],
                "description": row[2],
                "open_slots": row[3],
                "avatar_url": row[4],
                "created_at": row[5].isoformat() if row[5] else None,
                "member_count": row[6],
                "admin_name": row[7] or "Group Admin",
                "my_status": my_status,
                "my_role": my_role,
                "already_in_another_group": False,
                "other_group_name": None,
                "can_join": can_join,
            }
    finally:
        connection.close()


@router.get("/{group_id}")
def get_group_detail(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            group = _get_group(cursor, group_id)
            if not group:
                raise HTTPException(status_code=404, detail="Group not found")

            membership = get_membership(cursor, group_id, user_id)
            if not membership:
                raise HTTPException(status_code=403, detail="You are not a member of this group")

            if membership[2] == "pending":
                return {
                    "group": {
                        "id": group[0],
                        "name": group[1],
                        "my_role": membership[1],
                        "my_status": membership[2],
                        "members": [],
                    }
                }
            if membership[2] != "active":
                raise HTTPException(
                    status_code=403,
                    detail="Your membership is not active",
                )

            cursor.execute(
                """
                SELECT
                    gm.id,
                    u.id,
                    u.name,
                    gm.role,
                    gm.status,
                    gm.joined_at,
                    u.avatar_url
                FROM group_members gm
                JOIN users u ON u.id = gm.user_id
                WHERE gm.group_id = %s
                ORDER BY
                    CASE gm.role WHEN 'admin' THEN 0 ELSE 1 END,
                    gm.joined_at ASC
                """,
                (group_id,),
            )

            member_rows = cursor.fetchall()

            # Count total active admins
            admin_count = sum(1 for r in member_rows if r[3] == "admin" and r[4] == "active")

            # Notification settings for current user
            cursor.execute(
                """
                SELECT is_muted, mute_messages, mute_expenses, mute_activity
                FROM group_notification_settings
                WHERE user_id = %s AND group_id = %s
                """,
                (user_id, group_id),
            )
            ns_row = cursor.fetchone()
            notification_settings = {
                "is_muted": ns_row[0] if ns_row else False,
                "mute_messages": ns_row[1] if ns_row else False,
                "mute_expenses": ns_row[2] if ns_row else False,
                "mute_activity": ns_row[3] if ns_row else False,
            }

            return {
                "group": {
                    "id": group[0],
                    "name": group[1],
                    "description": group[2],
                    "invite_code": group[3],
                    "created_at": group[5].isoformat() if group[5] else None,
                    "open_slots": group[6],
                    "avatar_url": group[7],
                    "my_role": membership[1],
                    "my_status": membership[2],
                    "admin_count": admin_count,
                    "notification_settings": notification_settings,
                    "members": [
                        {
                            "member_id": row[0],
                            "user_id": row[1],
                            "name": row[2],
                            "role": row[3],
                            "status": row[4],
                            "joined_at": row[5].isoformat() if row[5] else None,
                            "avatar_url": row[6],
                        }
                        for row in member_rows
                    ],
                }
            }

    finally:
        connection.close()


@router.post("/join")
def join_group(
    join: GroupJoin,
    user_id: int = Depends(get_current_user_id),
):
    code = join.invite_code.strip().upper()

    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM living_groups WHERE invite_code = %s",
                (code,),
            )
            group_row = cursor.fetchone()

            if not group_row:
                raise HTTPException(status_code=404, detail="Invalid invite code")

            group_id = group_row[0]

            existing = get_membership(cursor, group_id, user_id)
            if existing and existing[2] in ACTIVE_STATUSES:
                raise HTTPException(
                    status_code=400,
                    detail="You already have an active or pending membership in this group",
                )

            cursor.execute(
                """
                SELECT COUNT(*) FROM group_members
                WHERE user_id = %s AND status = 'active'
                """,
                (user_id,),
            )
            if cursor.fetchone()[0] >= 15:
                raise HTTPException(
                    status_code=400,
                    detail="You have reached the maximum number of active living groups (15).",
                )

            if existing:
                cursor.execute(
                    """
                    UPDATE group_members
                    SET role = 'member', status = 'pending', joined_at = NOW()
                    WHERE id = %s
                    """,
                    (existing[0],),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO group_members
                    (group_id, user_id, role, status, joined_at)
                    VALUES (%s, %s, 'member', 'pending', NOW())
                    """,
                    (group_id, user_id),
                )

            cursor.execute(
                "SELECT name FROM living_groups WHERE id = %s",
                (group_id,),
            )
            group_name = cursor.fetchone()[0]

            cursor.execute(
                "SELECT name FROM users WHERE id = %s",
                (user_id,),
            )
            requester_name = cursor.fetchone()[0]

            cursor.execute(
                """
                SELECT u.id
                FROM group_members gm
                JOIN users u ON u.id = gm.user_id
                WHERE gm.group_id = %s AND gm.role = 'admin' AND gm.status = 'active'
                """,
                (group_id,),
            )
            admin_ids = [row[0] for row in cursor.fetchall()]

            for admin_id in admin_ids:
                _notify(
                    cursor,
                    admin_id,
                    "New Group Join Request",
                    f"{requester_name} requested to join {group_name}",
                    notification_type="group_join_request",
                    reference_id=str(group_id),
                    reference_type="group",
                    sender_id=user_id,
                    sender_name=requester_name,
                    category="activity",
                )

            _notify(
                cursor,
                user_id,
                "Join Request Sent",
                f"Your request to join {group_name} is pending approval from the admins.",
                notification_type="general",
                reference_id=str(group_id),
                reference_type="group",
                category="activity",
            )

            connection.commit()

            return {
                "message": "Join request sent",
                "status": "pending",
                "group_id": group_id,
            }

    finally:
        connection.close()


@router.get("/{group_id}/invite-candidates")
def get_invite_candidates(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Returns connected roommates who are not currently in any living group."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            require_admin(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT DISTINCT
                    u.id,
                    u.name,
                    u.email,
                    u.avatar_url
                FROM (
                    SELECT receiver_id AS peer_id FROM roommate_requests WHERE sender_id = %s AND status = 'accepted'
                    UNION
                    SELECT sender_id AS peer_id FROM roommate_requests WHERE receiver_id = %s AND status = 'accepted'
                ) peers
                JOIN users u ON u.id = peers.peer_id
                WHERE u.id NOT IN (
                    SELECT gm.user_id FROM group_members gm WHERE gm.group_id = %s AND gm.status = ANY(%s)
                )
                ORDER BY u.name ASC
                """,
                (user_id, user_id, group_id, ACTIVE_STATUSES),
            )
            rows = cursor.fetchall()
            return {
                "candidates": [
                    {
                        "user_id": r[0],
                        "name": r[1],
                        "email": r[2],
                        "avatar_url": r[3],
                    }
                    for r in rows
                ]
            }
    finally:
        connection.close()


@router.post("/{group_id}/invite")
def invite_user_to_group(
    group_id: int,
    body: GroupInviteUser,
    user_id: int = Depends(get_current_user_id),
):
    """Allows group admins to directly invite/add an existing connected user."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            require_admin(cursor, group_id, user_id)

            target_user_id = body.user_id
            if not target_user_id and body.username_or_email:
                search_term = body.username_or_email.strip().lower()
                cursor.execute(
                    "SELECT id FROM users WHERE LOWER(email) = %s OR LOWER(name) = %s LIMIT 1",
                    (search_term, search_term),
                )
                found = cursor.fetchone()
                if not found:
                    raise HTTPException(status_code=404, detail="User not found")
                target_user_id = found[0]

            if not target_user_id:
                raise HTTPException(status_code=400, detail="User ID or email/username required")

            if target_user_id == user_id:
                raise HTTPException(status_code=400, detail="You are already in this group")

            cursor.execute("SELECT name FROM users WHERE id = %s", (target_user_id,))
            user_row = cursor.fetchone()
            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")
            target_name = user_row[0]

            # Check if user already in this group
            existing = get_membership(cursor, group_id, target_user_id)
            if existing and existing[2] in ACTIVE_STATUSES:
                raise HTTPException(status_code=400, detail=f"{target_name} is already in this group")

            cursor.execute(
                "SELECT id FROM group_members WHERE group_id = %s AND user_id = %s",
                (group_id, target_user_id),
            )
            old_mem = cursor.fetchone()
            if old_mem:
                cursor.execute(
                    """
                    UPDATE group_members
                    SET role = 'member', status = 'active', joined_at = NOW()
                    WHERE id = %s
                    RETURNING id
                    """,
                    (old_mem[0],),
                )
                member_id = cursor.fetchone()[0]
            else:
                cursor.execute(
                    """
                    INSERT INTO group_members (group_id, user_id, role, status, joined_at)
                    VALUES (%s, %s, 'member', 'active', NOW())
                    RETURNING id
                    """,
                    (group_id, target_user_id),
                )
                member_id = cursor.fetchone()[0]

            cursor.execute("SELECT name FROM living_groups WHERE id = %s", (group_id,))
            group_name = cursor.fetchone()[0]

            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            admin_name = cursor.fetchone()[0]

            _notify(
                cursor,
                target_user_id,
                f"Added to {group_name}",
                f"{admin_name} added you to the living group {group_name}.",
                notification_type="group_invite",
                reference_id=str(group_id),
                reference_type="group",
                sender_id=user_id,
                sender_name=admin_name,
                category="activity",
            )

            connection.commit()
            return {
                "message": f"{target_name} added to {group_name}!",
                "member_id": member_id,
            }
    finally:
        connection.close()


@router.post("/{group_id}/members/{member_id}/approve")
def approve_member(
    group_id: int,
    member_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            require_admin(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT user_id, status FROM group_members
                WHERE id = %s AND group_id = %s
                """,
                (member_id, group_id),
            )
            target = cursor.fetchone()

            if not target:
                raise HTTPException(status_code=404, detail="Member not found")
            if target[1] != "pending":
                raise HTTPException(status_code=400, detail="Member is not pending approval")

            cursor.execute(
                """
                UPDATE group_members
                SET status = 'active'
                WHERE id = %s
                """,
                (member_id,),
            )

            cursor.execute(
                "SELECT name FROM users WHERE id = %s",
                (target[0],),
            )
            member_name = cursor.fetchone()[0]

            cursor.execute(
                "SELECT name FROM living_groups WHERE id = %s",
                (group_id,),
            )
            group_name = cursor.fetchone()[0]

            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            approver_name_row = cursor.fetchone()
            approver_name = approver_name_row[0] if approver_name_row else "Group Admin"

            _notify(
                cursor,
                target[0],
                f"Joined {group_name}",
                f"Your request to join {group_name} was approved by {approver_name}!",
                notification_type="group_approved",
                reference_id=str(group_id),
                reference_type="group",
                sender_id=user_id,
                sender_name=approver_name,
                category="activity",
            )

            connection.commit()

            return {
                "message": f"{member_name} approved",
            }

    finally:
        connection.close()


@router.post("/{group_id}/members/{member_id}/reject")
def reject_member(
    group_id: int,
    member_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            require_admin(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT user_id, status FROM group_members
                WHERE id = %s AND group_id = %s
                """,
                (member_id, group_id),
            )
            target = cursor.fetchone()

            if not target:
                raise HTTPException(status_code=404, detail="Member not found")
            if target[1] != "pending":
                raise HTTPException(status_code=400, detail="Member is not pending approval")

            cursor.execute(
                "DELETE FROM group_members WHERE id = %s",
                (member_id,),
            )

            cursor.execute(
                "SELECT name FROM living_groups WHERE id = %s",
                (group_id,),
            )
            group_name = cursor.fetchone()[0]

            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            rejector_name_row = cursor.fetchone()
            rejector_name = rejector_name_row[0] if rejector_name_row else "Group Admin"

            _notify(
                cursor,
                target[0],
                f"Request to join {group_name} declined",
                f"Your request to join {group_name} was declined.",
                notification_type="group_rejected",
                reference_id=str(group_id),
                reference_type="group",
                sender_id=user_id,
                sender_name=rejector_name,
                category="activity",
            )

            connection.commit()

            return {"message": "Request declined"}

    finally:
        connection.close()


@router.post("/{group_id}/members/{member_id}/remove")
def remove_member(
    group_id: int,
    member_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            require_admin(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT user_id, role, status FROM group_members
                WHERE id = %s AND group_id = %s
                """,
                (member_id, group_id),
            )
            target = cursor.fetchone()

            if not target:
                raise HTTPException(status_code=404, detail="Member not found")
            if target[0] == user_id:
                raise HTTPException(status_code=400, detail="Cannot remove yourself. Use Leave Group instead.")
            if target[2] != "active":
                raise HTTPException(status_code=400, detail="Member is not active")

            # If target is an admin, ensure at least one other active admin remains
            if target[1] == "admin":
                cursor.execute(
                    """
                    SELECT COUNT(*) FROM group_members
                    WHERE group_id = %s AND role = 'admin' AND status = 'active'
                    """,
                    (group_id,),
                )
                admin_count = cursor.fetchone()[0]
                if admin_count <= 1:
                    raise HTTPException(
                        status_code=400,
                        detail="Cannot remove the only administrator. Promote another member to admin first.",
                    )

            cursor.execute(
                """
                UPDATE group_members
                SET status = 'removed'
                WHERE id = %s
                """,
                (member_id,),
            )

            cursor.execute(
                "SELECT name FROM living_groups WHERE id = %s",
                (group_id,),
            )
            group_name = cursor.fetchone()[0]

            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            admin_name = cursor.fetchone()[0]

            _notify(
                cursor,
                target[0],
                f"Removed from {group_name}",
                f"You were removed from {group_name} by {admin_name}.",
                notification_type="group_removed",
                reference_id=str(group_id),
                reference_type="group",
                sender_id=user_id,
                sender_name=admin_name,
                category="activity",
            )

            connection.commit()

            return {"message": "Member removed"}

    finally:
        connection.close()


@router.post("/{group_id}/members/{member_id}/demote-admin")
def demote_admin(
    group_id: int,
    member_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Allows an admin to demote another admin to regular member if multiple admins exist."""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            require_admin(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT user_id, role, status FROM group_members
                WHERE id = %s AND group_id = %s
                """,
                (member_id, group_id),
            )
            target = cursor.fetchone()

            if not target:
                raise HTTPException(status_code=404, detail="Member not found")
            if target[1] != "admin":
                raise HTTPException(status_code=400, detail="Member is not an admin")
            if target[2] != "active":
                raise HTTPException(status_code=400, detail="Only active members can be modified")

            # Last-admin safeguard
            cursor.execute(
                """
                SELECT COUNT(*) FROM group_members
                WHERE group_id = %s AND role = 'admin' AND status = 'active'
                """,
                (group_id,),
            )
            admin_count = cursor.fetchone()[0]
            if admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot demote the only administrator. The group must have at least one active admin.",
                )

            cursor.execute(
                """
                UPDATE group_members
                SET role = 'member'
                WHERE id = %s
                """,
                (member_id,),
            )

            cursor.execute("SELECT name FROM living_groups WHERE id = %s", (group_id,))
            group_name = cursor.fetchone()[0]

            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            admin_name = cursor.fetchone()[0]

            _notify(
                cursor,
                target[0],
                "Admin Role Updated",
                f"Your role in {group_name} was changed to regular member by {admin_name}.",
                notification_type="group_activity",
                reference_id=str(group_id),
                reference_type="group",
                sender_id=user_id,
                sender_name=admin_name,
                category="activity",
            )

            connection.commit()

            return {"message": "Admin demoted to regular member"}

    finally:
        connection.close()


@router.post("/{group_id}/transfer-admin")
def promote_to_admin(
    group_id: int,
    member_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Promotes an active member to group admin. Multiple admins are fully supported."""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            require_admin(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT user_id, role, status FROM group_members
                WHERE id = %s AND group_id = %s
                """,
                (member_id, group_id),
            )
            target = cursor.fetchone()

            if not target:
                raise HTTPException(status_code=404, detail="Member not found")
            if target[1] == "admin":
                raise HTTPException(status_code=400, detail="Member is already an admin")
            if target[2] != "active":
                raise HTTPException(status_code=400, detail="Only active members can be admins")

            cursor.execute(
                """
                UPDATE group_members
                SET role = 'admin'
                WHERE id = %s
                """,
                (member_id,),
            )

            cursor.execute("SELECT name FROM living_groups WHERE id = %s", (group_id,))
            group_name = cursor.fetchone()[0]

            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            admin_name = cursor.fetchone()[0]

            _notify(
                cursor,
                target[0],
                "Promoted to Group Admin",
                f"You were promoted to group admin in {group_name} by {admin_name}.",
                notification_type="group_activity",
                reference_id=str(group_id),
                reference_type="group",
                sender_id=user_id,
                sender_name=admin_name,
                category="activity",
            )

            connection.commit()

            return {"message": "Member promoted to admin"}

    finally:
        connection.close()


@router.get("/{group_id}/members/{member_id}/profile")
def get_member_profile(
    group_id: int,
    member_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """View member details and preferences from within the living group."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            require_active_member(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT gm.user_id, gm.role, gm.status, gm.joined_at, u.name, u.email, u.avatar_url
                FROM group_members gm
                JOIN users u ON u.id = gm.user_id
                WHERE gm.id = %s AND gm.group_id = %s
                """,
                (member_id, group_id),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Member not found")

            target_uid = row[0]
            cursor.execute(
                """
                SELECT
                    sleep_schedule, cleanliness, noise_tolerance, study_habits,
                    smoking_preference, food_preferences, social_preferences, guest_preferences,
                    college, degree
                FROM student_profiles
                WHERE user_id = %s
                """,
                (target_uid,),
            )
            sp = cursor.fetchone()

            profile_data = {
                "user_id": target_uid,
                "name": row[4],
                "email": row[5] if row[2] == "active" else None,
                "avatar_url": row[6],
                "role": row[1],
                "status": row[2],
                "joined_at": row[3].isoformat() if row[3] else None,
                "sleep_schedule": sp[0] if sp else None,
                "cleanliness": sp[1] if sp else None,
                "noise_tolerance": sp[2] if sp else None,
                "study_habits": sp[3] if sp else None,
                "smoking": sp[4] if sp else None,
                "food_preference": sp[5] if sp else None,
                "social_preferences": sp[6] if sp else None,
                "guest_preferences": sp[7] if sp else None,
                "college": sp[8] if sp else None,
                "degree": sp[9] if sp else None,
            }
            return {"profile": profile_data}
    finally:
        connection.close()


@router.get("/{group_id}/notifications")
def get_group_notification_settings(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            require_active_member(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT is_muted, mute_messages, mute_expenses, mute_activity
                FROM group_notification_settings
                WHERE user_id = %s AND group_id = %s
                """,
                (user_id, group_id),
            )
            row = cursor.fetchone()
            if not row:
                res_data = {
                    "is_muted": False,
                    "mute_messages": False,
                    "mute_expenses": False,
                    "mute_activity": False,
                }
            else:
                res_data = {
                    "is_muted": bool(row[0]),
                    "mute_messages": bool(row[1]),
                    "mute_expenses": bool(row[2]),
                    "mute_activity": bool(row[3]),
                }
            return {
                "settings": res_data,
                **res_data,
            }
    finally:
        connection.close()


@router.put("/{group_id}/notifications")
def update_group_notification_settings(
    group_id: int,
    settings: GroupNotificationSettingsUpdate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            require_active_member(cursor, group_id, user_id)

            cursor.execute(
                """
                INSERT INTO group_notification_settings
                (user_id, group_id, is_muted, mute_messages, mute_expenses, mute_activity, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (user_id, group_id)
                DO UPDATE SET
                    is_muted = EXCLUDED.is_muted,
                    mute_messages = EXCLUDED.mute_messages,
                    mute_expenses = EXCLUDED.mute_expenses,
                    mute_activity = EXCLUDED.mute_activity,
                    updated_at = NOW()
                RETURNING is_muted, mute_messages, mute_expenses, mute_activity
                """,
                (
                    user_id,
                    group_id,
                    settings.is_muted,
                    settings.mute_messages,
                    settings.mute_expenses,
                    settings.mute_activity,
                ),
            )
            row = cursor.fetchone()
            connection.commit()

            return {
                "message": "Notification preferences updated",
                "settings": {
                    "is_muted": row[0],
                    "mute_messages": row[1],
                    "mute_expenses": row[2],
                    "mute_activity": row[3],
                },
            }
    finally:
        connection.close()


@router.put("/{group_id}")
def update_group(
    group_id: int,
    body: GroupUpdate,
    user_id: int = Depends(get_current_user_id),
):
    """Any active admin or member can update group info."""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _require_active_member(cursor, group_id, user_id)

            fields, values = [], []
            if body.name is not None:
                if not body.name.strip():
                    raise HTTPException(status_code=400, detail="Group name cannot be empty")
                fields.append("name = %s")
                values.append(body.name.strip())
            if body.description is not None:
                fields.append("description = %s")
                values.append(body.description.strip() or None)

            if not fields:
                raise HTTPException(status_code=400, detail="Nothing to update")

            values.append(group_id)
            cursor.execute(
                f"UPDATE living_groups SET {', '.join(fields)} WHERE id = %s",
                values,
            )
            connection.commit()

            return {"message": "Group updated"}

    except HTTPException:
        connection.rollback()
        raise
    finally:
        connection.close()


@router.post("/{group_id}/avatar")
def upload_group_avatar(
    group_id: int,
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id),
):
    """Any active member can change the group profile picture."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, PNG, GIF, and WebP images are allowed",
        )

    try:
        contents = read_limited(file.file)
        detected_ext = detect_image_extension(contents)
    except InvalidImageError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            _require_active_member(cursor, group_id, user_id)

            filename = f"group_{group_id}_{uuid.uuid4().hex[:12]}{detected_ext}"
            filepath = os.path.join(GROUP_AVATAR_DIR, filename)

            with open(filepath, "wb") as f:
                f.write(contents)

            avatar_url = f"/uploads/groups/{filename}"

            cursor.execute(
                "SELECT avatar_url FROM living_groups WHERE id = %s",
                (group_id,),
            )
            old = cursor.fetchone()
            if old and old[0]:
                old_path = os.path.join(GROUP_AVATAR_DIR, os.path.basename(old[0]))
                if os.path.exists(old_path):
                    os.remove(old_path)

            cursor.execute(
                "UPDATE living_groups SET avatar_url = %s WHERE id = %s",
                (avatar_url, group_id),
            )
            connection.commit()

            return {"avatar_url": avatar_url}

    except HTTPException:
        connection.rollback()
        raise
    finally:
        connection.close()


@router.delete("/{group_id}/avatar")
def remove_group_avatar(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            _require_active_member(cursor, group_id, user_id)

            cursor.execute(
                "SELECT avatar_url FROM living_groups WHERE id = %s",
                (group_id,),
            )
            row = cursor.fetchone()
            if not row or not row[0]:
                raise HTTPException(status_code=404, detail="No group photo to remove")

            old_path = os.path.join(GROUP_AVATAR_DIR, os.path.basename(row[0]))
            if os.path.exists(old_path):
                os.remove(old_path)

            cursor.execute(
                "UPDATE living_groups SET avatar_url = NULL WHERE id = %s",
                (group_id,),
            )
            connection.commit()

            return {"message": "Group photo removed"}
    except HTTPException:
        connection.rollback()
        raise
    finally:
        connection.close()


@router.post("/{group_id}/leave")
def leave_group(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            membership = get_membership(cursor, group_id, user_id)
            if not membership:
                raise HTTPException(status_code=404, detail="Membership not found")

            if membership[1] == "admin":
                # Check active admin count vs total active members
                cursor.execute(
                    """
                    SELECT COUNT(*) FROM group_members
                    WHERE group_id = %s AND role = 'admin' AND status = 'active'
                    """,
                    (group_id,),
                )
                admin_count = cursor.fetchone()[0]

                cursor.execute(
                    """
                    SELECT COUNT(*) FROM group_members
                    WHERE group_id = %s AND status = 'active'
                    """,
                    (group_id,),
                )
                total_active = cursor.fetchone()[0]

                if admin_count <= 1 and total_active > 1:
                    raise HTTPException(
                        status_code=400,
                        detail="You are the only administrator. Please promote another member to admin before leaving, or delete the group.",
                    )

            cursor.execute(
                """
                UPDATE group_members
                SET status = 'left'
                WHERE id = %s
                """,
                (membership[0],),
            )

            connection.commit()

            return {"message": "You left the group"}

    finally:
        connection.close()


@router.delete("/{group_id}")
def delete_group(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            require_admin(cursor, group_id, user_id)

            cursor.execute(
                "DELETE FROM living_groups WHERE id = %s",
                (group_id,),
            )

            connection.commit()

            return {"message": "Group deleted"}

    finally:
        connection.close()


@router.get("/{group_id}/messages")
def get_group_messages(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _require_active_member(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT
                    m.id,
                    m.sender_id,
                    u.name,
                    m.content,
                    m.created_at,
                    u.avatar_url
                FROM group_messages m
                JOIN users u ON u.id = m.sender_id
                WHERE m.group_id = %s
                ORDER BY m.created_at ASC
                """,
                (group_id,),
            )

            rows = cursor.fetchall()

            return {
                "messages": [
                    {
                        "id": row[0],
                        "sender_id": row[1],
                        "sender_name": row[2],
                        "content": row[3],
                        "created_at": row[4].isoformat() if row[4] else None,
                        "avatar_url": row[5],
                    }
                    for row in rows
                ]
            }

    finally:
        connection.close()


@router.post("/{group_id}/messages")
def send_group_message(
    group_id: int,
    message: GroupMessageCreate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _require_active_member(cursor, group_id, user_id)

            cursor.execute(
                """
                INSERT INTO group_messages
                (group_id, sender_id, content, created_at)
                VALUES (%s, %s, %s, NOW())
                RETURNING id
                """,
                (group_id, user_id, message.content.strip()),
            )

            message_id = cursor.fetchone()[0]

            # Notify active unmuted group members
            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            sender_name_row = cursor.fetchone()
            sender_name = sender_name_row[0] if sender_name_row else "Someone"

            cursor.execute("SELECT name FROM living_groups WHERE id = %s", (group_id,))
            grp_row = cursor.fetchone()
            group_name = grp_row[0] if grp_row else "Group"

            preview = message.content.strip()
            if len(preview) > 55:
                preview = preview[:52] + "..."

            cursor.execute(
                """
                SELECT gm.user_id
                FROM group_members gm
                LEFT JOIN group_notification_settings gns
                    ON gns.user_id = gm.user_id AND gns.group_id = gm.group_id
                WHERE gm.group_id = %s
                  AND gm.status = 'active'
                  AND gm.user_id != %s
                  AND COALESCE(gns.is_muted, FALSE) = FALSE
                  AND COALESCE(gns.mute_messages, FALSE) = FALSE
                """,
                (group_id, user_id),
            )
            members_to_notify = cursor.fetchall()
            for m in members_to_notify:
                create_notification(
                    cursor=cursor,
                    user_id=m[0],
                    title=f"{group_name}: {sender_name}",
                    message=preview,
                    notification_type="group_message",
                    reference_id=str(group_id),
                    reference_type="group",
                    sender_id=user_id,
                    sender_name=sender_name,
                    dedup=True,
                )

            connection.commit()

            return {
                "message": "Message sent",
                "message_id": message_id,
            }

    finally:
        connection.close()

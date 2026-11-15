"""Centralized living-group authorization helpers.

Every group-scoped router must go through these helpers so that membership
status is enforced consistently:

- ``get_membership``        raw lookup (no authorization) — use only for
                            existing-membership checks such as join/leave.
- ``require_active_member`` any group access: the caller must be a member
                            with ``status = 'active'`` (pending/left/removed
                            memberships are never granted access).
- ``require_admin``         admin operations: the caller must be an active
                            member with ``role = 'admin'``.

Helpers raise ``HTTPException`` (403). Routers pass the active transaction's
cursor and rely on their existing exception/rollback handling.
"""

from fastapi import HTTPException


def get_membership(cursor, group_id: int, user_id: int):
    """Return the caller's membership row ``(id, role, status)`` or ``None``."""
    cursor.execute(
        """
        SELECT id, role, status
        FROM group_members
        WHERE group_id = %s AND user_id = %s
        """,
        (group_id, user_id),
    )
    return cursor.fetchone()


def require_active_member(cursor, group_id: int, user_id: int):
    """Return the membership row ``(id, role, status)`` for an *active*
    member, otherwise raise HTTP 403.

    ``pending``, ``left`` and ``removed`` memberships are deliberately
    rejected here: pre-approval joiners and departed members must not be able
    to read or mutate group state.
    """
    membership = get_membership(cursor, group_id, user_id)
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    if membership[2] != "active":
        raise HTTPException(status_code=403, detail="Your membership is not active")
    return membership


def require_admin(cursor, group_id: int, user_id: int):
    """Return the membership row for an *active admin*, otherwise 403.

    Requires ``status = 'active'`` first, so a departed (``left``) or
    deactivated (``removed``) admin loses every admin capability immediately.
    """
    membership = require_active_member(cursor, group_id, user_id)
    if membership[1] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return membership
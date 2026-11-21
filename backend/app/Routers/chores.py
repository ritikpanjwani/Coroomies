import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.auth import get_current_user_id
from app.database import get_connection
from app.group_auth import require_active_member, require_admin
from app.logging_utils import log_exception
from app.schemas import validate_iso_date
from app.timeutils import local_now, local_today

logger = logging.getLogger("coroomies.chores")

router = APIRouter(
    prefix="/chores",
    tags=["Chores"],
)

RECURRING_OPTIONS = ["none", "weekly", "monthly"]

WEEKDAY_LABELS = {
    "0": "Monday",
    "1": "Tuesday",
    "2": "Wednesday",
    "3": "Thursday",
    "4": "Friday",
    "5": "Saturday",
    "6": "Sunday",
}


# ---------------------------------------------------------------------------
# Schedule schemas
# ---------------------------------------------------------------------------

class ScheduleCreate(BaseModel):
    group_id: int
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    assigned_to: int | None = None
    frequency: str = Field(pattern=r"^(weekly|monthly)$")
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    reminder_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$|^$")


class ScheduleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    assigned_to: int | None = None
    frequency: str | None = Field(default=None, pattern=r"^(weekly|monthly)$")
    day_of_week: int | None = None
    day_of_month: int | None = None
    active: bool | None = None
    reminder_time: str | None = Field(default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$|^$")


def _schedule_row_to_dict(row):
    return {
        "id": row[0],
        "group_id": row[1],
        "title": row[2],
        "description": row[3],
        "assigned_to": row[4],
        "assigned_name": row[5],
        "frequency": row[6],
        "day_of_week": row[7],
        "day_of_month": row[8],
        "active": row[9],
        "created_by": row[10],
        "created_at": row[11].isoformat() if row[11] else None,
        "reminder_time": row[12],
        "last_reminder_date": row[13].isoformat() if row[13] else None,
    }


class ChoreCreate(BaseModel):
    group_id: int
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    assigned_to: int | None = None
    due_date: str | None = None
    due_day: int | None = Field(default=None, ge=0, le=6)
    recurring: str = "none"

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, v):
        if v is None:
            return v
        return validate_iso_date(v)


class ChoreUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    assigned_to: int | None = None
    due_date: str | None = None
    due_day: int | None = Field(default=None, ge=0, le=6)
    recurring: str | None = None

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, v):
        if v is None:
            return v
        return validate_iso_date(v)


def _require_membership(cursor, group_id: int, user_id: int):
    return require_active_member(cursor, group_id, user_id)


def _get_active_members(cursor, group_id: int):
    cursor.execute(
        """
        SELECT u.id, u.name
        FROM group_members gm
        JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = %s AND gm.status = 'active'
        ORDER BY gm.joined_at ASC
        """,
        (group_id,),
    )
    return cursor.fetchall()


def _notify(cursor, user_id: int, title: str, message: str):
    cursor.execute(
        """
        INSERT INTO notifications (user_id, title, message, is_read)
        VALUES (%s, %s, %s, FALSE)
        """,
        (user_id, title, message),
    )


def _add_history(cursor, chore_id, group_id, user_id, action, note=None):
    cursor.execute(
        """
        INSERT INTO chore_history (chore_id, group_id, user_id, action, note, created_at)
        VALUES (%s, %s, %s, %s, %s, NOW())
        """,
        (chore_id, group_id, user_id, action, note),
    )


def _row_to_dict(row):
    return {
        "id": row[0],
        "group_id": row[1],
        "title": row[2],
        "description": row[3],
        "assigned_to": row[4],
        "assigned_name": row[5],
        "created_by": row[6],
        "due_date": row[7],
        "due_day": row[8],
        "status": row[9],
        "recurring": row[10],
        "completed_at": row[11],
        "completed_by": row[12],
        "created_at": row[13].isoformat() if row[13] else None,
    }


@router.post("/")
def create_chore(
    chore: ChoreCreate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _require_membership(cursor, chore.group_id, user_id)

            if chore.recurring not in RECURRING_OPTIONS:
                raise HTTPException(status_code=400, detail="Invalid recurrence type")

            if chore.assigned_to is not None:
                # Only group admins may assign duties to members.
                require_admin(cursor, chore.group_id, user_id)
                cursor.execute(
                    """
                    SELECT gm.user_id
                    FROM group_members gm
                    WHERE gm.group_id = %s AND gm.user_id = %s AND gm.status = 'active'
                    """,
                    (chore.group_id, chore.assigned_to),
                )
                if not cursor.fetchone():
                    raise HTTPException(
                        status_code=400,
                        detail="Assigned member is not an active member of this group",
                    )

            cursor.execute(
                """
                INSERT INTO chores
                (group_id, title, description, assigned_to, created_by, due_date, due_day, status, recurring, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', %s, NOW())
                RETURNING id
                """,
                (
                    chore.group_id,
                    chore.title.strip(),
                    chore.description.strip() if chore.description else None,
                    chore.assigned_to,
                    user_id,
                    chore.due_date,
                    chore.due_day,
                    chore.recurring,
                ),
            )
            chore_id = cursor.fetchone()[0]

            _add_history(
                cursor,
                chore_id,
                chore.group_id,
                user_id,
                "created",
            )

            connection.commit()

            return {
                "message": "Household duty created",
                "chore_id": chore_id,
            }

    finally:
        connection.close()


@router.get("/")
def list_chores(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _require_membership(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT
                    c.id,
                    c.group_id,
                    c.title,
                    c.description,
                    c.assigned_to,
                    u.name,
                    c.created_by,
                    c.due_date,
                    c.due_day,
                    c.status,
                    c.recurring,
                    c.completed_at,
                    c.completed_by,
                    c.created_at
                FROM chores c
                LEFT JOIN users u ON u.id = c.assigned_to
                WHERE c.group_id = %s
                ORDER BY
                    CASE c.status WHEN 'pending' THEN 0 ELSE 1 END,
                    c.due_date ASC NULLS LAST,
                    c.id DESC
                """,
                (group_id,),
            )
            rows = cursor.fetchall()

            return {
                "chores": [_row_to_dict(row) for row in rows],
            }

    finally:
        connection.close()


@router.get("/history")
def get_chore_history(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _require_membership(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT
                    h.id,
                    h.chore_id,
                    c.title,
                    h.action,
                    h.note,
                    u.name,
                    h.created_at
                FROM chore_history h
                JOIN chores c ON c.id = h.chore_id
                JOIN users u ON u.id = h.user_id
                WHERE h.group_id = %s
                ORDER BY h.created_at DESC
                LIMIT 100
                """,
                (group_id,),
            )
            rows = cursor.fetchall()

            return {
                "history": [
                    {
                        "id": row[0],
                        "chore_id": row[1],
                        "chore_title": row[2],
                        "action": row[3],
                        "note": row[4],
                        "user_name": row[5],
                        "created_at": row[6].isoformat() if row[6] else None,
                    }
                    for row in rows
                ]
            }

    finally:
        connection.close()


def _next_due_date(recurring: str, current: str | None):
    if not current:
        base = local_today()
    else:
        try:
            base = date.fromisoformat(current)
        except ValueError:
            base = local_today()

    if recurring == "weekly":
        return (base + timedelta(days=7)).isoformat()
    if recurring == "monthly":
        # Advance by ~30 days, clamp to valid month end.
        year = base.year + (base.month == 12)
        month = (base.month % 12) + 1
        day = min(base.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
        return date(year, month, day).isoformat()
    return None


@router.post("/{chore_id}/complete")
def complete_chore(
    chore_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, group_id, title, assigned_to, status, recurring, due_date, due_day
                FROM chores
                WHERE id = %s
                """,
                (chore_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Chore not found")

            (_chore_id, group_id, _title, assigned_to, status, recurring, due_date, due_day) = row
            _require_membership(cursor, group_id, user_id)

            if status == "completed":
                raise HTTPException(status_code=400, detail="Chore is already completed")

            if assigned_to is not None and assigned_to != user_id:
                raise HTTPException(
                    status_code=403,
                    detail="This chore is assigned to another member",
                )

            today = local_today().isoformat()

            if recurring == "none":
                # One-off chore: just mark complete.
                cursor.execute(
                    """
                    UPDATE chores
                    SET status = 'completed', completed_at = %s, completed_by = %s
                    WHERE id = %s
                    """,
                    (today, user_id, chore_id),
                )
                _add_history(cursor, chore_id, group_id, user_id, "completed")
            else:
                # Recurring chore: log completion then roll it forward.
                members = _get_active_members(cursor, group_id)
                if len(members) == 0:
                    raise HTTPException(status_code=400, detail="No active members in group")

                current_idx = next(
                    (i for i, m in enumerate(members) if m[0] == assigned_to),
                    None,
                )
                next_member = members[0][0]
                if current_idx is not None:
                    next_member = members[(current_idx + 1) % len(members)][0]

                _add_history(
                    cursor,
                    chore_id,
                    group_id,
                    user_id,
                    "completed",
                    f"Reassigned to next member",
                )

                next_due = _next_due_date(recurring, due_date)
                next_due_day = due_day
                cursor.execute(
                    """
                    UPDATE chores
                    SET status = 'pending',
                        assigned_to = %s,
                        due_date = %s,
                        due_day = %s,
                        completed_at = %s,
                        completed_by = %s
                    WHERE id = %s
                    """,
                    (next_member, next_due, next_due_day, today, user_id, chore_id),
                )

            connection.commit()

            return {"message": "Household duty completed"}

    finally:
        connection.close()


@router.put("/{chore_id}")
def update_chore(
    chore_id: int,
    update: ChoreUpdate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, group_id, created_by
                FROM chores
                WHERE id = %s
                """,
                (chore_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Chore not found")

            membership = _require_membership(cursor, row[1], user_id)
            is_admin = membership[1] == "admin"
            is_creator = row[2] == user_id

            # Editing task metadata changes another member's obligations and
            # is therefore reserved for its creator or an active group admin.
            if not is_admin and not is_creator:
                raise HTTPException(
                    status_code=403,
                    detail="Only the chore creator or a group admin can edit this chore",
                )

            fields = []
            values = []

            if update.title is not None:
                fields.append("title = %s")
                values.append(update.title.strip())
            if update.description is not None:
                fields.append("description = %s")
                values.append(update.description.strip())
            if update.assigned_to is not None:
                # Assignment changes are an admin-only operation.
                if not is_admin:
                    raise HTTPException(status_code=403, detail="Admin access required to reassign chores")
                cursor.execute(
                    """
                    SELECT gm.user_id
                    FROM group_members gm
                    WHERE gm.group_id = %s AND gm.user_id = %s AND gm.status = 'active'
                    """,
                    (row[1], update.assigned_to),
                )
                if not cursor.fetchone():
                    raise HTTPException(
                        status_code=400,
                        detail="Assigned member is not an active member of this group",
                    )
                fields.append("assigned_to = %s")
                values.append(update.assigned_to)
            if update.due_date is not None:
                fields.append("due_date = %s")
                values.append(update.due_date)
            if update.due_day is not None:
                fields.append("due_day = %s")
                values.append(update.due_day)
            if update.recurring is not None:
                if update.recurring not in RECURRING_OPTIONS:
                    raise HTTPException(status_code=400, detail="Invalid recurrence type")
                fields.append("recurring = %s")
                values.append(update.recurring)
            if not fields:
                raise HTTPException(status_code=400, detail="Nothing to update")

            values.append(chore_id)
            cursor.execute(
                f"UPDATE chores SET {', '.join(fields)} WHERE id = %s",
                values,
            )

            _add_history(cursor, chore_id, row[1], user_id, "updated")

            connection.commit()

            return {"message": "Household duty updated"}

    finally:
        connection.close()


@router.delete("/{chore_id}")
def delete_chore(
    chore_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, group_id, created_by
                FROM chores
                WHERE id = %s
                """,
                (chore_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Chore not found")

            membership = _require_membership(cursor, row[1], user_id)
            if row[2] != user_id and membership[1] != "admin":
                raise HTTPException(
                    status_code=403,
                    detail="Only the creator or a group admin can delete this chore",
                )

            cursor.execute("DELETE FROM chores WHERE id = %s", (chore_id,))
            connection.commit()

            return {"message": "Household duty deleted"}

    finally:
        connection.close()


# ---------------------------------------------------------------------------
# Schedule CRUD
# ---------------------------------------------------------------------------

@router.get("/schedules")
def list_schedules(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            _require_membership(cursor, group_id, user_id)
            cursor.execute(
                """
                SELECT cs.id, cs.group_id, cs.title, cs.description,
                       cs.assigned_to, u.name, cs.frequency, cs.day_of_week,
                       cs.day_of_month, cs.active, cs.created_by, cs.created_at,
                       cs.reminder_time, cs.last_reminder_date
                FROM chore_schedules cs
                LEFT JOIN users u ON u.id = cs.assigned_to
                WHERE cs.group_id = %s
                ORDER BY cs.frequency, cs.day_of_week NULLS LAST, cs.day_of_month NULLS LAST
                """,
                (group_id,),
            )
            return {"schedules": [_schedule_row_to_dict(r) for r in cursor.fetchall()]}
    finally:
        connection.close()


@router.post("/schedules")
def create_schedule(
    body: ScheduleCreate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            _require_membership(cursor, body.group_id, user_id)

            if body.frequency == "weekly" and body.day_of_week is None:
                raise HTTPException(status_code=400, detail="day_of_week is required for weekly schedules")
            if body.frequency == "monthly" and body.day_of_month is None:
                raise HTTPException(status_code=400, detail="day_of_month is required for monthly schedules")
            if body.day_of_week is not None and body.frequency != "weekly":
                raise HTTPException(status_code=400, detail="day_of_week only applies to weekly schedules")
            if body.day_of_month is not None and body.frequency != "monthly":
                raise HTTPException(status_code=400, detail="day_of_month only applies to monthly schedules")

            if body.assigned_to is not None:
                # Only group admins may assign recurring duties.
                require_admin(cursor, body.group_id, user_id)
                cursor.execute(
                    "SELECT 1 FROM group_members WHERE group_id=%s AND user_id=%s AND status='active'",
                    (body.group_id, body.assigned_to),
                )
                if not cursor.fetchone():
                    raise HTTPException(status_code=400, detail="Assigned member is not an active member of this group")

            cursor.execute(
                """
                INSERT INTO chore_schedules
                    (group_id, title, description, assigned_to, frequency,
                     day_of_week, day_of_month, active, created_by, created_at,
                     reminder_time)
                VALUES (%s, %s, %s, %s, %s, %s, %s, TRUE, %s, NOW(), %s)
                RETURNING id
                """,
                (
                    body.group_id,
                    body.title.strip(),
                    body.description.strip() if body.description else None,
                    body.assigned_to,
                    body.frequency,
                    body.day_of_week,
                    body.day_of_month,
                    user_id,
                    body.reminder_time,
                ),
            )
            schedule_id = cursor.fetchone()[0]
            connection.commit()
            return {"message": "Recurring task created", "schedule_id": schedule_id}
    finally:
        connection.close()


@router.put("/schedules/{schedule_id}")
def update_schedule(
    schedule_id: int,
    body: ScheduleUpdate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, group_id, assigned_to FROM chore_schedules WHERE id = %s", (schedule_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Schedule not found")
            membership = _require_membership(cursor, row[1], user_id)
            is_admin = membership[1] == "admin"

            fields, values = [], []
            if body.reminder_time is not None:
                reminder_val = body.reminder_time.strip() or None
                # The assigned member may only change the reminder alarm;
                # everything else is admin-only.
                if not is_admin and row[2] != user_id:
                    raise HTTPException(
                        status_code=403,
                        detail="Only the assigned member or a group admin can change the reminder alarm",
                    )
                fields.append("reminder_time = %s"); values.append(reminder_val)
                fields.append("last_reminder_date = NULL")

            if not is_admin:
                if any(v is not None for v in [body.title, body.description, body.frequency, body.day_of_week, body.day_of_month, body.active]):
                    raise HTTPException(
                        status_code=403,
                        detail="Only group admins can edit recurring duties. You can only change the reminder alarm.",
                    )
                if body.assigned_to is not None:
                    if body.assigned_to != user_id:
                        raise HTTPException(status_code=403, detail="Only group admins can reassign duties")
                    fields.append("assigned_to = %s"); values.append(body.assigned_to)
            else:
                if body.title is not None:
                    fields.append("title = %s"); values.append(body.title.strip())
                if body.description is not None:
                    fields.append("description = %s"); values.append(body.description.strip() or None)
                if body.assigned_to is not None:
                    cursor.execute(
                        "SELECT 1 FROM group_members WHERE group_id=%s AND user_id=%s AND status='active'",
                        (row[1], body.assigned_to),
                    )
                    if not cursor.fetchone():
                        raise HTTPException(status_code=400, detail="Assigned member is not an active member of this group")
                    fields.append("assigned_to = %s"); values.append(body.assigned_to)
                if body.frequency is not None:
                    fields.append("frequency = %s"); values.append(body.frequency)
                if body.day_of_week is not None:
                    fields.append("day_of_week = %s"); values.append(body.day_of_week)
                if body.day_of_month is not None:
                    fields.append("day_of_month = %s"); values.append(body.day_of_month)
                if body.active is not None:
                    fields.append("active = %s"); values.append(body.active)

            if not fields:
                raise HTTPException(status_code=400, detail="Nothing to update")

            values.append(schedule_id)
            cursor.execute(f"UPDATE chore_schedules SET {', '.join(fields)} WHERE id = %s", values)
            connection.commit()
            return {"message": "Schedule updated"}
    finally:
        connection.close()


@router.delete("/schedules/{schedule_id}")
def delete_schedule(
    schedule_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT id, group_id, created_by FROM chore_schedules WHERE id = %s", (schedule_id,))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Schedule not found")
            membership = _require_membership(cursor, row[1], user_id)
            if row[2] != user_id and membership[1] != "admin":
                raise HTTPException(status_code=403, detail="Only the creator or a group admin can delete this schedule")
            cursor.execute("DELETE FROM chore_schedules WHERE id = %s", (schedule_id,))
            connection.commit()
            return {"message": "Schedule deleted"}
    finally:
        connection.close()


# ---------------------------------------------------------------------------
# Generate chores from schedules
# ---------------------------------------------------------------------------

def _next_occurrence(freq: str, day_of_week: int | None, day_of_month: int | None, after: date | None = None) -> str:
    """Return the next ISO date string for a schedule occurrence starting from `after` (inclusive)."""
    today = after or local_today()
    if freq == "weekly" and day_of_week is not None:
        days_ahead = (day_of_week - today.weekday()) % 7
        if days_ahead == 0 and after is not None:
            days_ahead = 7
        target = today + timedelta(days=days_ahead)
        return target.isoformat()
    if freq == "monthly" and day_of_month is not None:
        year, month = today.year, today.month
        max_day = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
        target_day = min(day_of_month, max_day)
        target = date(year, month, target_day)
        if target < today:
            if month == 12:
                year += 1; month = 1
            else:
                month += 1
            max_day = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
            target = date(year, month, min(day_of_month, max_day))
        return target.isoformat()
    return today.isoformat()


@router.post("/schedules/generate")
def generate_from_schedules(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Check all active schedules for the group and create pending chores where none exist yet."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            _require_membership(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT cs.id, cs.title, cs.description, cs.assigned_to,
                       cs.frequency, cs.day_of_week, cs.day_of_month
                FROM chore_schedules cs
                WHERE cs.group_id = %s AND cs.active = TRUE
                """,
                (group_id,),
            )
            schedules = cursor.fetchall()
            created = 0

            for sched in schedules:
                sched_id, title, desc, assigned_to, freq, dow, dom = sched
                next_date_str = _next_occurrence(freq, dow, dom)

                if freq == "weekly":
                    cursor.execute(
                        """
                        SELECT 1 FROM chores
                        WHERE group_id = %s AND title = %s AND status = 'pending'
                          AND due_date = %s
                        LIMIT 1
                        """,
                        (group_id, title, next_date_str),
                    )
                else:
                    # Monthly: skip if a pending chore for this title already
                    # exists in the target month.
                    month_start = next_date_str[:7] + "-01"
                    cursor.execute(
                        """
                        SELECT 1 FROM chores
                        WHERE group_id = %s AND title = %s AND status = 'pending'
                          AND due_date >= %s
                        LIMIT 1
                        """,
                        (group_id, title, month_start),
                    )

                if cursor.fetchone():
                    continue

                due_day_value = dow if freq == "weekly" else None

                cursor.execute(
                    """
                    INSERT INTO chores
                        (group_id, title, description, assigned_to, created_by, due_date, due_day, status, recurring, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', %s, NOW())
                    RETURNING id
                    """,
                    (
                        group_id, title, desc, assigned_to, user_id,
                        next_date_str, due_day_value,
                        freq,
                    ),
                )
                chore_id = cursor.fetchone()[0]
                _add_history(cursor, chore_id, group_id, user_id, "created", "Auto-generated from schedule")

                if assigned_to:
                    _notify(
                        cursor,
                        assigned_to,
                        "New household duty",
                        f"You've been assigned: {title} — due {next_date_str}",
                    )

                created += 1

            connection.commit()
            return {"message": f"{created} chore(s) generated from schedules", "created": created}
    finally:
        connection.close()


# ---------------------------------------------------------------------------
# Due-date reminder alarms
# ---------------------------------------------------------------------------

def _due_date_today(freq: str, day_of_week: int | None, day_of_month: int | None) -> bool:
    """True when the schedule's next occurrence falls on today's date."""
    return _next_occurrence(freq, day_of_week, day_of_month) == local_today().isoformat()


def _send_due_reminders() -> int:
    """Notify each schedule's assignee when it is due today and reminder_time has been reached."""
    connection = get_connection()
    sent = 0
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, title, assigned_to, frequency, day_of_week,
                       day_of_month, reminder_time, last_reminder_date
                FROM chore_schedules
                WHERE active = TRUE
                  AND assigned_to IS NOT NULL
                  AND reminder_time IS NOT NULL
                """,
            )
            schedules = cursor.fetchall()
            now_hhmm = local_now().strftime("%H:%M")
            today = local_today().isoformat()

            for row in schedules:
                sched_id, title, assigned_to, freq, dow, dom, reminder_time, last_reminder_date = row
                if not _due_date_today(freq, dow, dom):
                    continue
                if last_reminder_date and last_reminder_date.isoformat() == today:
                    continue
                if reminder_time > now_hhmm:
                    continue

                _notify(
                    cursor,
                    assigned_to,
                    "Duty reminder",
                    f"Reminder: \"{title}\" is due today",
                )
                cursor.execute(
                    "UPDATE chore_schedules SET last_reminder_date = %s WHERE id = %s",
                    (local_today(), sched_id),
                )
                sent += 1

            connection.commit()
            return sent
    finally:
        connection.close()


def _reminder_loop(stop_event):
    import time as _time

    while not stop_event.is_set():
        try:
            _send_due_reminders()
        except Exception as exc:
            log_exception(logger, "Reminder loop iteration failed", exc)
        _time.sleep(60)


def start_reminder_loop():
    import threading

    stop_event = threading.Event()
    thread = threading.Thread(target=_reminder_loop, args=(stop_event,), daemon=True)
    thread.start()
    return stop_event

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.database import get_connection
from app.group_auth import require_active_member

router = APIRouter(
    prefix="/rules",
    tags=["Rules"],
)


class RuleCreate(BaseModel):
    group_id: int
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    penalty_amount: float = Field(default=0, ge=0)


class RuleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    penalty_amount: float | None = Field(default=None, ge=0)


class ViolationCreate(BaseModel):
    rule_id: int
    user_id: int
    note: str | None = Field(default=None, max_length=300)
    penalty_amount: float | None = Field(default=None, ge=0)


def _require_active_member(cursor, group_id: int, user_id: int):
    return require_active_member(cursor, group_id, user_id)


def _notify(cursor, user_id: int, title: str, message: str):
    cursor.execute(
        """
        INSERT INTO notifications (user_id, title, message, is_read)
        VALUES (%s, %s, %s, FALSE)
        """,
        (user_id, title, message),
    )


def _rule_to_dict(row):
    return {
        "id": row[0],
        "group_id": row[1],
        "title": row[2],
        "description": row[3],
        "penalty_amount": float(row[4]),
        "created_by": row[5],
        "creator_name": row[6],
        "created_at": row[7].isoformat() if row[7] else None,
    }


@router.post("/")
def create_rule(
    rule: RuleCreate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            membership = _require_active_member(cursor, rule.group_id, user_id)
            if membership[1] != "admin":
                raise HTTPException(status_code=403, detail="Only admins can create rules")

            cursor.execute(
                """
                INSERT INTO group_rules
                (group_id, title, description, penalty_amount, created_by, created_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
                RETURNING id
                """,
                (
                    rule.group_id,
                    rule.title.strip(),
                    rule.description.strip() if rule.description else None,
                    rule.penalty_amount,
                    user_id,
                ),
            )
            rule_id = cursor.fetchone()[0]

            connection.commit()

            return {
                "message": "Rule created",
                "rule_id": rule_id,
            }

    finally:
        connection.close()


@router.get("/")
def list_rules(
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
                    r.id,
                    r.group_id,
                    r.title,
                    r.description,
                    r.penalty_amount,
                    r.created_by,
                    u.name,
                    r.created_at
                FROM group_rules r
                JOIN users u ON u.id = r.created_by
                WHERE r.group_id = %s
                ORDER BY r.created_at DESC
                """,
                (group_id,),
            )
            rows = cursor.fetchall()

            return {
                "rules": [_rule_to_dict(row) for row in rows],
            }

    finally:
        connection.close()


@router.put("/{rule_id}")
def update_rule(
    rule_id: int,
    update: RuleUpdate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, group_id
                FROM group_rules
                WHERE id = %s
                """,
                (rule_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Rule not found")

            membership = _require_active_member(cursor, row[1], user_id)
            if membership[1] != "admin":
                raise HTTPException(status_code=403, detail="Only admins can update rules")

            fields = []
            values = []
            if update.title is not None:
                fields.append("title = %s")
                values.append(update.title.strip())
            if update.description is not None:
                fields.append("description = %s")
                values.append(update.description.strip())
            if update.penalty_amount is not None:
                fields.append("penalty_amount = %s")
                values.append(update.penalty_amount)

            if not fields:
                raise HTTPException(status_code=400, detail="Nothing to update")

            values.append(rule_id)
            cursor.execute(
                f"UPDATE group_rules SET {', '.join(fields)} WHERE id = %s",
                values,
            )
            connection.commit()

            return {"message": "Rule updated"}

    finally:
        connection.close()


@router.delete("/{rule_id}")
def delete_rule(
    rule_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, group_id
                FROM group_rules
                WHERE id = %s
                """,
                (rule_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Rule not found")

            membership = _require_active_member(cursor, row[1], user_id)
            if membership[1] != "admin":
                raise HTTPException(status_code=403, detail="Only admins can delete rules")

            cursor.execute("DELETE FROM group_rules WHERE id = %s", (rule_id,))
            connection.commit()

            return {"message": "Rule deleted"}

    finally:
        connection.close()


# -----------------------------
# Violations
# -----------------------------

@router.post("/violations")
def record_violation(
    violation: ViolationCreate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, group_id, title, penalty_amount
                FROM group_rules
                WHERE id = %s
                """,
                (violation.rule_id,),
            )
            rule = cursor.fetchone()
            if not rule:
                raise HTTPException(status_code=404, detail="Rule not found")

            membership = _require_active_member(cursor, rule[1], user_id)
            if membership[1] != "admin":
                raise HTTPException(
                    status_code=403,
                    detail="Only admins can record violations",
                )

            cursor.execute(
                """
                SELECT gm.user_id
                FROM group_members gm
                WHERE gm.group_id = %s AND gm.user_id = %s AND gm.status = 'active'
                """,
                (rule[1], violation.user_id),
            )
            if not cursor.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="Violator is not an active member of this group",
                )

            penalty = violation.penalty_amount if violation.penalty_amount is not None else rule[3]

            cursor.execute(
                """
                INSERT INTO rule_violations
                (rule_id, group_id, user_id, recorded_by, note, penalty_amount, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                RETURNING id
                """,
                (
                    violation.rule_id,
                    rule[1],
                    violation.user_id,
                    user_id,
                    violation.note.strip() if violation.note else None,
                    penalty,
                ),
            )
            violation_id = cursor.fetchone()[0]

            cursor.execute(
                "SELECT name FROM users WHERE id = %s",
                (violation.user_id,),
            )
            violator_name = cursor.fetchone()[0]

            _notify(
                cursor,
                violation.user_id,
                "Rule violation recorded",
                f"A violation of \"{rule[2]}\" was recorded against you"
                + (f" (₹{penalty:.2f} penalty)" if penalty else ""),
            )

            connection.commit()

            return {
                "message": "Violation recorded",
                "violation_id": violation_id,
                "penalty_amount": float(penalty),
            }

    finally:
        connection.close()


@router.get("/violations")
def list_violations(
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
                    v.id,
                    v.rule_id,
                    r.title,
                    v.user_id,
                    u.name,
                    v.recorded_by,
                    ru.name,
                    v.note,
                    v.penalty_amount,
                    v.created_at
                FROM rule_violations v
                JOIN group_rules r ON r.id = v.rule_id
                JOIN users u ON u.id = v.user_id
                JOIN users ru ON ru.id = v.recorded_by
                WHERE v.group_id = %s
                ORDER BY v.created_at DESC
                """,
                (group_id,),
            )
            rows = cursor.fetchall()

            return {
                "violations": [
                    {
                        "id": row[0],
                        "rule_id": row[1],
                        "rule_title": row[2],
                        "user_id": row[3],
                        "user_name": row[4],
                        "recorded_by": row[5],
                        "recorded_by_name": row[6],
                        "note": row[7],
                        "penalty_amount": float(row[8]),
                        "created_at": row[9].isoformat() if row[9] else None,
                    }
                    for row in rows
                ]
            }

    finally:
        connection.close()


@router.delete("/violations/{violation_id}")
def delete_violation(
    violation_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, group_id
                FROM rule_violations
                WHERE id = %s
                """,
                (violation_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Violation not found")

            membership = _require_active_member(cursor, row[1], user_id)
            if membership[1] != "admin":
                raise HTTPException(
                    status_code=403,
                    detail="Only admins can delete violations",
                )

            cursor.execute("DELETE FROM rule_violations WHERE id = %s", (violation_id,))
            connection.commit()

            return {"message": "Violation deleted"}

    finally:
        connection.close()
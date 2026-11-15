from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user_id
from app.database import get_connection
from app.group_auth import require_active_member as _require_active_member
from app.timeutils import local_today

router = APIRouter(
    prefix="/reliability",
    tags=["Reliability"],
)

# Scoring weights
PAYMENT_AGE_DAYS = 7
OVERDUE_SHARE_PENALTY = 10
OVERDUE_CHORE_PENALTY = 10
LATE_CHORE_PENALTY = 5
VIOLATION_PENALTY = 15
ON_TIME_CHORE_BONUS = 5


def _get_member_score(
    cursor,
    group_id: int,
    user_id: int,
):
    today = local_today()

    # --- Payment reliability: overdue unpaid shares ---
    cursor.execute(
        """
        SELECT es.amount
        FROM expense_shares es
        JOIN shared_expenses e ON e.id = es.expense_id
        WHERE es.user_id = %s
          AND e.group_id = %s
          AND es.status = 'pending'
          AND e.created_at::date < %s
        """,
        (user_id, group_id, today - timedelta(days=PAYMENT_AGE_DAYS)),
    )
    overdue_shares = cursor.fetchall()
    overdue_count = len(overdue_shares)
    overdue_amount = sum(float(r[0]) for r in overdue_shares)

    # --- Settlements paid in last 60 days (positive signal) ---
    cursor.execute(
        """
        SELECT COUNT(*)
        FROM expense_settlements
        WHERE payer_id = %s AND group_id = %s
          AND settled_at >= %s
        """,
        (
            user_id,
            group_id,
            (today - timedelta(days=60)).isoformat(),
        ),
    )
    settlements_paid = cursor.fetchone()[0]

    # --- Chore reliability ---
    cursor.execute(
        """
        SELECT COUNT(*)
        FROM chore_history
        WHERE user_id = %s AND group_id = %s AND action = 'completed'
          AND created_at::date >= %s
        """,
        (user_id, group_id, today - timedelta(days=30)),
    )
    chores_completed = cursor.fetchone()[0]

    cursor.execute(
        """
        SELECT COUNT(*)
        FROM chores
        WHERE assigned_to = %s
          AND group_id = %s
          AND status = 'pending'
          AND due_date IS NOT NULL
          AND due_date < %s
        """,
        (user_id, group_id, today.isoformat()),
    )
    overdue_chores = cursor.fetchone()[0]

    # --- Rule violations in last 90 days ---
    cursor.execute(
        """
        SELECT COUNT(*)
        FROM rule_violations
        WHERE user_id = %s AND group_id = %s
          AND created_at::date >= %s
        """,
        (user_id, group_id, today - timedelta(days=90)),
    )
    violations = cursor.fetchone()[0]

    score = 100.0
    deductions = []

    if overdue_shares:
        score -= OVERDUE_SHARE_PENALTY * min(overdue_count, 5)
        deductions.append(
            f"{OVERDUE_SHARE_PENALTY * min(overdue_count, 5):.0f} pts — {overdue_count} unpaid share(s) overdue >{PAYMENT_AGE_DAYS} days (₹{overdue_amount:.2f})"
        )

    if overdue_chores:
        score -= OVERDUE_CHORE_PENALTY * min(overdue_chores, 5)
        deductions.append(
            f"{OVERDUE_CHORE_PENALTY * min(overdue_chores, 5):.0f} pts — {overdue_chores} overdue chore(s)"
        )

    if violations:
        score -= VIOLATION_PENALTY * min(violations, 3)
        deductions.append(
            f"{VIOLATION_PENALTY * min(violations, 3):.0f} pts — {violations} rule violation(s) in 90 days"
        )

    if chores_completed and score < 100:
        score += ON_TIME_CHORE_BONUS * min(chores_completed, 4)
        deductions.append(
            f"+{ON_TIME_CHORE_BONUS * min(chores_completed, 4):.0f} pts — {chores_completed} chore(s) completed in 30 days"
        )

    score = max(0.0, min(100.0, round(score, 1)))

    return {
        "user_id": user_id,
        "score": score,
        "overdue_shares": overdue_count,
        "overdue_share_amount": round(overdue_amount, 2),
        "settlements_paid": settlements_paid,
        "chores_completed": chores_completed,
        "overdue_chores": overdue_chores,
        "violations": violations,
        "deductions": deductions,
    }


@router.get("/")
def get_group_reliability(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _require_active_member(cursor, group_id, user_id)

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
            members = cursor.fetchall()

            scores = [_get_member_score(cursor, group_id, m[0]) for m in members]

            for score in scores:
                score["name"] = next(m[1] for m in members if m[0] == score["user_id"])

            return {
                "group_id": group_id,
                "my_user_id": user_id,
                "members": scores,
            }

    finally:
        connection.close()
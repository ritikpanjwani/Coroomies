import re
from collections import defaultdict
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.database import get_connection
from app.notification_service import create_notification
from app.group_auth import require_active_member
from app.schemas import MoneyAmount, MoneyAmountNonNegative, ReportPaymentRequest
from app.timeutils import local_today

router = APIRouter(
    prefix="/shared-expenses",
    tags=["Shared Expenses"],
)


CENT = Decimal("0.01")


def equal_split_amounts(amount: Decimal, member_ids: list[int]) -> list[tuple[int, Decimal]]:
    """Split an amount exactly, distributing leftover paise deterministically."""
    if not member_ids:
        raise ValueError("At least one member is required")
    total_paise = int((amount.quantize(CENT) * 100).to_integral_value())
    base_paise, remainder = divmod(total_paise, len(member_ids))
    return [
        (member_id, Decimal(base_paise + (1 if index < remainder else 0)) / 100)
        for index, member_id in enumerate(member_ids)
    ]


# -----------------------------
# Request schemas
# -----------------------------

class ShareAmount(BaseModel):
    user_id: int
    amount: MoneyAmountNonNegative


class SharedExpenseCreate(BaseModel):
    group_id: int
    description: str = Field(default="", max_length=150)
    amount: MoneyAmount
    amounts: list[ShareAmount] | None = None
    member_ids: list[int] | None = None


class SettlementCreate(BaseModel):
    group_id: int
    receiver_id: int
    amount: MoneyAmount
    note: str | None = Field(default=None, max_length=200)


class SettleUpReport(BaseModel):
    group_id: int
    receiver_id: int
    amount: MoneyAmount
    payment_reference: str | None = Field(default=None, max_length=100)
    note: str | None = Field(default=None, max_length=200)


class ConfirmSettlementReceipt(BaseModel):
    group_id: int
    payer_id: int
    amount: float | None = None


class RejectSettlementReceipt(BaseModel):
    group_id: int
    payer_id: int


# -----------------------------
# Helpers
# -----------------------------

def _require_active_member(cursor, group_id: int, user_id: int):
    return require_active_member(cursor, group_id, user_id)


def _get_active_members(cursor, group_id: int):
    cursor.execute(
        """
        SELECT u.id, u.name, u.upi_id
        FROM group_members gm
        JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = %s AND gm.status = 'active'
        ORDER BY gm.joined_at ASC
        """,
        (group_id,),
    )
    return cursor.fetchall()


# -----------------------------
# Get active members of a group
# -----------------------------

@router.get("/members")
def get_group_members(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Get the active members of a living group."""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _require_active_member(cursor, group_id, user_id)

            rows = _get_active_members(cursor, group_id)

            return {
                "members": [
                    {"id": row[0], "name": row[1], "upi_id": row[2] or ""}
                    for row in rows
                ]
            }

    finally:
        connection.close()


# -----------------------------
# Create shared expense (equal or custom split)
# -----------------------------

@router.post("/")
def create_shared_expense(
    expense: SharedExpenseCreate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _require_active_member(cursor, expense.group_id, user_id)

            members = _get_active_members(cursor, expense.group_id)

            if len(members) < 2:
                raise HTTPException(
                    status_code=400,
                    detail="Shared expenses need at least 2 active members in the group",
                )

            all_member_ids = [member[0] for member in members]
            all_member_names = {member[0]: member[1] for member in members}

            if expense.member_ids is not None:
                if len(expense.member_ids) != len(set(expense.member_ids)):
                    raise HTTPException(
                        status_code=400,
                        detail="Duplicate members selected",
                    )
                for mid in expense.member_ids:
                    if mid not in all_member_ids:
                        raise HTTPException(
                            status_code=400,
                            detail="A selected member is not in this group",
                        )
                member_ids = expense.member_ids
            else:
                member_ids = all_member_ids

            if len(member_ids) < 1:
                raise HTTPException(
                    status_code=400,
                    detail="Select at least one member for the split",
                )

            member_names = {mid: all_member_names[mid] for mid in member_ids}

            if expense.amounts is not None:
                selected_set = set(member_ids)
                seen = set()
                for item in expense.amounts:
                    if item.user_id not in selected_set:
                        raise HTTPException(
                            status_code=400,
                            detail="Custom split includes a member not in the split",
                        )
                    if item.user_id in seen:
                        raise HTTPException(
                            status_code=400,
                            detail="Duplicate share for a member",
                        )
                    seen.add(item.user_id)
                missing = selected_set - seen
                if missing:
                    raise HTTPException(
                        status_code=400,
                        detail="A share amount must be provided for every selected member",
                    )
                custom_total = sum((item.amount for item in expense.amounts), Decimal("0")).quantize(CENT)
                if custom_total != expense.amount.quantize(CENT):
                    raise HTTPException(
                        status_code=400,
                        detail="Custom share amounts must add up to the total amount",
                    )
                split_map = {item.user_id: item.amount for item in expense.amounts}
                shares_data = [
                    (uid, split_map[uid]) for uid in member_ids
                ]
                split_count = len(member_ids)
            else:
                shares_data = equal_split_amounts(expense.amount, member_ids)
                split_count = len(member_ids)

            cursor.execute(
                """
                INSERT INTO shared_expenses
                (
                    group_id,
                    payer_id,
                    description,
                    amount,
                    split_count,
                    status,
                    created_at
                )
                VALUES (%s, %s, %s, %s, %s, 'pending', NOW())
                RETURNING id
                """,
                (
                    expense.group_id,
                    user_id,
                    expense.description,
                    expense.amount,
                    split_count,
                ),
            )

            expense_id = cursor.fetchone()[0]

            # Get payer name and group name for rich notifications
            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            payer_name_row = cursor.fetchone()
            payer_name = payer_name_row[0] if payer_name_row else "Someone"

            cursor.execute("SELECT name FROM living_groups WHERE id = %s", (expense.group_id,))
            group_name_row = cursor.fetchone()
            group_name = group_name_row[0] if group_name_row else "living group"

            for member_id, share_amount in shares_data:
                cursor.execute(
                    """
                    INSERT INTO expense_shares
                    (
                        expense_id,
                        user_id,
                        amount,
                        status
                    )
                    VALUES (%s, %s, %s, %s)
                    """,
                    (
                        expense_id,
                        member_id,
                        share_amount,
                        "paid" if member_id == user_id else "pending",
                    ),
                )

                if member_id != user_id:
                    create_notification(
                        cursor=cursor,
                        user_id=member_id,
                        title=f"New Shared Expense: {expense.description}",
                        message=f"{payer_name} added '{expense.description}' in {group_name}. Your share: ₹{float(share_amount):.2f}.",
                        notification_type="expense_created",
                        reference_id=str(expense.group_id),
                        reference_type="group",
                        sender_id=user_id,
                        sender_name=payer_name,
                    )

            connection.commit()

            return {
                "message": "Shared expense created",
                "expense_id": expense_id,
                "total_amount": expense.amount,
                "participants": len(member_ids),
                "each_person_pays": shares_data[0][1] if len({amount for _, amount in shares_data}) == 1 else None,
                "shares": [
                    {
                        "user_id": uid,
                        "name": member_names[uid],
                        "amount": amt,
                        "status": "paid" if uid == user_id else "pending",
                    }
                    for uid, amt in shares_data
                ],
            }

    except HTTPException:
        connection.rollback()
        raise
    except Exception:
        connection.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to create shared expense",
        )
    finally:
        connection.close()


# -----------------------------
# Get shared expenses for a group
# -----------------------------

@router.get("/")
def get_shared_expenses(
    group_id: int | None = None,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            if group_id is None:
                # Return expenses from all groups the user is an active member of
                cursor.execute(
                    """
                    SELECT gm.group_id
                    FROM group_members gm
                    WHERE gm.user_id = %s AND gm.status = 'active'
                    """,
                    (user_id,),
                )
                group_ids = [row[0] for row in cursor.fetchall()]
                if not group_ids:
                    return {"expenses": []}
            else:
                _require_active_member(cursor, group_id, user_id)
                group_ids = [group_id]

            cursor.execute(
                """
                SELECT
                    e.id,
                    e.group_id,
                    e.payer_id,
                    u.name,
                    e.description,
                    e.amount,
                    e.split_count,
                    e.status,
                    e.created_at,
                    u.upi_id
                FROM shared_expenses e
                JOIN users u
                    ON u.id = e.payer_id
                WHERE e.group_id = ANY(%s)
                ORDER BY e.id DESC
                """,
                (group_ids,),
            )

            rows = cursor.fetchall()

            if not rows:
                return {"expenses": []}

            expense_ids = [row[0] for row in rows]
            cursor.execute(
                """
                SELECT
                    s.expense_id,
                    s.id,
                    s.user_id,
                    u.name,
                    s.amount,
                    s.status,
                    s.payment_reported_at,
                    s.payment_reference,
                    s.payment_confirmed_at,
                    u.upi_id
                FROM expense_shares s
                JOIN users u
                    ON u.id = s.user_id
                WHERE s.expense_id = ANY(%s)
                ORDER BY s.user_id
                """,
                (expense_ids,),
            )
            shares_by_expense = defaultdict(list)
            for share in cursor.fetchall():
                shares_by_expense[share[0]].append(
                    {
                        "id": share[1],
                        "user_id": share[2],
                        "user_name": share[3],
                        "amount": float(share[4]),
                        "status": share[5],
                        "payment_reported_at": share[6].isoformat() if share[6] else None,
                        "payment_reference": share[7] or "",
                        "payment_confirmed_at": share[8].isoformat() if share[8] else None,
                        "user_upi_id": share[9] or "",
                    }
                )

            expenses = [
                {
                    "id": row[0],
                    "group_id": row[1],
                    "payer_id": row[2],
                    "payer_name": row[3],
                    "payer_upi_id": row[9] or "",
                    "description": row[4],
                    "amount": float(row[5]),
                    "split_count": row[6],
                    "status": row[7],
                    "created_at": row[8].isoformat() if row[8] else None,
                    "shares": shares_by_expense.get(row[0], []),
                }
                for row in rows
            ]

            return {
                "expenses": expenses
            }

    finally:
        connection.close()


# -----------------------------
# Balances — who owes whom
# -----------------------------

@router.get("/balances")
def get_balances(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _require_active_member(cursor, group_id, user_id)

            members = _get_active_members(cursor, group_id)
            member_names = {member[0]: member[1] for member in members}

            # Pairwise debts from unpaid shares: (owes_user_id, owed_to_user_id) -> amount
            debts = defaultdict(float)

            # Single aggregated join query replacing previous N+1 per-expense query
            cursor.execute(
                """
                SELECT s.user_id, e.payer_id, SUM(s.amount)
                FROM expense_shares s
                JOIN shared_expenses e ON e.id = s.expense_id
                WHERE e.group_id = %s
                  AND s.status != 'paid'
                  AND s.user_id != e.payer_id
                GROUP BY s.user_id, e.payer_id
                """,
                (group_id,),
            )
            for share_user_id, payer_id, total_amount in cursor.fetchall():
                debts[(share_user_id, payer_id)] += float(total_amount)

            # Settlements reduce the debt between payer and receiver (excluding share-reconciled audit entries)
            cursor.execute(
                """
                SELECT payer_id, receiver_id, amount
                FROM expense_settlements
                WHERE group_id = %s
                  AND (note IS NULL OR NOT (note LIKE '[reconciled]%%'))
                """,
                (group_id,),
            )
            for payer_id, receiver_id, amount in cursor.fetchall():
                debts[(payer_id, receiver_id)] -= float(amount)

            # Rule-violation penalties become debts from the violator to the group admin
            cursor.execute(
                """
                SELECT v.user_id, v.penalty_amount, gm.user_id
                FROM rule_violations v
                JOIN group_members gm
                  ON gm.group_id = v.group_id AND gm.role = 'admin' AND gm.status = 'active'
                WHERE v.group_id = %s AND v.penalty_amount > 0
                """,
                (group_id,),
            )
            for violator_id, penalty_amount, admin_id in cursor.fetchall():
                if violator_id != admin_id:
                    debts[(violator_id, admin_id)] += float(penalty_amount)

            # Net balance per member
            net = defaultdict(float)
            for (from_id, to_id), amount in debts.items():
                if amount > 0.004:
                    net[from_id] -= amount
                    net[to_id] += amount

            member_upis = {member[0]: member[2] or "" for member in members}
            owes = [
                {
                    "from_user_id": from_id,
                    "from_name": member_names.get(from_id, "Member"),
                    "to_user_id": to_id,
                    "to_name": member_names.get(to_id, "Member"),
                    "to_upi_id": member_upis.get(to_id, ""),
                    "amount": round(amount, 2),
                }
                for (from_id, to_id), amount in sorted(
                    debts.items(), key=lambda kv: (-kv[1], kv[0][0])
                )
                if amount > 0.004
            ]

            return {
                "my_user_id": user_id,
                "members": [
                    {
                        "user_id": member[0],
                        "name": member[1],
                        "net_balance": round(net.get(member[0], 0.0), 2),
                    }
                    for member in members
                ],
                "owes": owes,
            }

    finally:
        connection.close()


# -----------------------------
# Settlements
# -----------------------------

@router.post("/settlements")
def create_settlement(
    data: SettlementCreate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _require_active_member(cursor, data.group_id, user_id)

            if data.receiver_id == user_id:
                raise HTTPException(
                    status_code=400,
                    detail="You cannot settle with yourself",
                )

            cursor.execute(
                """
                SELECT u.id, u.name
                FROM group_members gm
                JOIN users u ON u.id = gm.user_id
                WHERE gm.group_id = %s AND gm.user_id = %s AND gm.status = 'active'
                """,
                (data.group_id, data.receiver_id),
            )
            receiver = cursor.fetchone()
            if not receiver:
                raise HTTPException(
                    status_code=400,
                    detail="Receiver is not an active member of this group",
                )

            cursor.execute(
                """
                INSERT INTO expense_settlements
                (group_id, payer_id, receiver_id, amount, note, settled_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    data.group_id,
                    user_id,
                    data.receiver_id,
                    data.amount,
                    data.note,
                    local_today().isoformat(),
                ),
            )

            settlement_id = cursor.fetchone()[0]
            connection.commit()

            return {
                "message": "Settlement recorded",
                "settlement_id": settlement_id,
                "amount": data.amount,
                "receiver_name": receiver[1],
            }

    except HTTPException:
        connection.rollback()
        raise
    except Exception:
        connection.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to record settlement",
        )
    finally:
        connection.close()


@router.get("/settlements")
def get_settlements(
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
                    s.id,
                    s.payer_id,
                    pu.name,
                    s.receiver_id,
                    ru.name,
                    s.amount,
                    s.note,
                    s.settled_at
                FROM expense_settlements s
                JOIN users pu ON pu.id = s.payer_id
                JOIN users ru ON ru.id = s.receiver_id
                WHERE s.group_id = %s
                ORDER BY s.settled_at DESC, s.id DESC
                """,
                (group_id,),
            )

            rows = cursor.fetchall()

            def _clean_note(raw_note):
                if not raw_note:
                    return None
                cleaned = re.sub(r"^\[reconciled(?::ids=[0-9,]+)?\]\s*", "", raw_note).strip()
                return cleaned or None

            return {
                "settlements": [
                    {
                        "id": row[0],
                        "payer_id": row[1],
                        "payer_name": row[2],
                        "receiver_id": row[3],
                        "receiver_name": row[4],
                        "amount": float(row[5]),
                        "note": _clean_note(row[6]),
                        "settled_at": row[7],
                    }
                    for row in rows
                ]
            }

    finally:
        connection.close()


@router.post("/settlements/{settlement_id}/undo")
def undo_settlement(
    settlement_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Recipient or group admin marks settlement as not received and restores balance."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, group_id, payer_id, receiver_id, amount, note
                FROM expense_settlements
                WHERE id = %s
                FOR UPDATE
                """,
                (settlement_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Settlement not found")

            s_id, group_id, payer_id, receiver_id, amount, note = row
            membership = _require_active_member(cursor, group_id, user_id)
            is_admin = membership[1] == "admin"

            if user_id != receiver_id and not is_admin:
                raise HTTPException(
                    status_code=403,
                    detail="Only the recipient or a group admin can dispute this settlement",
                )

            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            user_name_row = cursor.fetchone()
            user_name = user_name_row[0] if user_name_row else "Recipient"

            # If note has [reconciled:ids=...], revert those shares back to pending
            if note and "[reconciled:ids=" in note:
                m = re.search(r"\[reconciled:ids=([0-9,]+)\]", note)
                if m:
                    share_ids = [int(x) for x in m.group(1).split(",") if x.isdigit()]
                    if share_ids:
                        cursor.execute(
                            """
                            UPDATE expense_shares
                            SET status = 'pending',
                                payment_reported_at = NULL,
                                payment_confirmed_at = NULL,
                                payment_reference = NULL
                            WHERE id = ANY(%s)
                            RETURNING expense_id
                            """,
                            (share_ids,),
                        )
                        affected_exp_ids = set(r[0] for r in cursor.fetchall())
                        for exp_id in affected_exp_ids:
                            cursor.execute(
                                "UPDATE shared_expenses SET status = 'pending' WHERE id = %s",
                                (exp_id,),
                            )

            cursor.execute("DELETE FROM expense_settlements WHERE id = %s", (settlement_id,))

            create_notification(
                cursor=cursor,
                user_id=payer_id,
                title="Payment Marked Not Received",
                message=f"{user_name} marked settlement of ₹{float(amount):.2f} as not received. Balance restored to Unpaid.",
                notification_type="payment_disputed",
                reference_id=str(group_id),
                reference_type="group",
                sender_id=user_id,
                sender_name=user_name,
            )

            connection.commit()
            return {
                "message": f"Settlement of ₹{float(amount):.2f} reversed. Balance restored to Unpaid.",
                "settlement_id": settlement_id,
                "amount": float(amount),
            }
    finally:
        connection.close()


@router.delete("/settlements/{settlement_id}")
def delete_settlement(
    settlement_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, group_id, payer_id, receiver_id, amount, note
                FROM expense_settlements
                WHERE id = %s
                FOR UPDATE
                """,
                (settlement_id,),
            )
            row = cursor.fetchone()

            if not row:
                raise HTTPException(
                    status_code=404,
                    detail="Settlement not found",
                )

            s_id, group_id, payer_id, receiver_id, amount, note = row
            membership = _require_active_member(cursor, group_id, user_id)
            is_admin = membership[1] == "admin"

            if user_id != payer_id and user_id != receiver_id and not is_admin:
                raise HTTPException(
                    status_code=403,
                    detail="Only the payer, receiver, or a group admin can remove this settlement",
                )

            # If note has [reconciled:ids=...], revert those shares back to pending
            if note and "[reconciled:ids=" in note:
                m = re.search(r"\[reconciled:ids=([0-9,]+)\]", note)
                if m:
                    share_ids = [int(x) for x in m.group(1).split(",") if x.isdigit()]
                    if share_ids:
                        cursor.execute(
                            """
                            UPDATE expense_shares
                            SET status = 'pending',
                                payment_reported_at = NULL,
                                payment_confirmed_at = NULL,
                                payment_reference = NULL
                            WHERE id = ANY(%s)
                            RETURNING expense_id
                            """,
                            (share_ids,),
                        )
                        affected_exp_ids = set(r[0] for r in cursor.fetchall())
                        for exp_id in affected_exp_ids:
                            cursor.execute(
                                "UPDATE shared_expenses SET status = 'pending' WHERE id = %s",
                                (exp_id,),
                            )

            cursor.execute(
                "DELETE FROM expense_settlements WHERE id = %s",
                (settlement_id,),
            )
            connection.commit()

            return {
                "message": "Settlement deleted",
                "settlement_id": settlement_id,
            }

    except HTTPException:
        connection.rollback()
        raise
    except Exception:
        connection.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to delete settlement",
        )
    finally:
        connection.close()


# -----------------------------
# Get one shared expense
# -----------------------------

@router.get("/{expense_id}")
def get_shared_expense(
    expense_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    e.id,
                    e.group_id,
                    e.payer_id,
                    u.name,
                    e.description,
                    e.amount,
                    e.split_count,
                    e.status,
                    u.upi_id
                FROM shared_expenses e
                JOIN users u
                    ON u.id = e.payer_id
                WHERE e.id = %s
                """,
                (expense_id,),
            )

            row = cursor.fetchone()

            if not row:
                raise HTTPException(
                    status_code=404,
                    detail="Shared expense not found",
                )

            _require_active_member(cursor, row[1], user_id)

            cursor.execute(
                """
                SELECT
                    s.id,
                    s.user_id,
                    u.name,
                    s.amount,
                    s.status,
                    s.payment_reported_at,
                    s.payment_reference,
                    s.payment_confirmed_at,
                    u.upi_id
                FROM expense_shares s
                JOIN users u
                    ON u.id = s.user_id
                WHERE s.expense_id = %s
                ORDER BY s.user_id
                """,
                (expense_id,),
            )

            shares = cursor.fetchall()

            return {
                "id": row[0],
                "group_id": row[1],
                "payer_id": row[2],
                "payer_name": row[3],
                "payer_upi_id": row[8] or "",
                "description": row[4],
                "amount": float(row[5]),
                "split_count": row[6],
                "status": row[7],
                "shares": [
                    {
                        "id": share[0],
                        "user_id": share[1],
                        "user_name": share[2],
                        "amount": float(share[3]),
                        "status": share[4],
                        "payment_reported_at": share[5].isoformat() if share[5] else None,
                        "payment_reference": share[6] or "",
                        "payment_confirmed_at": share[7].isoformat() if share[7] else None,
                        "user_upi_id": share[8] or "",
                    }
                    for share in shares
                ],
            }

    finally:
        connection.close()


# -----------------------------
# Report payment for a share (Payer)
# -----------------------------

@router.post("/{expense_id}/shares/{share_id}/report-payment")
def report_share_payment(
    expense_id: int,
    share_id: int,
    payload: ReportPaymentRequest | None = None,
    user_id: int = Depends(get_current_user_id),
):
    """Payer reports that they have paid their split via UPI or other method."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT e.group_id, e.payer_id, e.description, u.name
                FROM shared_expenses e
                JOIN users u ON u.id = e.payer_id
                WHERE e.id = %s
                """,
                (expense_id,),
            )
            exp = cursor.fetchone()
            if not exp:
                raise HTTPException(status_code=404, detail="Shared expense not found")

            group_id, expense_payer_id, description, recipient_name = exp
            _require_active_member(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT id, user_id, amount, status
                FROM expense_shares
                WHERE id = %s AND expense_id = %s
                FOR UPDATE
                """,
                (share_id, expense_id),
            )
            share = cursor.fetchone()
            if not share:
                raise HTTPException(status_code=404, detail="Expense share not found")

            share_db_id, share_user_id, amount, status = share

            if share_user_id != user_id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only report payment for your own share",
                )

            if status == "paid":
                raise HTTPException(
                    status_code=400,
                    detail="This share is already marked as paid",
                )

            ref = payload.payment_reference.strip() if (payload and payload.payment_reference) else None

            cursor.execute(
                """
                UPDATE expense_shares
                SET status = 'payment_reported',
                    payment_reported_at = NOW(),
                    payment_confirmed_at = NULL,
                    payment_reference = %s
                WHERE id = %s
                """,
                (ref, share_db_id),
            )

            # Look up payer name
            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            payer_name = cursor.fetchone()[0]

            ref_str = f" (Ref: {ref})" if ref else ""
            # Notify recipient via in-app notification
            if expense_payer_id != user_id:
                create_notification(
                    cursor=cursor,
                    user_id=expense_payer_id,
                    title="Split Payment Received",
                    message=f"{payer_name} reported ₹{float(amount):.2f} paid for '{description}'{ref_str}. Please verify receipt.",
                    notification_type="payment_confirmed",
                    reference_id=str(group_id),
                    reference_type="group",
                    sender_id=user_id,
                    sender_name=payer_name,
                )

            connection.commit()

            return {
                "message": "Payment reported. Waiting for recipient confirmation.",
                "share_id": share_db_id,
                "status": "payment_reported",
                "amount": float(amount),
                "payment_reference": ref,
                "expense_status": "pending",
                "expense_settled": False,
            }
    finally:
        connection.close()


# -----------------------------
# Confirm payment for a share (Recipient / Admin)
# -----------------------------

@router.post("/{expense_id}/shares/{share_id}/confirm-payment")
def confirm_share_payment(
    expense_id: int,
    share_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Recipient or group admin confirms that split payment was received and marks it Paid."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT e.group_id, e.payer_id, e.description, u.name
                FROM shared_expenses e
                JOIN users u ON u.id = e.payer_id
                WHERE e.id = %s
                """,
                (expense_id,),
            )
            exp = cursor.fetchone()
            if not exp:
                raise HTTPException(status_code=404, detail="Shared expense not found")

            group_id, expense_payer_id, description, recipient_name = exp
            _require_active_member(cursor, group_id, user_id)

            # Security: Only recipient or group admin can confirm payment
            cursor.execute(
                "SELECT role FROM group_members WHERE group_id = %s AND user_id = %s AND status = 'active'",
                (group_id, user_id),
            )
            member_row = cursor.fetchone()
            is_admin = member_row and member_row[0] == "admin"

            if user_id != expense_payer_id and not is_admin:
                raise HTTPException(
                    status_code=403,
                    detail="Only the expense recipient or group admin can confirm payment",
                )

            cursor.execute(
                """
                SELECT id, user_id, amount, status
                FROM expense_shares
                WHERE id = %s AND expense_id = %s
                FOR UPDATE
                """,
                (share_id, expense_id),
            )
            share = cursor.fetchone()
            if not share:
                raise HTTPException(status_code=404, detail="Expense share not found")

            share_db_id, share_user_id, amount, status = share

            if status == "paid":
                raise HTTPException(
                    status_code=400,
                    detail="This share is already marked as paid",
                )
            if status != "payment_reported":
                raise HTTPException(
                    status_code=400,
                    detail="This share has not been reported as paid",
                )

            cursor.execute(
                """
                UPDATE expense_shares
                SET status = 'paid',
                    payment_confirmed_at = NOW()
                WHERE id = %s
                """,
                (share_db_id,),
            )

            # Check if all shares for this expense are now paid
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM expense_shares
                WHERE expense_id = %s AND status != 'paid'
                """,
                (expense_id,),
            )
            unpaid_count = cursor.fetchone()[0]

            if unpaid_count == 0:
                cursor.execute(
                    "UPDATE shared_expenses SET status = 'settled' WHERE id = %s",
                    (expense_id,),
                )

            cursor.execute(
                """
                DELETE FROM expense_settlements
                WHERE group_id = %s
                  AND payer_id = %s
                  AND receiver_id = %s
                  AND note LIKE %s
                """,
                (
                    group_id,
                    share_user_id,
                    expense_payer_id,
                    f"%[reconciled:ids={share_db_id}]%",
                ),
            )
            cursor.execute(
                """
                INSERT INTO expense_settlements
                (group_id, payer_id, receiver_id, amount, note, settled_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    group_id,
                    share_user_id,
                    expense_payer_id,
                    float(amount),
                    f"[reconciled:ids={share_db_id}] {description}",
                    local_today().isoformat(),
                ),
            )

            # Send notification to the roommate who paid
            if share_user_id != user_id:
                create_notification(
                    cursor=cursor,
                    user_id=share_user_id,
                    title="Payment Confirmed",
                    message=f"{recipient_name} confirmed your payment of ₹{float(amount):.2f} for '{description}'.",
                    notification_type="payment_confirmed",
                    reference_id=str(group_id),
                    reference_type="group",
                    sender_id=user_id,
                    sender_name=recipient_name,
                )

            connection.commit()

            return {
                "message": "Payment confirmed and marked as paid.",
                "share_id": share_db_id,
                "status": "paid",
                "amount": float(amount),
                "expense_status": "settled" if unpaid_count == 0 else "pending",
                "expense_settled": unpaid_count == 0,
            }
    finally:
        connection.close()


# -----------------------------
# Reject / Cancel reported payment
# -----------------------------

@router.post("/{expense_id}/shares/{share_id}/reject-payment")
def reject_share_payment(
    expense_id: int,
    share_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Reset payment status back to pending if payment was not received or reported by mistake."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT group_id, payer_id, description FROM shared_expenses WHERE id = %s",
                (expense_id,),
            )
            exp = cursor.fetchone()
            if not exp:
                raise HTTPException(status_code=404, detail="Shared expense not found")

            group_id, expense_payer_id, description = exp
            _require_active_member(cursor, group_id, user_id)

            cursor.execute(
                "SELECT role FROM group_members WHERE group_id = %s AND user_id = %s AND status = 'active'",
                (group_id, user_id),
            )
            member_row = cursor.fetchone()
            is_admin = member_row and member_row[0] == "admin"

            cursor.execute(
                "SELECT id, user_id, amount, status FROM expense_shares WHERE id = %s AND expense_id = %s FOR UPDATE",
                (share_id, expense_id),
            )
            share = cursor.fetchone()
            if not share:
                raise HTTPException(status_code=404, detail="Expense share not found")

            share_db_id, share_user_id, amount, status = share

            # Payer can cancel their own reported payment; recipient or admin can reset
            if user_id != share_user_id and user_id != expense_payer_id and not is_admin:
                raise HTTPException(
                    status_code=403,
                    detail="Not authorized to update this payment status",
                )

            cursor.execute(
                """
                UPDATE expense_shares
                SET status = 'pending',
                    payment_reported_at = NULL,
                    payment_reference = NULL,
                    payment_confirmed_at = NULL
                WHERE id = %s
                """,
                (share_db_id,),
            )

            # Ensure shared_expenses is pending
            cursor.execute(
                "UPDATE shared_expenses SET status = 'pending' WHERE id = %s",
                (expense_id,),
            )

            # Clean up any corresponding reconciled settlement record
            cursor.execute(
                """
                DELETE FROM expense_settlements
                WHERE group_id = %s
                  AND (note LIKE %s OR note LIKE %s)
                """,
                (group_id, f"%[reconciled:ids={share_db_id}]%", f"%[reconciled:ids=%,{share_db_id},%]")
            )

            # Look up actor name
            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            actor_name = cursor.fetchone()[0]

            if user_id != share_user_id:
                create_notification(
                    cursor=cursor,
                    user_id=share_user_id,
                    title="Split Payment Marked Unpaid",
                    message=f"{actor_name} marked payment of ₹{float(amount):.2f} for '{description}' as not received. Balance restored.",
                    notification_type="payment_disputed",
                    reference_id=str(group_id),
                    reference_type="group",
                    sender_id=user_id,
                    sender_name=actor_name,
                )

            connection.commit()

            return {
                "message": "Payment status reset to unpaid.",
                "share_id": share_db_id,
                "status": "pending",
                "payment_reference": None,
                "amount": float(amount),
            }
    finally:
        connection.close()


# -----------------------------
# Mark your share as settled (Legacy / Shortcut)
# -----------------------------

@router.put("/{expense_id}/settle")
def settle_expense(
    expense_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            cursor.execute(
                "SELECT group_id, payer_id FROM shared_expenses WHERE id = %s",
                (expense_id,),
            )
            row = cursor.fetchone()

            if not row:
                raise HTTPException(
                    status_code=404,
                    detail="Shared expense not found",
                )

            group_id, expense_payer_id = row
            _require_active_member(cursor, group_id, user_id)

            cursor.execute(
                "SELECT role FROM group_members WHERE group_id = %s AND user_id = %s AND status = 'active'",
                (group_id, user_id),
            )
            member_row = cursor.fetchone()
            is_admin = member_row and member_row[0] == "admin"

            # Security: Debtors cannot unilaterally mark their own share as paid without recipient confirmation.
            if user_id != expense_payer_id and not is_admin:
                raise HTTPException(
                    status_code=403,
                    detail="Debtors cannot unilaterally mark expenses as paid. Please report payment via the UPI modal for the recipient to confirm.",
                )

            cursor.execute(
                """
                UPDATE expense_shares
                SET status = 'paid',
                    payment_confirmed_at = NOW()
                WHERE expense_id = %s
                AND status != 'paid'
                RETURNING id
                """,
                (expense_id,),
            )

            updated = cursor.fetchone()

            if not updated:
                raise HTTPException(
                    status_code=404,
                    detail="No pending share found",
                )

            # Check whether everyone has paid
            cursor.execute(
                """
                SELECT COUNT(*)
                FROM expense_shares
                WHERE expense_id = %s
                AND status = 'pending'
                """,
                (expense_id,),
            )

            pending_count = cursor.fetchone()[0]

            if pending_count == 0:
                cursor.execute(
                    """
                    UPDATE shared_expenses
                    SET status = 'settled'
                    WHERE id = %s
                    """,
                    (expense_id,),
                )

            connection.commit()

            return {
                "message": "Your share has been settled",
                "expense_id": expense_id,
                "expense_status": (
                    "settled"
                    if pending_count == 0
                    else "pending"
                ),
            }

    finally:
        connection.close()


# -----------------------------
# Send reminder for unpaid shares
# -----------------------------

@router.post("/{expense_id}/reminder")
def send_expense_reminder(
    expense_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Remind all unpaid members (only the payer can send)."""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT e.group_id, e.payer_id, e.description, e.amount, u.name
                FROM shared_expenses e
                JOIN users u ON u.id = e.payer_id
                WHERE e.id = %s
                """,
                (expense_id,),
            )
            row = cursor.fetchone()

            if not row:
                raise HTTPException(
                    status_code=404,
                    detail="Shared expense not found",
                )

            group_id, payer_id, description, amount, payer_name = row

            _require_active_member(cursor, group_id, user_id)

            if user_id != payer_id:
                raise HTTPException(
                    status_code=403,
                    detail="Only the person who requested this expense can send reminders",
                )

            cursor.execute(
                """
                SELECT s.user_id, u.name, s.amount
                FROM expense_shares s
                JOIN users u ON u.id = s.user_id
                WHERE s.expense_id = %s
                AND s.status = 'pending'
                AND s.user_id != %s
                """,
                (expense_id, payer_id),
            )
            pending = cursor.fetchall()

            if not pending:
                raise HTTPException(
                    status_code=400,
                    detail="No unpaid members left to remind",
                )

            for share_user_id, share_name, share_amount in pending:
                create_notification(
                    cursor=cursor,
                    user_id=share_user_id,
                    title="Payment Reminder",
                    message=f"Friendly reminder: you owe ₹{float(share_amount):.2f} for '{description}'.",
                    notification_type="payment_reminder",
                    reference_id=str(group_id),
                    reference_type="group",
                    sender_id=user_id,
                    sender_name=payer_name,
                )

            connection.commit()

            return {
                "message": f"Reminder sent to {len(pending)} member(s)",
                "reminded": len(pending),
            }

    finally:
        connection.close()


# -----------------------------
# Delete shared expense
# -----------------------------

@router.delete("/{expense_id}")
def delete_shared_expense(
    expense_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Delete a shared expense (only payer can delete)."""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:

            # Check if user is the payer and an active member of the group
            cursor.execute(
                """
                SELECT payer_id, group_id
                FROM shared_expenses
                WHERE id = %s
                """,
                (expense_id,),
            )

            row = cursor.fetchone()

            if not row:
                raise HTTPException(
                    status_code=404,
                    detail="Shared expense not found",
                )

            payer_id, group_id = row

            _require_active_member(cursor, group_id, user_id)

            if payer_id != user_id:
                raise HTTPException(
                    status_code=403,
                    detail="Only the payer can delete this expense",
                )

            # Delete expense shares first (due to foreign key)
            cursor.execute(
                """
                DELETE FROM expense_shares
                WHERE expense_id = %s
                """,
                (expense_id,),
            )

            # Delete shared expense
            cursor.execute(
                """
                DELETE FROM shared_expenses
                WHERE id = %s
                """,
                (expense_id,),
            )

            connection.commit()

            return {
                "message": "Shared expense deleted successfully",
                "expense_id": expense_id,
            }

    except HTTPException:
        connection.rollback()
        raise
    except Exception:
        connection.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to delete shared expense",
        )
    finally:
        connection.close()

# -----------------------------
# Settle Up report & confirmation
# -----------------------------

@router.post("/settle-up-report")
def report_settle_up_payment(
    data: SettleUpReport,
    user_id: int = Depends(get_current_user_id),
):
    """Payer reports payment to settle their balance with a group member."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            _require_active_member(cursor, data.group_id, user_id)
            if data.receiver_id == user_id:
                raise HTTPException(status_code=400, detail="You cannot settle with yourself")

            cursor.execute(
                """
                SELECT u.id, u.name
                FROM group_members gm
                JOIN users u ON u.id = gm.user_id
                WHERE gm.group_id = %s AND gm.user_id = %s AND gm.status = 'active'
                """,
                (data.group_id, data.receiver_id),
            )
            receiver = cursor.fetchone()
            if not receiver:
                raise HTTPException(status_code=400, detail="Recipient is not an active member of this group")

            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            payer_name = cursor.fetchone()[0]
            receiver_name = receiver[1]

            # Find all pending shares in this group where receiver is payer and current user owes
            cursor.execute(
                """
                SELECT s.id, s.amount, s.expense_id, e.description
                FROM expense_shares s
                JOIN shared_expenses e ON e.id = s.expense_id
                WHERE e.group_id = %s
                  AND e.payer_id = %s
                  AND s.user_id = %s
                  AND s.status = 'pending'
                ORDER BY e.created_at ASC, s.id ASC
                FOR UPDATE
                """,
                (data.group_id, data.receiver_id, user_id),
            )
            pending_shares = cursor.fetchall()
            pending_total = round(
                sum(float(share[1]) for share in pending_shares),
                2,
            )
            if float(data.amount) <= 0:
                raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
            if float(data.amount) > pending_total:
                raise HTTPException(
                    status_code=400,
                    detail=f"Payment amount exceeds the outstanding balance of ₹{pending_total:.2f}",
                )

            ref = data.payment_reference.strip() if data.payment_reference else None
            remaining = round(float(data.amount), 2)
            updated_share_ids = []
            affected_expenses = set()

            for s_id, s_amount, exp_id, exp_desc in pending_shares:
                s_amt_float = round(float(s_amount), 2)
                if remaining <= 0:
                    break

                if remaining >= s_amt_float:
                    cursor.execute(
                        """
                        UPDATE expense_shares
                        SET status = 'payment_reported',
                                payment_reported_at = NOW(),
                                payment_confirmed_at = NULL,
                                payment_reference = %s
                        WHERE id = %s
                        """,
                        (ref, s_id),
                    )
                    updated_share_ids.append(s_id)
                    affected_expenses.add(exp_id)
                    remaining = round(remaining - s_amt_float, 2)
                else:
                    # Partial settlement: split share into remaining unpaid and paid portion
                    new_unpaid_amount = round(s_amt_float - remaining, 2)
                    cursor.execute(
                        """
                        UPDATE expense_shares
                        SET amount = %s
                        WHERE id = %s
                        """,
                        (new_unpaid_amount, s_id),
                    )
                    cursor.execute(
                        """
                        INSERT INTO expense_shares
                            (expense_id, user_id, amount, status, payment_reported_at, payment_confirmed_at, payment_reference)
                            VALUES (%s, %s, %s, 'payment_reported', NOW(), NULL, %s)
                        RETURNING id
                        """,
                        (exp_id, user_id, remaining, ref),
                    )
                    new_share_id = cursor.fetchone()[0]
                    updated_share_ids.append(new_share_id)
                    affected_expenses.add(exp_id)
                    remaining = 0.0
                    break

            if not updated_share_ids:
                raise HTTPException(status_code=400, detail="No pending balance was found to report")

            create_notification(
                cursor=cursor,
                user_id=data.receiver_id,
                title="Settlement Payment Reported",
                message=f"{payer_name} reported ₹{float(data.amount):.2f} as paid to settle shared expenses. Please verify receipt.",
                notification_type="payment_confirmed",
                reference_id=str(data.group_id),
                reference_type="group",
                sender_id=user_id,
                sender_name=payer_name,
            )

            connection.commit()
            return {
                "message": f"Payment of ₹{float(data.amount):.2f} reported. Waiting for recipient confirmation.",
                "settlement_id": None,
                "updated_shares": len(updated_share_ids),
                "amount": float(data.amount),
                "receiver_name": receiver_name,
            }
    finally:
        connection.close()


@router.post("/confirm-settlement-receipt")
def confirm_settlement_receipt(
    data: ConfirmSettlementReceipt,
    user_id: int = Depends(get_current_user_id),
):
    """Payee (receiver) confirms that payment from payer_id was received."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            _require_active_member(cursor, data.group_id, user_id)
            cursor.execute(
                """
                SELECT u.id, u.name
                FROM group_members gm
                JOIN users u ON u.id = gm.user_id
                WHERE gm.group_id = %s AND gm.user_id = %s AND gm.status = 'active'
                """,
                (data.group_id, data.payer_id),
            )
            payer = cursor.fetchone()
            if not payer:
                raise HTTPException(status_code=400, detail="Payer is not an active member of this group")

            cursor.execute("SELECT name FROM users WHERE id = %s", (user_id,))
            receiver_name = cursor.fetchone()[0]
            payer_name = payer[1]

            # Find all reported shares for this pair
            cursor.execute(
                """
                SELECT s.id, s.amount, s.expense_id, s.payment_reference
                FROM expense_shares s
                JOIN shared_expenses e ON e.id = s.expense_id
                WHERE e.group_id = %s
                  AND e.payer_id = %s
                  AND s.user_id = %s
                  AND s.status = 'payment_reported'
                FOR UPDATE
                """,
                (data.group_id, user_id, data.payer_id),
            )
            reported_shares = cursor.fetchall()

            total_confirmed = 0.0
            refs = set()
            affected_expenses = set()

            for s_id, s_amt, exp_id, pref in reported_shares:
                total_confirmed += float(s_amt)
                affected_expenses.add(exp_id)
                if pref:
                    refs.add(pref)
                cursor.execute(
                    """
                    UPDATE expense_shares
                    SET status = 'paid',
                        payment_confirmed_at = NOW()
                    WHERE id = %s
                    """,
                    (s_id,),
                )

            if total_confirmed == 0:
                raise HTTPException(
                    status_code=400,
                    detail="No reported settlement payment was found to confirm",
                )

            # Check if affected expenses are now fully settled
            for exp_id in affected_expenses:
                cursor.execute(
                    "SELECT COUNT(*) FROM expense_shares WHERE expense_id = %s AND status != 'paid'",
                    (exp_id,),
                )
                unpaid = cursor.fetchone()[0]
                if unpaid == 0:
                    cursor.execute(
                        "UPDATE shared_expenses SET status = 'settled' WHERE id = %s",
                        (exp_id,),
                    )

            if total_confirmed > 0:
                ref_text = f" (Ref: {', '.join(refs)})" if refs else ""
                cursor.execute(
                    """
                    INSERT INTO expense_settlements
                    (group_id, payer_id, receiver_id, amount, note, settled_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        data.group_id,
                        data.payer_id,
                        user_id,
                        total_confirmed,
                        f"[reconciled] Confirmed settlement{ref_text}",
                        local_today().isoformat(),
                    ),
                )

            create_notification(
                cursor=cursor,
                user_id=data.payer_id,
                title="Payment Confirmed",
                message=f"{receiver_name} confirmed your settlement payment of ₹{total_confirmed:.2f}. Balance settled!",
                notification_type="payment_confirmed",
                reference_id=str(data.group_id),
                reference_type="group",
                sender_id=user_id,
                sender_name=receiver_name,
            )

            connection.commit()
            return {
                "message": f"Confirmed payment of ₹{total_confirmed:.2f} from {payer_name}.",
                "amount": total_confirmed,
                "payer_name": payer_name,
            }
    finally:
        connection.close()


@router.post("/reject-settlement-receipt")
def reject_settlement_receipt(
    data: RejectSettlementReceipt,
    user_id: int = Depends(get_current_user_id),
):
    """Payee resets payment_reported shares from payer_id back to pending."""
    connection = get_connection()
    try:
        with connection.cursor() as cursor:
            _require_active_member(cursor, data.group_id, user_id)
            cursor.execute(
                """
                UPDATE expense_shares s
                SET status = 'pending',
                    payment_reported_at = NULL,
                    payment_reference = NULL,
                    payment_confirmed_at = NULL
                FROM shared_expenses e
                WHERE e.id = s.expense_id
                  AND e.group_id = %s
                  AND e.payer_id = %s
                  AND s.user_id = %s
                  AND s.status = 'payment_reported'
                """,
                (data.group_id, user_id, data.payer_id),
            )
            connection.commit()
            return {"message": "Reported payment rejected. Status reset to pending."}
    finally:
        connection.close()

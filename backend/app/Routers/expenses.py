import calendar
import re
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.auth import get_current_user_id
from app.database import get_connection
from app.schemas import ExpenseCreate, MoneyAmount, normalize_category, validate_iso_date
from app.timeutils import local_today

router = APIRouter(prefix="/expenses", tags=["Expenses"])


def _notify(cursor, user_id: int, title: str, message: str):
    cursor.execute(
        """
        INSERT INTO notifications (user_id, title, message, is_read)
        VALUES (%s, %s, %s, FALSE)
        """,
        (user_id, title, message),
    )


class ExpenseUpdate(BaseModel):
    category: str = Field(min_length=1, max_length=50)
    subcategory: str = Field(min_length=1, max_length=100)
    amount: MoneyAmount
    expense_date: str

    @field_validator("category")
    @classmethod
    def clean_category(cls, v):
        return normalize_category(v)

    @field_validator("subcategory")
    @classmethod
    def clean_subcategory(cls, v):
        cleaned = (v or "").strip()
        if not cleaned:
            raise ValueError("Subcategory cannot be empty")
        return cleaned

    @field_validator("expense_date")
    @classmethod
    def validate_date(cls, v):
        return validate_iso_date(v)


class BudgetUpdate(BaseModel):
    monthly_budget: float | None = Field(default=None, ge=0, le=10000000)
    budget_reminder: int | None = Field(default=None, ge=1, le=100)


class RecurringExpenseCreate(BaseModel):
    category: str = Field(min_length=1, max_length=50)
    @field_validator("category")
    @classmethod
    def clean_category(cls, v):
        return normalize_category(v)

    @field_validator("subcategory")
    @classmethod
    def clean_subcategory(cls, v):
        cleaned = (v or "").strip()
        if not cleaned:
            raise ValueError("Subcategory cannot be empty")
        return cleaned
    subcategory: str = Field(min_length=1, max_length=100)
    amount: MoneyAmount
    frequency: str = Field(pattern="^(weekly|monthly|yearly)$")
    start_date: str
    end_date: str | None = None

    @field_validator("start_date", "end_date")
    @classmethod
    def validate_date(cls, v):
        if v is None:
            return v
        return validate_iso_date(v)


class RecurringExpenseUpdate(BaseModel):
    category: str = Field(min_length=1, max_length=50)
    @field_validator("category")
    @classmethod
    def clean_category(cls, v):
        return normalize_category(v)

    @field_validator("subcategory")
    @classmethod
    def clean_subcategory(cls, v):
        cleaned = (v or "").strip()
        if not cleaned:
            raise ValueError("Subcategory cannot be empty")
        return cleaned
    subcategory: str = Field(min_length=1, max_length=100)
    amount: MoneyAmount
    frequency: str = Field(pattern="^(weekly|monthly|yearly)$")
    start_date: str
    end_date: str | None = None
    active: bool = True

    @field_validator("start_date", "end_date")
    @classmethod
    def validate_date(cls, v):
        if v is None:
            return v
        return validate_iso_date(v)


# -----------------------------
# Date helpers
# -----------------------------

def _parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def _add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _advance(frequency: str, d: date) -> date:
    if frequency == "weekly":
        return d + timedelta(days=7)
    if frequency == "monthly":
        return _add_months(d, 1)
    if frequency == "yearly":
        year = d.year + 1
        day = min(d.day, calendar.monthrange(year, d.month)[1])
        return date(year, d.month, day)
    return d + timedelta(days=7)


def _month_bounds(month: str) -> tuple[str, str]:
    """Return (start_date, end_date) for a YYYY-MM string."""
    match = re.match(r"^\d{4}-\d{2}$", month or "")
    if not match:
        raise HTTPException(status_code=400, detail="Month must be in YYYY-MM format")
    year, mon = int(month[:4]), int(month[5:7])
    if mon < 1 or mon > 12:
        raise HTTPException(status_code=400, detail="Invalid month")
    last = calendar.monthrange(year, mon)[1]
    return f"{month}-01", f"{month}-{last:02d}"


def _materialize_recurring(cursor, user_id: int) -> None:
    """Insert any due recurring expenses into the expenses table."""
    today = local_today()
    cursor.execute(
        """
        SELECT id, category, subcategory, amount, frequency, end_date, next_run_date
        FROM recurring_expenses
        WHERE user_id = %s AND active = TRUE AND next_run_date <= %s
        """,
        (user_id, today.isoformat()),
    )
    rows = cursor.fetchall()

    for row in rows:
        rid, category, subcategory, amount, frequency, end_date, next_run = row
        nd = _parse_date(next_run)
        end = _parse_date(end_date) if end_date else None
        stopped = False

        iterations = 0
        MAX_RECURRING_ITERATIONS = 52  # Guard against unbounded loops on historical recurring expenses

        while nd <= today and iterations < MAX_RECURRING_ITERATIONS:
            cursor.execute(
                """
                INSERT INTO expenses (user_id, category, subcategory, amount, expense_date)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (user_id, category, subcategory, amount, nd.isoformat()),
            )
            nd = _advance(frequency, nd)
            iterations += 1
            if end and nd > end:
                stopped = True
                break

        if stopped:
            cursor.execute(
                "UPDATE recurring_expenses SET active = FALSE WHERE id = %s",
                (rid,),
            )
        else:
            cursor.execute(
                "UPDATE recurring_expenses SET next_run_date = %s WHERE id = %s",
                (nd.isoformat(), rid),
            )

    if rows:
        connection = cursor.connection
        connection.commit()


# -----------------------------
# Add expense
# -----------------------------

@router.post("/")
def add_expense(
    expense: ExpenseCreate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO expenses
                (user_id, category, subcategory, amount, expense_date)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    user_id,
                    expense.category,
                    expense.subcategory,
                    expense.amount,
                    expense.expense_date,
                ),
            )

            expense_id = cursor.fetchone()[0]

            cursor.execute(
                """
                SELECT monthly_budget, budget_reminder
                FROM expense_settings
                WHERE user_id = %s
                """,
                (user_id,),
            )
            settings_row = cursor.fetchone()

            if settings_row and settings_row[0] and settings_row[1]:
                budget_amt = float(settings_row[0])
                reminder_pct = int(settings_row[1])

                exp_month = expense.expense_date[:7]
                m_start = f"{exp_month}-01"
                year, month = int(exp_month[:4]), int(exp_month[5:7])
                last_day = calendar.monthrange(year, month)[1]
                m_end = f"{exp_month}-{last_day:02d}"

                cursor.execute(
                    """
                    SELECT COALESCE(SUM(amount), 0)
                    FROM expenses
                    WHERE user_id = %s
                    AND expense_date >= %s
                    AND expense_date <= %s
                    """,
                    (user_id, m_start, m_end),
                )
                spent = float(cursor.fetchone()[0])
                threshold = (budget_amt * reminder_pct) / 100

                if spent >= threshold:
                    cursor.execute(
                        """
                        SELECT id FROM notifications
                        WHERE user_id = %s
                        AND title = 'Budget Reminder'
                        AND message LIKE %s
                        LIMIT 1
                        """,
                        (user_id, f"%{exp_month}%"),
                    )
                    if not cursor.fetchone():
                        pct_used = round((spent / budget_amt) * 100) if budget_amt > 0 else 0
                        _notify(
                            cursor,
                            user_id,
                            "Budget Reminder",
                            f"You've used {pct_used}% of your ₹{budget_amt:,.0f} budget for {exp_month}. "
                            f"₹{budget_amt - spent:,.0f} remaining.",
                        )

            connection.commit()

            return {
                "message": "Expense added",
                "expense_id": expense_id,
            }

    finally:
        connection.close()


# -----------------------------
# Get expenses (with filters)
# -----------------------------

@router.get("/")
def get_expenses(
    category: str | None = None,
    month: str | None = None,
    start: str | None = None,
    end: str | None = None,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _materialize_recurring(cursor, user_id)

            conditions = ["user_id = %s"]
            params = [user_id]

            if category:
                conditions.append("category = %s")
                params.append(category)

            if month:
                m_start, m_end = _month_bounds(month)
                conditions.append("expense_date >= %s")
                params.append(m_start)
                conditions.append("expense_date <= %s")
                params.append(m_end)

            if start:
                conditions.append("expense_date >= %s")
                params.append(start)

            if end:
                conditions.append("expense_date <= %s")
                params.append(end)

            cursor.execute(
                f"""
                SELECT id, category, subcategory, amount, expense_date
                FROM expenses
                WHERE {' AND '.join(conditions)}
                ORDER BY expense_date DESC, id DESC
                """,
                params,
            )

            rows = cursor.fetchall()

            return {
                "expenses": [
                    {
                        "id": row[0],
                        "category": row[1],
                        "subcategory": row[2],
                        "amount": float(row[3]),
                        "expense_date": row[4],
                    }
                    for row in rows
                ]
            }

    finally:
        connection.close()


# -----------------------------
# Category totals for a month
# -----------------------------

@router.get("/category-totals")
def get_category_totals(
    month: str | None = None,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _materialize_recurring(cursor, user_id)

            m_start, m_end = _month_bounds(month or date.today().strftime("%Y-%m"))

            cursor.execute(
                """
                SELECT category, SUM(amount)::float AS total, COUNT(*) AS count
                FROM expenses
                WHERE user_id = %s
                AND expense_date >= %s
                AND expense_date <= %s
                GROUP BY category
                ORDER BY total DESC
                """,
                (user_id, m_start, m_end),
            )

            rows = cursor.fetchall()

            categories = [
                {
                    "category": row[0],
                    "total": round(row[1], 2),
                    "count": row[2],
                }
                for row in rows
            ]

            return {
                "month": m_start[:7],
                "total": round(sum(c["total"] for c in categories), 2),
                "categories": categories,
            }

    finally:
        connection.close()


# -----------------------------
# Monthly total
# -----------------------------

@router.get("/monthly-total")
def get_monthly_total(
    month: str | None = None,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _materialize_recurring(cursor, user_id)

            m_target = month or local_today().strftime("%Y-%m")
            m_start, m_end = _month_bounds(m_target)

            cursor.execute(
                """
                SELECT COALESCE(SUM(amount), 0)
                FROM expenses
                WHERE user_id = %s
                AND expense_date >= %s
                AND expense_date <= %s
                """,
                (user_id, m_start, m_end),
            )

            total = cursor.fetchone()[0]

            return {
                "month": m_target,
                "monthly_total": float(total)
            }

    finally:
        connection.close()


# -----------------------------
# Budget
# -----------------------------

@router.get("/budget")
def get_budget(
    month: str | None = None,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            _materialize_recurring(cursor, user_id)

            cursor.execute(
                """
                SELECT monthly_budget, budget_reminder
                FROM expense_settings
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cursor.fetchone()
            budget = float(row[0]) if row and row[0] is not None else None
            reminder = row[1] if row and row[1] is not None else None

            m_start, m_end = _month_bounds(month or date.today().strftime("%Y-%m"))

            cursor.execute(
                """
                SELECT COALESCE(SUM(amount), 0)
                FROM expenses
                WHERE user_id = %s
                AND expense_date >= %s
                AND expense_date <= %s
                """,
                (user_id, m_start, m_end),
            )
            spent = float(cursor.fetchone()[0])

            remaining = None
            percent = None
            if budget is not None:
                remaining = round(budget - spent, 2)
                percent = round((spent / budget) * 100) if budget > 0 else None

            return {
                "month": m_start[:7],
                "monthly_budget": budget,
                "budget_reminder": reminder,
                "spent": round(spent, 2),
                "remaining": remaining,
                "percent": percent,
            }

    finally:
        connection.close()


@router.put("/budget")
def update_budget(
    data: BudgetUpdate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO expense_settings (user_id, monthly_budget, budget_reminder)
                VALUES (%s, %s, %s)
                ON CONFLICT (user_id)
                DO UPDATE SET
                    monthly_budget = EXCLUDED.monthly_budget,
                    budget_reminder = EXCLUDED.budget_reminder
                RETURNING monthly_budget, budget_reminder
                """,
                (user_id, data.monthly_budget, data.budget_reminder),
            )

            row = cursor.fetchone()
            connection.commit()

            return {
                "message": "Budget updated",
                "monthly_budget": float(row[0]) if row[0] is not None else None,
                "budget_reminder": row[1],
            }

    finally:
        connection.close()


# -----------------------------
# Recurring expenses
# -----------------------------

@router.post("/recurring")
def create_recurring_expense(
    data: RecurringExpenseCreate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO recurring_expenses
                (
                    user_id, category, subcategory, amount, frequency,
                    start_date, end_date, next_run_date, active
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE)
                RETURNING id
                """,
                (
                    user_id,
                    data.category,
                    data.subcategory,
                    data.amount,
                    data.frequency,
                    data.start_date,
                    data.end_date,
                    data.start_date,
                ),
            )

            recurring_id = cursor.fetchone()[0]
            connection.commit()

            _materialize_recurring(cursor, user_id)

            return {
                "message": "Recurring expense created",
                "recurring_id": recurring_id,
            }

    except HTTPException:
        connection.rollback()
        raise
    except Exception:
        connection.rollback()
        raise HTTPException(
            status_code=500,
            detail="Failed to create recurring expense",
        )
    finally:
        connection.close()


@router.get("/recurring")
def get_recurring_expenses(
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, category, subcategory, amount, frequency,
                       start_date, end_date, next_run_date, active
                FROM recurring_expenses
                WHERE user_id = %s
                ORDER BY next_run_date ASC, id DESC
                """,
                (user_id,),
            )

            rows = cursor.fetchall()

            return {
                "recurring": [
                    {
                        "id": row[0],
                        "category": row[1],
                        "subcategory": row[2],
                        "amount": float(row[3]),
                        "frequency": row[4],
                        "start_date": row[5],
                        "end_date": row[6],
                        "next_run_date": row[7],
                        "active": row[8],
                    }
                    for row in rows
                ]
            }

    finally:
        connection.close()


@router.put("/recurring/{recurring_id}")
def update_recurring_expense(
    recurring_id: int,
    data: RecurringExpenseUpdate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT next_run_date FROM recurring_expenses WHERE id = %s AND user_id = %s",
                (recurring_id, user_id),
            )
            current = cursor.fetchone()

            if not current:
                raise HTTPException(
                    status_code=404,
                    detail="Recurring expense not found",
                )

            current_next = _parse_date(current[0]) if current[0] else None
            new_start = _parse_date(data.start_date)

            # Keep advancing from the existing schedule. Only move next_run_date
            # forward when the user shifts the start date beyond the current run,
            # otherwise editing/toggling would re-materialize historical expenses.
            if current_next is not None and current_next >= new_start:
                next_run_date = current[0]
            else:
                next_run_date = data.start_date

            cursor.execute(
                """
                UPDATE recurring_expenses
                SET
                    category = %s,
                    subcategory = %s,
                    amount = %s,
                    frequency = %s,
                    start_date = %s,
                    end_date = %s,
                    next_run_date = %s,
                    active = %s
                WHERE id = %s AND user_id = %s
                RETURNING id
                """,
                (
                    data.category,
                    data.subcategory,
                    data.amount,
                    data.frequency,
                    data.start_date,
                    data.end_date,
                    next_run_date,
                    data.active,
                    recurring_id,
                    user_id,
                ),
            )

            updated = cursor.fetchone()
            connection.commit()

            return {
                "message": "Recurring expense updated",
                "recurring_id": recurring_id,
            }

    finally:
        connection.close()


@router.delete("/recurring/{recurring_id}")
def delete_recurring_expense(
    recurring_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM recurring_expenses
                WHERE id = %s AND user_id = %s
                RETURNING id
                """,
                (recurring_id, user_id),
            )

            deleted = cursor.fetchone()

            if not deleted:
                raise HTTPException(
                    status_code=404,
                    detail="Recurring expense not found",
                )

            connection.commit()

            return {
                "message": "Recurring expense deleted",
                "recurring_id": deleted[0],
            }

    finally:
        connection.close()


# -----------------------------
# Edit / delete one expense
# -----------------------------

@router.put("/{expense_id}")
def update_expense(
    expense_id: int,
    expense: ExpenseUpdate,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE expenses
                SET
                    category = %s,
                    subcategory = %s,
                    amount = %s,
                    expense_date = %s
                WHERE id = %s AND user_id = %s
                RETURNING id
                """,
                (
                    expense.category,
                    expense.subcategory,
                    expense.amount,
                    expense.expense_date,
                    expense_id,
                    user_id,
                ),
            )

            updated = cursor.fetchone()

            if not updated:
                raise HTTPException(
                    status_code=404,
                    detail="Expense not found",
                )

            connection.commit()

            return {
                "message": "Expense updated",
                "expense_id": updated[0],
            }

    finally:
        connection.close()


@router.delete("/{expense_id}")
def delete_expense(
    expense_id: int,
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                DELETE FROM expenses
                WHERE id = %s
                AND user_id = %s
                RETURNING id
                """,
                (expense_id, user_id),
            )

            deleted = cursor.fetchone()

            if not deleted:
                raise HTTPException(
                    status_code=404,
                    detail="Expense not found",
                )

            connection.commit()

            return {
                "message": "Expense deleted",
                "expense_id": deleted[0],
            }

    finally:
        connection.close()

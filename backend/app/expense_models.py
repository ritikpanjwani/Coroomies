from sqlalchemy import ForeignKey, Integer, Numeric, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    category: Mapped[str] = mapped_column(String(50), nullable=False)
    subcategory: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    expense_date: Mapped[str] = mapped_column(String(10), nullable=False)


class RecurringExpense(Base):
    __tablename__ = "recurring_expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    category: Mapped[str] = mapped_column(String(50), nullable=False)
    subcategory: Mapped[str] = mapped_column(String(100), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), nullable=False)
    start_date: Mapped[str] = mapped_column(String(10), nullable=False)
    end_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    next_run_date: Mapped[str] = mapped_column(String(10), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ExpenseSetting(Base):
    __tablename__ = "expense_settings"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    monthly_budget: Mapped[float | None] = mapped_column(
        Numeric(10, 2),
        nullable=True,
    )
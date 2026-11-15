from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class SharedExpense(Base):
    __tablename__ = "shared_expenses"

    id: Mapped[int] = mapped_column(primary_key=True)

    group_id: Mapped[int] = mapped_column(
        ForeignKey("living_groups.id", ondelete="CASCADE"),
        nullable=False,
    )

    payer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    amount: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    split_count: Mapped[int] = mapped_column(
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class ExpenseShare(Base):
    __tablename__ = "expense_shares"

    id: Mapped[int] = mapped_column(primary_key=True)

    expense_id: Mapped[int] = mapped_column(
        ForeignKey("shared_expenses.id", ondelete="CASCADE"),
        nullable=False,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    amount: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        nullable=False,
    )

    payment_reported_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    payment_confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    payment_reference: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )


class ExpenseSettlement(Base):
    __tablename__ = "expense_settlements"

    id: Mapped[int] = mapped_column(primary_key=True)

    group_id: Mapped[int] = mapped_column(
        ForeignKey("living_groups.id", ondelete="CASCADE"),
        nullable=False,
    )

    payer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    receiver_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    amount: Mapped[float] = mapped_column(
        Numeric(10, 2),
        nullable=False,
    )

    note: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    settled_at: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )

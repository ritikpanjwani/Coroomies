from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class Chore(Base):
    __tablename__ = "chores"

    id: Mapped[int] = mapped_column(primary_key=True)

    group_id: Mapped[int] = mapped_column(
        ForeignKey("living_groups.id", ondelete="CASCADE"),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    assigned_to: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
    )

    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    due_date: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        nullable=False,
    )

    recurring: Mapped[str] = mapped_column(
        String(20),
        default="none",
        nullable=False,
    )

    completed_at: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
    )

    completed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class ChoreHistory(Base):
    __tablename__ = "chore_history"

    id: Mapped[int] = mapped_column(primary_key=True)

    chore_id: Mapped[int] = mapped_column(
        ForeignKey("chores.id", ondelete="CASCADE"),
        nullable=False,
    )

    group_id: Mapped[int] = mapped_column(
        ForeignKey("living_groups.id", ondelete="CASCADE"),
        nullable=False,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    action: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    note: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class GroupRule(Base):
    __tablename__ = "group_rules"

    id: Mapped[int] = mapped_column(primary_key=True)

    group_id: Mapped[int] = mapped_column(
        ForeignKey("living_groups.id", ondelete="CASCADE"),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    penalty_amount: Mapped[float] = mapped_column(
        Numeric(10, 2),
        default=0,
        nullable=False,
    )

    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class RuleViolation(Base):
    __tablename__ = "rule_violations"

    id: Mapped[int] = mapped_column(primary_key=True)

    rule_id: Mapped[int] = mapped_column(
        ForeignKey("group_rules.id", ondelete="CASCADE"),
        nullable=False,
    )

    group_id: Mapped[int] = mapped_column(
        ForeignKey("living_groups.id", ondelete="CASCADE"),
        nullable=False,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    recorded_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    note: Mapped[str | None] = mapped_column(
        String(300),
        nullable=True,
    )

    penalty_amount: Mapped[float] = mapped_column(
        Numeric(10, 2),
        default=0,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
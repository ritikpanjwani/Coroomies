from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    message: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    is_read: Mapped[bool] = mapped_column(
        default=False,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    notification_type: Mapped[str] = mapped_column(
        String(50),
        default="general",
        nullable=False,
    )

    reference_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    reference_type: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )

    sender_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    sender_name: Mapped[Optional[str]] = mapped_column(
        String(150),
        nullable=True,
    )

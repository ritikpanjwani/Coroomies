from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)

    sender_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    receiver_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    content: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    is_read: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
    )

    attachments: Mapped[list["MessageAttachment"]] = relationship(
        "MessageAttachment",
        back_populates="message",
        cascade="all, delete-orphan",
    )


class MessageAttachment(Base):
    __tablename__ = "message_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)

    message_id: Mapped[int] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    sender_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    receiver_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    media_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    storage_path: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    original_filename: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    mime_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    file_size: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )

    width: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )

    height: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )

    duration: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    message: Mapped["Message"] = relationship(
        "Message",
        back_populates="attachments",
    )

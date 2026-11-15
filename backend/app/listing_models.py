from sqlalchemy import ForeignKey, String, Integer, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class RoomListing(Base):
    __tablename__ = "room_listings"

    id: Mapped[int] = mapped_column(primary_key=True)

    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(150), nullable=False)

    description: Mapped[str] = mapped_column(Text, nullable=False)

    location: Mapped[str] = mapped_column(String(150), nullable=False)

    rent: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)

    deposit: Mapped[float | None] = mapped_column(
        Numeric(10, 2),
        nullable=True,
    )

    room_type: Mapped[str] = mapped_column(String(50), nullable=False)

    spots: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    amenities: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    available_from: Mapped[str] = mapped_column(String(20), nullable=False)

    college: Mapped[str | None] = mapped_column(String(150), nullable=True)

    degree: Mapped[str | None] = mapped_column(String(150), nullable=True)

    stream: Mapped[str | None] = mapped_column(String(150), nullable=True)

    year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    lifestyle_preferences: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="available",
        nullable=False,
    )
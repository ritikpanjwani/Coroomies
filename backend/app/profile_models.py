from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        unique=True,
        nullable=False,
    )

    sleep_schedule: Mapped[str | None] = mapped_column(String(50))
    cleanliness: Mapped[int | None] = mapped_column()
    noise_tolerance: Mapped[int | None] = mapped_column()
    study_habits: Mapped[str | None] = mapped_column(String(100))
    smoking_preference: Mapped[str | None] = mapped_column(String(50))
    food_preferences: Mapped[str | None] = mapped_column(String(255))
    social_preferences: Mapped[str | None] = mapped_column(String(100))
    guest_preferences: Mapped[str | None] = mapped_column(String(100))
    college: Mapped[str | None] = mapped_column(String(150))
    degree: Mapped[str | None] = mapped_column(String(150))
    stream: Mapped[str | None] = mapped_column(String(150))
    year: Mapped[int | None] = mapped_column(Integer)
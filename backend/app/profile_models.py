from datetime import date
from sqlalchemy import Date, ForeignKey, Integer, String, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.models import Base


def calculate_age_from_dob(dob: date | str | None) -> int | None:
    """Calculate age accurately from date of birth."""
    if not dob:
        return None
    if isinstance(dob, str):
        try:
            dob = date.fromisoformat(dob.strip())
        except ValueError:
            return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


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
    work_from_home: Mapped[str | None] = mapped_column(String(50))
    study_environment: Mapped[str | None] = mapped_column(String(50))
    pets_preference: Mapped[str | None] = mapped_column(String(50))
    college: Mapped[str | None] = mapped_column(String(150))
    degree: Mapped[str | None] = mapped_column(String(150))
    stream: Mapped[str | None] = mapped_column(String(150))
    year: Mapped[int | None] = mapped_column(Integer)

    # Demographics, Flatmate Gender Preference, Location, Budget, Occupation, Drinking
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    preferred_flatmate_gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    location: Mapped[str | None] = mapped_column(String(150), nullable=True)
    budget_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    budget_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    occupation: Mapped[str | None] = mapped_column(String(100), nullable=True)
    drinking_preference: Mapped[str | None] = mapped_column(String(50), nullable=True)
    preferred_age_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preferred_age_max: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Phase 3: Housing Intent, Timeline, Localities, Deal Breakers, Bio, Visibility
    housing_intent: Mapped[str | None] = mapped_column(String(50), nullable=True)
    move_in_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    preferred_localities: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    deal_breakers: Mapped[list | None] = mapped_column(JSON, nullable=True, default=list)
    bio: Mapped[str | None] = mapped_column(String(280), nullable=True)
    profile_visibility: Mapped[str | None] = mapped_column(String(20), nullable=True, default="hidden")

    @property
    def age(self) -> int | None:
        return calculate_age_from_dob(self.dob)

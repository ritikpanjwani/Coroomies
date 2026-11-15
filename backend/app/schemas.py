import re
from datetime import date
from decimal import Decimal
from typing import Annotated

from enum import Enum

from pydantic import BaseModel, EmailStr, Field, field_validator


MAX_EXPENSE_AMOUNT = Decimal("99999999.99")

# Single source of truth for every expense amount stored in a Numeric(10,2)
# column: strictly positive and capped so PostgreSQL can never overflow.
MoneyAmount = Annotated[Decimal, Field(gt=Decimal("0"), le=MAX_EXPENSE_AMOUNT)]

# Non-negative variant for optional per-share amounts (custom splits may use 0).
MoneyAmountNonNegative = Annotated[Decimal, Field(ge=Decimal("0"), le=MAX_EXPENSE_AMOUNT)]


def validate_iso_date(v: str) -> str:
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
        raise ValueError("Date must be in YYYY-MM-DD format")
    try:
        date.fromisoformat(v)
    except ValueError:
        raise ValueError("Invalid calendar date")
    return v


CANONICAL_CATEGORIES = [
    "Food",
    "Travel",
    "Shopping",
    "Bills",
    "Education",
    "Entertainment",
    "Other",
]


def normalize_category(v: str) -> str:
    cleaned = re.sub(r"\s+", " ", (v or "").strip())
    if not cleaned:
        raise ValueError("Category cannot be empty")
    for canonical in CANONICAL_CATEGORIES:
        if cleaned.lower() == canonical.lower():
            return canonical
    return cleaned[:1].upper() + cleaned[1:]


def validate_strong_password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if len(v) > 128:
        raise ValueError("Password must be 128 characters or fewer")
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", v):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"[0-9]", v):
        raise ValueError("Password must contain at least one number")
    if not re.search(r"[^A-Za-z0-9]", v):
        raise ValueError("Password must contain at least one special character (e.g. !@#$%^&*)")
    return v


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    username: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        return validate_strong_password(v)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        if len(v.strip()) < 1:
            raise ValueError("Name cannot be empty")
        if len(v) > 100:
            raise ValueError("Name must be 100 characters or fewer")
        return v.strip()

    @field_validator("username")
    @classmethod
    def validate_username(cls, v):
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 30:
            raise ValueError("Username must be 30 characters or fewer")
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username can only contain letters, numbers, and underscores")
        return v


class UserLogin(BaseModel):
    identifier: str
    password: str


class VerifyOtpRequest(BaseModel):
    identifier: str
    otp: str = Field(min_length=6, max_length=6)


class ForgotPasswordRequest(BaseModel):
    identifier: str


class ResetPasswordRequest(BaseModel):
    identifier: str
    otp: str = Field(min_length=6, max_length=6)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v):
        return validate_strong_password(v)


class ExpenseCreate(BaseModel):
    category: str
    subcategory: str
    amount: MoneyAmount
    expense_date: str

    @field_validator("expense_date")
    @classmethod
    def validate_date(cls, v):
        return validate_iso_date(v)

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




class SleepSchedule(str, Enum):
    early = "early"
    normal = "normal"
    late = "late"


class StudyHabits(str, Enum):
    morning = "morning"
    afternoon = "afternoon"
    night = "night"


class SmokingPreference(str, Enum):
    smoker = "smoker"
    non_smoker = "non_smoker"


class FoodPreference(str, Enum):
    vegetarian = "vegetarian"
    non_vegetarian = "non_vegetarian"
    vegan = "vegan"


class SocialPreference(str, Enum):
    low = "low"
    moderate = "moderate"
    high = "high"


class GuestPreference(str, Enum):
    rarely = "rarely"
    sometimes = "sometimes"
    often = "often"


class WorkFromHomePreference(str, Enum):
    never = "never"
    sometimes = "sometimes"
    most_days = "most_days"
    full_time = "full_time"


class StudyEnvironmentPreference(str, Enum):
    silence = "silence"
    low_noise = "low_noise"
    music_fine = "music_fine"


class PetsPreference(str, Enum):
    no_preference = "no_preference"
    must_have = "must_have"
    must_not = "must_not"
    own_pet = "own_pet"


class ProfileCreate(BaseModel):
    sleep_schedule: SleepSchedule | None = None
    cleanliness: int | None = None
    noise_tolerance: int | None = None
    study_habits: StudyHabits | None = None
    smoking_preference: SmokingPreference | None = None
    food_preferences: FoodPreference | None = None
    social_preferences: SocialPreference | None = None
    guest_preferences: GuestPreference | None = None
    work_from_home: WorkFromHomePreference | None = None
    study_environment: StudyEnvironmentPreference | None = None
    pets_preference: PetsPreference | None = None
    college: str | None = None
    degree: str | None = None
    stream: str | None = None
    year: int | None = None

    @field_validator("cleanliness", "noise_tolerance", mode="before")
    @classmethod
    def validate_rating(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            v = v.strip().split("/")[0].strip()
            v = int(v) if v.isdigit() else None
        if v is not None and (v < 1 or v > 10):
            raise ValueError("Rating must be between 1 and 10")
        return v

    @field_validator("college", "degree", "stream")
    @classmethod
    def validate_optional_string(cls, v):
        if v is not None and len(v.strip()) > 150:
            raise ValueError("Value must be 150 characters or fewer")
        return v.strip() if v is not None else None

    @field_validator("year")
    @classmethod
    def validate_year(cls, v):
        if v is not None and (v < 1950 or v > 2100):
            raise ValueError("Enter a valid year")
        return v


class AccountUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    username: str | None = None
    upi_id: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        if v is None:
            return v
        if len(v.strip()) < 1:
            raise ValueError("Name cannot be empty")
        if len(v) > 100:
            raise ValueError("Name must be 100 characters or fewer")
        return v.strip()

    @field_validator("username")
    @classmethod
    def validate_username(cls, v):
        if v is None:
            return None
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 30:
            raise ValueError("Username must be 30 characters or fewer")
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username can only contain letters, numbers, and underscores")
        return v

    @field_validator("upi_id")
    @classmethod
    def validate_upi_id(cls, v):
        if v is None:
            return None
        cleaned = v.strip().lower()
        if not cleaned:
            return None
        if len(cleaned) > 100:
            raise ValueError("UPI ID must be 100 characters or fewer")
        if not re.match(r"^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$", cleaned):
            raise ValueError("Invalid UPI ID format. Expected format: username@bank (e.g. name@okhdfcbank)")
        return cleaned


class ReportPaymentRequest(BaseModel):
    payment_reference: str | None = Field(default=None, max_length=100)


class EmailChangeRequest(BaseModel):
    new_email: EmailStr


class EmailChangeConfirm(BaseModel):
    new_email: EmailStr
    code: str

    @field_validator("code")
    @classmethod
    def validate_code(cls, v):
        v = v.strip()
        if len(v) != 6 or not v.isdigit():
            raise ValueError("Verification code must be 6 digits")
        return v


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v):
        return validate_strong_password(v)
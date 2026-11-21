from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.matching import stable_match
from app.Routers.expenses import ExpenseUpdate, RecurringExpenseCreate
from app.Routers.shared_expenses import equal_split_amounts
from app.schemas import ProfileCreate


def test_roommate_pairing_never_reuses_a_member():
    """A directed three-person cycle must not create overlapping pairs."""
    pairs, unmatched = stable_match({1: [2, 3], 2: [3, 1], 3: [1, 2]})
    participants = [member for pair in pairs for member in pair]
    assert len(participants) == len(set(participants))
    assert len(pairs) == 1
    assert len(unmatched) == 1


def test_equal_split_distributes_every_paise():
    shares = equal_split_amounts(Decimal("100.00"), [10, 20, 30])
    assert [amount for _, amount in shares] == [Decimal("33.34"), Decimal("33.33"), Decimal("33.33")]
    assert sum(amount for _, amount in shares) == Decimal("100.00")


@pytest.mark.parametrize("bad_date", ["2026-02-29", "2026-02-31", "2026-04-31"])
def test_expense_dates_must_be_real_calendar_dates(bad_date):
    with pytest.raises(ValidationError):
        ExpenseUpdate(category="Food", subcategory="Lunch", amount="10", expense_date=bad_date)
    with pytest.raises(ValidationError):
        RecurringExpenseCreate(
            category="Food",
            subcategory="Lunch",
            amount="10",
            frequency="monthly",
            start_date=bad_date,
        )


def test_profile_ranges_are_ordered_and_age_appropriate():
    with pytest.raises(ValidationError):
        ProfileCreate(budget_min=20000, budget_max=10000)
    with pytest.raises(ValidationError):
        ProfileCreate(preferred_age_min=40, preferred_age_max=18)
    with pytest.raises(ValidationError):
        ProfileCreate(preferred_age_min=17)

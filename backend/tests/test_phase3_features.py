import pytest
from app.Routers.matches import (
    check_deal_breakers,
    evaluate_housing_intent,
    evaluate_move_in_timeline,
    evaluate_locality_overlap,
    evaluate_budget_overlap,
    evaluate_cleanliness_noise,
    compute_multi_factor_match,
)
from app.Routers.profile import compute_profile_completeness, MANDATORY_FIELDS


def test_phase3_canonical_mandatory_fields():
    assert len(MANDATORY_FIELDS) == 7
    field_names = [name for name, _ in MANDATORY_FIELDS]
    assert "Full Name" in field_names
    assert "Date of Birth (Age)" in field_names
    assert "Gender" in field_names
    assert "Preferred Flatmate Gender" in field_names
    assert "Location" in field_names
    assert "Budget Range" in field_names
    assert "Housing Intent" in field_names


def test_deal_breakers_smoking_exclusion():
    my_profile = {
        "deal_breakers": ["no_smoking"],
        "smoking_preference": "non_smoker",
    }
    cand_smoker = {
        "smoking_preference": "smoker",
        "deal_breakers": [],
    }
    is_excl, reason = check_deal_breakers(my_profile, cand_smoker)
    assert is_excl is True
    assert "No Smoking" in reason

    cand_nonsmoker = {
        "smoking_preference": "non_smoker",
        "deal_breakers": [],
    }
    is_excl, _ = check_deal_breakers(my_profile, cand_nonsmoker)
    assert is_excl is False


def test_deal_breakers_food_exclusion():
    my_profile = {
        "deal_breakers": ["veg_only"],
        "food_preferences": "vegetarian",
    }
    cand_meat = {
        "food_preferences": "non_vegetarian",
        "deal_breakers": [],
    }
    is_excl, reason = check_deal_breakers(my_profile, cand_meat)
    assert is_excl is True
    assert "Vegetarian Only" in reason

    cand_veg = {
        "food_preferences": "vegetarian",
        "deal_breakers": [],
    }
    is_excl, _ = check_deal_breakers(my_profile, cand_veg)
    assert is_excl is False


def test_housing_intent_dual_have_flat_excluded():
    is_compat, pts, reason = evaluate_housing_intent("have_flat", "have_flat")
    assert is_compat is False
    assert pts == 0
    assert "Both candidates already have independent flats" in reason


def test_housing_intent_complementary_full_points():
    is_compat, pts, _ = evaluate_housing_intent("have_flat", "need_room")
    assert is_compat is True
    assert pts == 15

    is_compat, pts, _ = evaluate_housing_intent("find_together", "find_together")
    assert is_compat is True
    assert pts == 15

    is_compat, pts, _ = evaluate_housing_intent("find_together", "need_room")
    assert is_compat is True
    assert pts == 10


def test_move_in_timeline_scoring():
    pts, _ = evaluate_move_in_timeline("immediately", "immediately")
    assert pts == 10

    pts, _ = evaluate_move_in_timeline("immediately", "within_15_days")
    assert pts == 7

    pts, _ = evaluate_move_in_timeline("flexible", "within_1_month")
    assert pts == 8

    pts, _ = evaluate_move_in_timeline("2026-12-01", "2026-12-05")
    assert pts == 10

    pts, _ = evaluate_move_in_timeline(None, "immediately")
    assert pts == 0


def test_locality_overlap_scoring():
    my_locs = ["Koramangala", "Indiranagar"]
    cand_locs = ["Koramangala", "HSR Layout"]
    pts, desc = evaluate_locality_overlap(my_locs, "Bangalore", cand_locs, "Bangalore")
    assert pts >= 10
    assert "Koramangala" in desc

    pts, _ = evaluate_locality_overlap(["Indiranagar"], "Bangalore", ["Whitefield"], "Bangalore")
    assert pts >= 6  # City match


def test_budget_overlap_scoring():
    # Complete overlap
    pts, _ = evaluate_budget_overlap(10000, 20000, 12000, 18000)
    assert pts >= 12

    # Close gap (within 2000)
    pts, _ = evaluate_budget_overlap(10000, 15000, 16000, 22000)
    assert pts == 5

    # Wide gap
    pts, _ = evaluate_budget_overlap(10000, 15000, 30000, 45000)
    assert pts == 0


def test_cleanliness_and_noise_scoring():
    # Diff 0
    c_pts, n_pts, _, _ = evaluate_cleanliness_noise(4, 4, 3, 3)
    assert c_pts == 7
    assert n_pts == 6

    # Diff 1
    c_pts, n_pts, _, _ = evaluate_cleanliness_noise(4, 3, 3, 2)
    assert c_pts == 4
    assert n_pts == 3

    # Diff >= 2
    c_pts, n_pts, _, _ = evaluate_cleanliness_noise(5, 2, 4, 1)
    assert c_pts == 0
    assert n_pts == 0


def test_compute_multi_factor_match_perfect():
    my_p = {
        "housing_intent": "find_together",
        "move_in_date": "immediately",
        "preferred_localities": ["Koramangala", "Indiranagar"],
        "location": "Bangalore",
        "budget_min": 15000,
        "budget_max": 25000,
        "cleanliness": 4,
        "noise_tolerance": 3,
        "sleep_schedule": "early",
        "food_preferences": "vegetarian",
        "smoking_preference": "non_smoker",
        "drinking_preference": "social_drinker",
        "social_preferences": "moderate",
        "work_from_home": "yes",
    }
    cand_p = dict(my_p)
    score, reasons, highlights, tags = compute_multi_factor_match(my_p, cand_p)
    assert score >= 95
    assert len(highlights) > 0
    assert "Non-smoker" in tags
    assert "Vegetarian" in tags
    assert "Organized (4/5)" in tags

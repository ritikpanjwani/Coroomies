import json
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user_id
from app.database import get_connection
from app.group_auth import require_active_member
from app.matching import stable_match, find_blocking_pairs, is_gender_compatible, is_age_compatible
from app.profile_models import calculate_age_from_dob
from app.Routers.profile import compute_profile_completeness

router = APIRouter(
    prefix="/matches",
    tags=["Matches"],
)

PROFILE_FIELDS = [
    "sleep_schedule",
    "cleanliness",
    "noise_tolerance",
    "study_habits",
    "smoking_preference",
    "food_preferences",
    "social_preferences",
    "guest_preferences",
]


class PreferenceUpdate(BaseModel):
    preferred_user_ids: list[int] = Field(default_factory=list)


def _format_preference_val(field: str, val):
    if val is None:
        return "Not set"
    if field in ("cleanliness", "noise_tolerance"):
        return f"{val}/5"
    s = str(val).replace("_", " ").strip()
    return s.title()


def _parse_json_list(val) -> list[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return [str(x).strip() for x in val if str(x).strip()]
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            return [val.strip()] if val.strip() else []
    return []


def check_deal_breakers(my_profile: dict, candidate_profile: dict) -> tuple[bool, str | None]:
    """Check if candidate violates caller's deal-breakers OR caller violates candidate's deal-breakers.

    Returns (is_excluded, reason).
    """
    my_dbs = set(s.lower() for s in _parse_json_list(my_profile.get("deal_breakers")))
    cand_dbs = set(s.lower() for s in _parse_json_list(candidate_profile.get("deal_breakers")))

    # 1. Smoking deal breaker
    cand_smoke = str(candidate_profile.get("smoking_preference") or "").lower()
    my_smoke = str(my_profile.get("smoking_preference") or "").lower()
    is_cand_smoker = cand_smoke in ("smoker", "regular_smoker", "social_smoker", "yes")
    is_my_smoker = my_smoke in ("smoker", "regular_smoker", "social_smoker", "yes")

    if "no_smoking" in my_dbs and is_cand_smoker:
        return True, "Candidate smokes, which violates your No Smoking deal-breaker"
    if "no_smoking" in cand_dbs and is_my_smoker:
        return True, "Your smoking preference violates candidate's No Smoking deal-breaker"

    # 2. Vegetarian / Vegan only deal breaker
    cand_food = str(candidate_profile.get("food_preferences") or "").lower()
    my_food = str(my_profile.get("food_preferences") or "").lower()
    is_cand_nonveg = cand_food in ("non_vegetarian", "non_veg", "meat_eater")
    is_my_nonveg = my_food in ("non_vegetarian", "non_veg", "meat_eater")

    if ("veg_only" in my_dbs or "vegetarian_only" in my_dbs) and is_cand_nonveg:
        return True, "Candidate eats non-veg, which violates your Vegetarian Only deal-breaker"
    if ("veg_only" in cand_dbs or "vegetarian_only" in cand_dbs) and is_my_nonveg:
        return True, "Your food preference violates candidate's Vegetarian Only deal-breaker"

    # 3. No Drinking / Sober only deal breaker
    cand_drink = str(candidate_profile.get("drinking_preference") or "").lower()
    my_drink = str(my_profile.get("drinking_preference") or "").lower()
    is_cand_drinker = cand_drink in ("regular_drinker", "frequent_drinker", "frequent", "drinker", "yes")
    is_my_drinker = my_drink in ("regular_drinker", "frequent_drinker", "frequent", "drinker", "yes")

    if ("no_drinking" in my_dbs or "sober_only" in my_dbs) and is_cand_drinker:
        return True, "Candidate drinks alcohol regularly, violating your Sober Only deal-breaker"
    if ("no_drinking" in cand_dbs or "sober_only" in cand_dbs) and is_my_drinker:
        return True, "Your drinking preference violates candidate's Sober Only deal-breaker"

    # 4. No Pets deal breaker
    cand_pets = str(candidate_profile.get("pets_preference") or "").lower()
    my_pets = str(my_profile.get("pets_preference") or "").lower()
    cand_has_pets = cand_pets in ("has_pets", "dog_lover", "cat_lover", "pets_allowed", "yes")
    my_has_pets = my_pets in ("has_pets", "dog_lover", "cat_lover", "pets_allowed", "yes")

    if "no_pets" in my_dbs and cand_has_pets:
        return True, "Candidate has pets, which violates your No Pets deal-breaker"
    if "no_pets" in cand_dbs and my_has_pets:
        return True, "Your pet ownership violates candidate's No Pets deal-breaker"

    # 5. Strictly Clean deal breaker
    cand_clean = candidate_profile.get("cleanliness")
    my_clean = my_profile.get("cleanliness")
    if "strictly_clean" in my_dbs and cand_clean is not None:
        try:
            if int(cand_clean) < 3:
                return True, "Candidate's cleanliness standard violates your Strictly Clean deal-breaker"
        except (ValueError, TypeError):
            pass
    if "strictly_clean" in cand_dbs and my_clean is not None:
        try:
            if int(my_clean) < 3:
                return True, "Your cleanliness standard violates candidate's Strictly Clean deal-breaker"
        except (ValueError, TypeError):
            pass

    # 6. Early Sleeper Only
    cand_sleep = str(candidate_profile.get("sleep_schedule") or "").lower()
    my_sleep = str(my_profile.get("sleep_schedule") or "").lower()
    if "early_sleeper_only" in my_dbs and cand_sleep in ("night_owl", "late"):
        return True, "Candidate is a night owl, violating your Early Sleeper Only deal-breaker"
    if "early_sleeper_only" in cand_dbs and my_sleep in ("night_owl", "late"):
        return True, "Your sleep schedule violates candidate's Early Sleeper Only deal-breaker"

    # 7. No Parties / Frequent Guests
    cand_guests = str(candidate_profile.get("guest_preferences") or "").lower()
    my_guests = str(my_profile.get("guest_preferences") or "").lower()
    if ("no_parties" in my_dbs or "no_frequent_guests" in my_dbs) and cand_guests in ("frequent_guests", "parties_welcome", "frequent", "often"):
        return True, "Candidate frequently hosts guests, violating your No Parties deal-breaker"
    if ("no_parties" in cand_dbs or "no_frequent_guests" in cand_dbs) and my_guests in ("frequent_guests", "parties_welcome", "frequent", "often"):
        return True, "Your guest hosting preference violates candidate's No Parties deal-breaker"

    return False, None


def evaluate_housing_intent(my_intent: str | None, other_intent: str | None) -> tuple[bool, int, str]:
    """Evaluate housing intent compatibility.

    Rules:
    - Dual have_flat: Both already lease flats separately -> Incompatible (excluded).
    - Complementary: have_flat + need_room (or vice versa) = 15 pts.
    - Complementary: find_together + find_together = 15 pts.
    - Compatible: find_together + need_room (or vice versa) = 10 pts.
    - Same need_room: need_room + need_room = 8 pts.
    - Missing/unanswered: 0 pts (treated as unknown).
    Returns (is_compatible, points, label).
    """
    if not my_intent or not other_intent:
        return True, 0, "Housing intent not specified"

    m = str(my_intent).strip().lower()
    o = str(other_intent).strip().lower()

    if m == "have_flat" and o == "have_flat":
        return False, 0, "Both candidates already have independent flats"

    if (m == "have_flat" and o == "need_room") or (m == "need_room" and o == "have_flat"):
        return True, 15, "Complementary intent: One has a flat, one needs a room"

    if m == "find_together" and o == "find_together":
        return True, 15, "Complementary intent: Both looking to find a flat together"

    if (m == "find_together" and o == "need_room") or (m == "need_room" and o == "find_together"):
        return True, 10, "Compatible intent: Room seeker and team-up flat hunter"

    if m == "need_room" and o == "need_room":
        return True, 8, "Both seeking a room"

    return True, 5, "Housing intent partially compatible"


def evaluate_move_in_timeline(my_date: str | None, other_date: str | None) -> tuple[int, str]:
    """Evaluate move-in date and timeline overlap (max 10 points)."""
    if not my_date or not other_date:
        return 0, "Move-in timeline not specified"

    m = str(my_date).strip().lower()
    o = str(other_date).strip().lower()

    if m == "flexible" or o == "flexible":
        return 10 if m == o else 8, "Flexible move-in timeline alignment"

    if m == o:
        if m == "immediately":
            return 10, "Both ready to move in immediately"
        if m == "within_15_days":
            return 10, "Both looking to move in within 15 days"
        if m == "within_1_month":
            return 10, "Both looking to move in within 1 month"
        return 10, f"Same target move-in date ({m})"

    adjacent_pairs = {
        ("immediately", "within_15_days"),
        ("within_15_days", "immediately"),
        ("within_15_days", "within_1_month"),
        ("within_1_month", "within_15_days"),
    }
    if (m, o) in adjacent_pairs:
        return 7, "Close move-in timeline window"

    try:
        d1 = date.fromisoformat(m[:10])
        d2 = date.fromisoformat(o[:10])
        diff_days = abs((d1 - d2).days)
        if diff_days <= 7:
            return 10, f"Target move-in dates within {diff_days} days"
        if diff_days <= 15:
            return 8, f"Target move-in dates within {diff_days} days"
        if diff_days <= 30:
            return 6, f"Target move-in dates within a month ({diff_days} days apart)"
        if diff_days <= 60:
            return 3, f"Target move-in dates within 2 months ({diff_days} days apart)"
        return 0, f"Move-in dates differ significantly ({diff_days} days apart)"
    except Exception:
        pass

    return 2, "Different move-in timelines"


def evaluate_locality_overlap(
    my_localities: list[str],
    my_location: str | None,
    other_localities: list[str],
    other_location: str | None,
) -> tuple[int, str]:
    """Evaluate neighborhood and locality overlap (max 12 points)."""
    my_set = set(loc.lower() for loc in my_localities if loc)
    if my_location:
        my_set.add(my_location.strip().lower())

    other_set = set(loc.lower() for loc in other_localities if loc)
    if other_location:
        other_set.add(other_location.strip().lower())

    if not my_set or not other_set:
        return 0, "No preferred localities specified"

    common = my_set.intersection(other_set)
    if len(common) >= 2:
        names = ", ".join(s.title() for s in list(common)[:3])
        return 12, f"Multiple shared neighborhoods ({names})"
    if len(common) == 1:
        name = list(common)[0].title()
        return 10, f"Shared preferred area ({name})"

    for m in my_set:
        for o in other_set:
            if m in o or o in m:
                return 8, f"Close neighborhood match ({m.title()} & {o.title()})"

    return 0, "No overlapping neighborhoods"


def evaluate_budget_overlap(my_bmin, my_bmax, other_bmin, other_bmax) -> tuple[int, str]:
    """Evaluate budget range overlap (max 15 points)."""
    if my_bmin is None and my_bmax is None:
        return 0, "Your budget not specified"
    if other_bmin is None and other_bmax is None:
        return 0, "Candidate budget not specified"

    m_min = my_bmin if my_bmin is not None else 0
    m_max = my_bmax if my_bmax is not None else 1000000
    o_min = other_bmin if other_bmin is not None else 0
    o_max = other_bmax if other_bmax is not None else 1000000

    overlap_start = max(m_min, o_min)
    overlap_end = min(m_max, o_max)

    if overlap_end >= overlap_start:
        overlap_width = overlap_end - overlap_start
        union_width = max(m_max, o_max) - min(m_min, o_min)
        if union_width > 0:
            ratio = overlap_width / union_width
            score = round(9 + 6 * ratio)
        else:
            score = 15
        return min(15, max(9, score)), f"Overlapping budget (₹{overlap_start:,} – ₹{overlap_end:,})"

    gap = overlap_start - overlap_end
    if gap <= 2000:
        return 5, f"Budget gap within ₹{gap:,}"
    if gap <= 5000:
        return 2, f"Budget gap of ₹{gap:,}"
    return 0, f"Budget mismatch (₹{gap:,} gap)"


def evaluate_cleanliness_noise(
    my_clean, other_clean,
    my_noise, other_noise,
) -> tuple[int, int, str, str]:
    """Evaluate cleanliness standard (7 pts) and noise tolerance (6 pts) on 1-5 scale."""
    clean_pts = 0
    clean_desc = "Cleanliness not specified"
    if my_clean is not None and other_clean is not None:
        try:
            diff = abs(int(my_clean) - int(other_clean))
            if diff == 0:
                clean_pts = 7
                clean_desc = f"Identical cleanliness standard ({my_clean}/5)"
            elif diff == 1:
                clean_pts = 4
                clean_desc = f"Very close cleanliness ({my_clean}/5 vs {other_clean}/5)"
            else:
                clean_pts = 0
                clean_desc = f"Different cleanliness standards ({my_clean}/5 vs {other_clean}/5)"
        except (ValueError, TypeError):
            pass

    noise_pts = 0
    noise_desc = "Noise tolerance not specified"
    if my_noise is not None and other_noise is not None:
        try:
            diff = abs(int(my_noise) - int(other_noise))
            if diff == 0:
                noise_pts = 6
                noise_desc = f"Identical noise tolerance ({my_noise}/5)"
            elif diff == 1:
                noise_pts = 3
                noise_desc = f"Close noise tolerance ({my_noise}/5 vs {other_noise}/5)"
            else:
                noise_pts = 0
                noise_desc = f"Different noise tolerance ({my_noise}/5 vs {other_noise}/5)"
        except (ValueError, TypeError):
            pass

    return clean_pts, noise_pts, clean_desc, noise_desc


def evaluate_lifestyle_habits(my_p: dict, other_p: dict) -> tuple[int, list[dict]]:
    """Evaluate lifestyle habits (max 20 points): Sleep (4), Food (4), Smoking (3), Drinking (3), Social/Guests (3), WFH/Study (3)."""
    score = 0
    reasons = []

    # 1. Sleep schedule (4 pts)
    ms = my_p.get("sleep_schedule")
    os = other_p.get("sleep_schedule")
    if ms and os:
        ms_clean = str(ms).strip().lower()
        os_clean = str(os).strip().lower()
        if ms_clean == os_clean:
            score += 4
            matched = True
        elif (ms_clean == "normal" or os_clean == "normal"):
            score += 2
            matched = True
        else:
            matched = False
    else:
        matched = None
    reasons.append({
        "field": "sleep_schedule",
        "label": "Sleep schedule",
        "match": matched,
        "my_value": _format_preference_val("sleep_schedule", ms),
        "other_value": _format_preference_val("sleep_schedule", os),
    })

    # 2. Food preferences (4 pts)
    mf = my_p.get("food_preferences")
    of = other_p.get("food_preferences")
    if mf and of:
        mf_clean = str(mf).strip().lower()
        of_clean = str(of).strip().lower()
        if mf_clean == of_clean:
            score += 4
            matched = True
        elif ("veg" in mf_clean and "veg" in of_clean):
            score += 3
            matched = True
        else:
            matched = False
    else:
        matched = None
    reasons.append({
        "field": "food_preferences",
        "label": "Food preference",
        "match": matched,
        "my_value": _format_preference_val("food_preferences", mf),
        "other_value": _format_preference_val("food_preferences", of),
    })

    # 3. Smoking preference (3 pts)
    msm = my_p.get("smoking_preference")
    osm = other_p.get("smoking_preference")
    if msm and osm:
        msm_clean = str(msm).strip().lower()
        osm_clean = str(osm).strip().lower()
        if msm_clean == osm_clean:
            score += 3 if msm_clean == "non_smoker" else 2
            matched = True
        else:
            matched = False
    else:
        matched = None
    reasons.append({
        "field": "smoking_preference",
        "label": "Smoking",
        "match": matched,
        "my_value": _format_preference_val("smoking_preference", msm),
        "other_value": _format_preference_val("smoking_preference", osm),
    })

    # 4. Drinking preference (3 pts)
    mdr = my_p.get("drinking_preference")
    odr = other_p.get("drinking_preference")
    if mdr and odr:
        mdr_clean = str(mdr).strip().lower()
        odr_clean = str(odr).strip().lower()
        if mdr_clean == odr_clean:
            score += 3
            matched = True
        elif (mdr_clean in ("social_drinker", "occasional_drinker") and odr_clean in ("social_drinker", "occasional_drinker")):
            score += 2
            matched = True
        else:
            matched = False
    else:
        matched = None
    reasons.append({
        "field": "drinking_preference",
        "label": "Drinking",
        "match": matched,
        "my_value": _format_preference_val("drinking_preference", mdr),
        "other_value": _format_preference_val("drinking_preference", odr),
    })

    # 5. Social & Guest preferences (3 pts)
    msoc = my_p.get("social_preferences") or my_p.get("social_preference")
    osoc = other_p.get("social_preferences") or other_p.get("social_preference")
    mguest = my_p.get("guest_preferences")
    oguest = other_p.get("guest_preferences")
    social_matched = (msoc and osoc and str(msoc).strip().lower() == str(osoc).strip().lower())
    guest_matched = (mguest and oguest and str(mguest).strip().lower() == str(oguest).strip().lower())
    if social_matched and guest_matched:
        score += 3
        soc_matched_state = True
    elif social_matched or guest_matched:
        score += 2
        soc_matched_state = True
    elif msoc is None and mguest is None and osoc is None and oguest is None:
        soc_matched_state = None
    else:
        soc_matched_state = False

    reasons.append({
        "field": "social_preferences",
        "label": "Social & Guests",
        "match": soc_matched_state,
        "my_value": _format_preference_val("social_preferences", msoc),
        "other_value": _format_preference_val("social_preferences", osoc),
    })

    # 6. WFH & Study habits (3 pts)
    mwfh = my_p.get("work_from_home")
    owfh = other_p.get("work_from_home")
    mstudy = my_p.get("study_habits")
    ostudy = other_p.get("study_habits")
    wfh_matched = (mwfh and owfh and str(mwfh).strip().lower() == str(owfh).strip().lower())
    study_matched = (mstudy and ostudy and str(mstudy).strip().lower() == str(ostudy).strip().lower())
    if wfh_matched or study_matched:
        score += 3
        work_matched_state = True
    elif mwfh is None and mstudy is None and owfh is None and ostudy is None:
        work_matched_state = None
    else:
        work_matched_state = False

    reasons.append({
        "field": "work_from_home",
        "label": "WFH & Habits",
        "match": work_matched_state,
        "my_value": "WFH" if mwfh in ("yes", True, "true") else (_format_preference_val("study_habits", mstudy) if mstudy else "Not set"),
        "other_value": "WFH" if owfh in ("yes", True, "true") else (_format_preference_val("study_habits", ostudy) if ostudy else "Not set"),
    })

    return score, reasons


def compute_multi_factor_match(
    my_profile: dict,
    candidate_profile: dict,
) -> tuple[int, list[dict], list[str], list[str]]:
    """Compute comprehensive 0–100% multi-factor compatibility score, detailed reasons, highlights, and lifestyle tags.

    Factors (Total Raw = 85 points, normalized to 0–100%):
    - Housing Intent (15 pts)
    - Move-in Timeline Overlap (10 pts)
    - Locality Overlap (12 pts)
    - Budget Range Overlap (15 pts)
    - Cleanliness Standard (7 pts)
    - Noise Tolerance (6 pts)
    - Lifestyle Habits: Sleep, Food, Smoke, Drink, Social, WFH (20 pts)
    """
    highlights: list[str] = []
    lifestyle_tags: list[str] = []

    # 1. Housing Intent (15 pts)
    m_intent = my_profile.get("housing_intent")
    c_intent = candidate_profile.get("housing_intent")
    _, intent_pts, intent_desc = evaluate_housing_intent(m_intent, c_intent)
    if intent_pts >= 10:
        highlights.append(intent_desc)

    # 2. Move-in Timeline (10 pts)
    m_move = my_profile.get("move_in_date")
    c_move = candidate_profile.get("move_in_date")
    move_pts, move_desc = evaluate_move_in_timeline(m_move, c_move)
    if move_pts >= 8:
        highlights.append(move_desc)

    # 3. Locality Overlap (12 pts)
    m_locs = _parse_json_list(my_profile.get("preferred_localities"))
    m_city = my_profile.get("location")
    c_locs = _parse_json_list(candidate_profile.get("preferred_localities"))
    c_city = candidate_profile.get("location")
    loc_pts, loc_desc = evaluate_locality_overlap(m_locs, m_city, c_locs, c_city)
    if loc_pts >= 8:
        highlights.append(loc_desc)

    # 4. Budget Range Overlap (15 pts)
    m_bmin = my_profile.get("budget_min")
    m_bmax = my_profile.get("budget_max")
    c_bmin = candidate_profile.get("budget_min")
    c_bmax = candidate_profile.get("budget_max")
    budget_pts, budget_desc = evaluate_budget_overlap(m_bmin, m_bmax, c_bmin, c_bmax)
    if budget_pts >= 9:
        highlights.append(budget_desc)

    # 5 & 6. Cleanliness (7 pts) & Noise (6 pts)
    m_clean = my_profile.get("cleanliness")
    c_clean = candidate_profile.get("cleanliness")
    m_noise = my_profile.get("noise_tolerance")
    c_noise = candidate_profile.get("noise_tolerance")
    clean_pts, noise_pts, clean_desc, noise_desc = evaluate_cleanliness_noise(
        m_clean, c_clean, m_noise, c_noise
    )
    if clean_pts == 7:
        highlights.append(clean_desc)
    if noise_pts == 6:
        highlights.append(noise_desc)

    # 7. Lifestyle Habits (20 pts)
    lifestyle_pts, habit_reasons = evaluate_lifestyle_habits(my_profile, candidate_profile)

    # Sum raw points (max 85)
    total_raw = intent_pts + move_pts + loc_pts + budget_pts + clean_pts + noise_pts + lifestyle_pts
    normalized_score = min(100, round((total_raw / 85.0) * 100))

    # Build comprehensive reasons list
    reasons: list[dict] = [
        {
            "field": "housing_intent",
            "label": "Housing Intent",
            "match": True if intent_pts >= 10 else (False if intent_pts > 0 else None),
            "my_value": _format_preference_val("housing_intent", m_intent),
            "other_value": _format_preference_val("housing_intent", c_intent),
            "description": intent_desc,
        },
        {
            "field": "move_in_date",
            "label": "Move-in Timeline",
            "match": True if move_pts >= 7 else (False if move_pts > 0 else None),
            "my_value": _format_preference_val("move_in_date", m_move),
            "other_value": _format_preference_val("move_in_date", c_move),
            "description": move_desc,
        },
        {
            "field": "preferred_localities",
            "label": "Localities",
            "match": True if loc_pts >= 8 else (False if loc_pts > 0 else None),
            "my_value": ", ".join(m_locs) if m_locs else (_format_preference_val("location", m_city)),
            "other_value": ", ".join(c_locs) if c_locs else (_format_preference_val("location", c_city)),
            "description": loc_desc,
        },
        {
            "field": "budget",
            "label": "Budget Range",
            "match": True if budget_pts >= 9 else (False if (m_bmin or m_bmax) and (c_bmin or c_bmax) else None),
            "my_value": f"₹{m_bmin:,}–₹{m_bmax:,}" if m_bmin and m_bmax else "Not set",
            "other_value": f"₹{c_bmin:,}–₹{c_bmax:,}" if c_bmin and c_bmax else "Not set",
            "description": budget_desc,
        },
        {
            "field": "cleanliness",
            "label": "Cleanliness",
            "match": True if clean_pts >= 4 else (False if clean_pts == 0 and m_clean is not None and c_clean is not None else None),
            "my_value": f"{m_clean}/5" if m_clean is not None else "Not set",
            "other_value": f"{c_clean}/5" if c_clean is not None else "Not set",
            "description": clean_desc,
        },
        {
            "field": "noise_tolerance",
            "label": "Noise tolerance",
            "match": True if noise_pts >= 3 else (False if noise_pts == 0 and m_noise is not None and c_noise is not None else None),
            "my_value": f"{m_noise}/5" if m_noise is not None else "Not set",
            "other_value": f"{c_noise}/5" if c_noise is not None else "Not set",
            "description": noise_desc,
        },
    ] + habit_reasons

    # Build candidate lifestyle tags
    c_smoke = candidate_profile.get("smoking_preference")
    if c_smoke:
        lifestyle_tags.append("Non-smoker" if str(c_smoke).lower() == "non_smoker" else "Smoker")

    c_food = candidate_profile.get("food_preferences")
    if c_food:
        cf = str(c_food).lower()
        if "veg" in cf and "non" not in cf:
            lifestyle_tags.append("Vegetarian")
        elif "vegan" in cf:
            lifestyle_tags.append("Vegan")
        elif "non" in cf:
            lifestyle_tags.append("Non-veg")

    c_sleep = candidate_profile.get("sleep_schedule")
    if c_sleep:
        cs = str(c_sleep).lower()
        if cs in ("early_bird", "early"):
            lifestyle_tags.append("Early Bird")
        elif cs in ("night_owl", "late"):
            lifestyle_tags.append("Night Owl")
        elif cs == "normal":
            lifestyle_tags.append("Flexible Sleep")

    if c_clean is not None:
        try:
            cl_int = int(c_clean)
            labels = {1: "Relaxed (1/5)", 2: "Casual (2/5)", 3: "Balanced (3/5)", 4: "Organized (4/5)", 5: "Meticulous (5/5)"}
            if cl_int in labels:
                lifestyle_tags.append(labels[cl_int])
        except (ValueError, TypeError):
            pass

    c_wfh = candidate_profile.get("work_from_home")
    if c_wfh in ("yes", True, "true"):
        lifestyle_tags.append("WFH")

    return normalized_score, reasons, highlights[:4], lifestyle_tags


def compare_preferences(my_profile, other_profile):
    """Legacy 8-field preference comparison retained for backwards compatibility and tests."""
    weights = {
        "sleep_schedule": 20,
        "cleanliness": 15,
        "noise_tolerance": 15,
        "study_habits": 10,
        "smoking_preference": 10,
        "food_preferences": 10,
        "social_preferences": 10,
        "guest_preferences": 10,
    }

    labels = {
        "sleep_schedule": "Sleep schedule",
        "cleanliness": "Cleanliness",
        "noise_tolerance": "Noise tolerance",
        "study_habits": "Study habits",
        "smoking_preference": "Smoking",
        "food_preferences": "Food preference",
        "social_preferences": "Social preference",
        "guest_preferences": "Guests",
    }

    score = 0
    reasons = []

    for field, weight in weights.items():
        my_value = my_profile.get(field) if my_profile.get(field) is not None else my_profile.get("social_preference" if field == "social_preferences" else field)
        other_value = other_profile.get(field) if other_profile.get(field) is not None else other_profile.get("social_preference" if field == "social_preferences" else field)

        if my_value is None or other_value is None:
            reasons.append({
                "field": field,
                "label": labels[field],
                "match": None,
                "my_value": _format_preference_val(field, my_value),
                "other_value": _format_preference_val(field, other_value),
            })
            continue

        if field in ["cleanliness", "noise_tolerance"]:
            try:
                difference = abs(int(my_value) - int(other_value))
            except (ValueError, TypeError):
                difference = 2

            if difference == 0:
                score += weight
                matched = True
            elif difference == 1:
                score += weight * 0.5
                matched = True
            else:
                matched = False
        else:
            matched = (
                str(my_value).strip().lower()
                == str(other_value).strip().lower()
            )
            if matched:
                score += weight

        reasons.append({
            "field": field,
            "label": labels[field],
            "match": matched,
            "my_value": _format_preference_val(field, my_value),
            "other_value": _format_preference_val(field, other_value),
        })

    return round(score), reasons


@router.get("/")
def get_matches(
    gender: str | None = None,
    min_age: int | None = None,
    max_age: int | None = None,
    location: str | None = None,
    min_budget: int | None = None,
    max_budget: int | None = None,
    housing_intent: str | None = None,
    locality: str | None = None,
    user_id: int = Depends(get_current_user_id),
):
    if min_age is not None and not 18 <= min_age <= 100:
        raise HTTPException(status_code=422, detail="min_age must be between 18 and 100")
    if max_age is not None and not 18 <= max_age <= 100:
        raise HTTPException(status_code=422, detail="max_age must be between 18 and 100")
    if min_age is not None and max_age is not None and min_age > max_age:
        raise HTTPException(status_code=422, detail="min_age cannot exceed max_age")
    if min_budget is not None and min_budget < 0:
        raise HTTPException(status_code=422, detail="min_budget cannot be negative")
    if max_budget is not None and max_budget < 0:
        raise HTTPException(status_code=422, detail="max_budget cannot be negative")
    if min_budget is not None and max_budget is not None and min_budget > max_budget:
        raise HTTPException(status_code=422, detail="min_budget cannot exceed max_budget")

    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            # Get current user's profile and user record
            cursor.execute(
                """
                SELECT
                    u.name,
                    sp.sleep_schedule,
                    sp.cleanliness,
                    sp.noise_tolerance,
                    sp.study_habits,
                    sp.smoking_preference,
                    sp.food_preferences,
                    sp.social_preferences,
                    sp.guest_preferences,
                    sp.dob,
                    sp.gender,
                    sp.preferred_flatmate_gender,
                    sp.location,
                    sp.budget_min,
                    sp.budget_max,
                    sp.occupation,
                    sp.drinking_preference,
                    sp.preferred_age_min,
                    sp.preferred_age_max,
                    sp.housing_intent,
                    sp.move_in_date,
                    sp.preferred_localities,
                    sp.deal_breakers,
                    sp.bio,
                    sp.profile_visibility
                FROM users u
                LEFT JOIN student_profiles sp ON sp.user_id = u.id
                WHERE u.id = %s
                """,
                (user_id,),
            )

            my_row = cursor.fetchone()
            if not my_row:
                return {
                    "matches": [],
                    "profile_incomplete": True,
                    "completion_percentage": 0,
                    "missing_fields": ["Profile"],
                    "message": "User not found",
                }

            my_name = my_row[0]
            my_prof_dict = {
                "sleep_schedule": my_row[1],
                "cleanliness": my_row[2],
                "noise_tolerance": my_row[3],
                "study_habits": my_row[4],
                "smoking_preference": my_row[5],
                "food_preferences": my_row[6],
                "social_preferences": my_row[7],
                "guest_preferences": my_row[8],
                "dob": my_row[9],
                "gender": my_row[10],
                "preferred_flatmate_gender": my_row[11],
                "location": my_row[12],
                "budget_min": my_row[13],
                "budget_max": my_row[14],
                "occupation": my_row[15],
                "drinking_preference": my_row[16],
                "preferred_age_min": my_row[17],
                "preferred_age_max": my_row[18],
                "housing_intent": my_row[19],
                "move_in_date": my_row[20],
                "preferred_localities": my_row[21],
                "deal_breakers": my_row[22],
                "bio": my_row[23],
                "profile_visibility": my_row[24] or "hidden",
            }

            is_complete, pct, missing = compute_profile_completeness(my_name, my_prof_dict)
            if not is_complete:
                return {
                    "matches": [],
                    "profile_incomplete": True,
                    "completion_percentage": pct,
                    "missing_fields": missing,
                    "message": "Please complete your mandatory profile details to unlock compatible flatmate recommendations.",
                }

            my_gender = my_prof_dict["gender"]
            my_pref = my_prof_dict["preferred_flatmate_gender"]
            my_age = calculate_age_from_dob(my_prof_dict["dob"])

            # Query all candidates with profiles who are not self, not blocked, and discoverable
            cursor.execute(
                """
                SELECT
                    u.id,
                    u.name,
                    u.avatar_url,
                    sp.sleep_schedule,
                    sp.cleanliness,
                    sp.noise_tolerance,
                    sp.study_habits,
                    sp.smoking_preference,
                    sp.food_preferences,
                    sp.social_preferences,
                    sp.guest_preferences,
                    sp.college,
                    sp.degree,
                    sp.stream,
                    sp.year,
                    sp.pets_preference,
                    sp.work_from_home,
                    sp.dob,
                    sp.gender,
                    sp.preferred_flatmate_gender,
                    sp.location,
                    sp.budget_min,
                    sp.budget_max,
                    sp.occupation,
                    sp.drinking_preference,
                    sp.preferred_age_min,
                    sp.preferred_age_max,
                    sp.housing_intent,
                    sp.move_in_date,
                    sp.preferred_localities,
                    sp.deal_breakers,
                    sp.bio,
                    sp.profile_visibility
                FROM users u
                JOIN student_profiles sp ON sp.user_id = u.id
                WHERE u.id != %s
                  AND sp.profile_visibility = 'public'
                  AND NOT EXISTS (
                      SELECT 1 FROM blocked_pairs bp
                      WHERE bp.user_a_id = LEAST(u.id, %s) AND bp.user_b_id = GREATEST(u.id, %s)
                  )
                """,
                (user_id, user_id, user_id),
            )

            rows = cursor.fetchall()
            matches = []

            for row in rows:
                c_id = row[0]
                c_name = row[1]
                c_avatar = row[2]
                c_dob = row[17]
                c_gender = row[18]
                c_pref = row[19]
                c_loc = row[20]
                c_bmin = row[21]
                c_bmax = row[22]
                c_occ = row[23]
                c_drink = row[24]
                c_p_amin = row[25]
                c_p_amax = row[26]
                c_intent = row[27]
                c_move_in = row[28]
                c_localities = _parse_json_list(row[29])
                c_deal_breakers = _parse_json_list(row[30])
                c_bio = row[31]
                c_visibility = row[32]
                c_age = calculate_age_from_dob(c_dob)

                # 1. Server-side Mutual Gender Compatibility (Fundamental Requirement)
                if not is_gender_compatible(my_gender, my_pref, c_gender, c_pref):
                    continue

                # If caller provided dynamic gender filter (e.g. 'female' or 'male')
                if gender and gender.lower() not in ("all", "unisex", ""):
                    if c_gender and c_gender.lower() != gender.lower():
                        continue

                # 2. Server-side Age Eligibility
                eff_min_age = min_age if min_age is not None else my_prof_dict["preferred_age_min"]
                eff_max_age = max_age if max_age is not None else my_prof_dict["preferred_age_max"]

                if not is_age_compatible(c_age, eff_min_age, eff_max_age):
                    continue

                if not is_age_compatible(my_age, c_p_amin, c_p_amax):
                    continue

                # 3. Dynamic Housing Intent filter
                if housing_intent and housing_intent.lower() not in ("all", ""):
                    if not c_intent or c_intent.lower() != housing_intent.lower():
                        continue

                # 4. Location & Locality filter
                if location and location.strip():
                    loc_q = location.strip().lower()
                    if not c_loc or loc_q not in c_loc.lower():
                        continue

                if locality and locality.strip():
                    loc_q = locality.strip().lower()
                    loc_matched = any(loc_q in loc.lower() for loc in c_localities) or (c_loc and loc_q in c_loc.lower())
                    if not loc_matched:
                        continue

                # 5. Budget filter
                if min_budget is not None and c_bmax is not None and c_bmax < min_budget:
                    continue
                if max_budget is not None and c_bmin is not None and c_bmin > max_budget:
                    continue

                candidate_profile = {
                    "sleep_schedule": row[3],
                    "cleanliness": row[4],
                    "noise_tolerance": row[5],
                    "study_habits": row[6],
                    "smoking_preference": row[7],
                    "food_preferences": row[8],
                    "social_preference": row[9],
                    "social_preferences": row[9],
                    "guest_preferences": row[10],
                    "pets_preference": row[15],
                    "work_from_home": row[16],
                    "gender": c_gender,
                    "location": c_loc,
                    "budget_min": c_bmin,
                    "budget_max": c_bmax,
                    "occupation": c_occ,
                    "drinking_preference": c_drink,
                    "housing_intent": c_intent,
                    "move_in_date": c_move_in,
                    "preferred_localities": c_localities,
                    "deal_breakers": c_deal_breakers,
                    "bio": c_bio,
                }

                candidate_profile.update(dob=c_dob, preferred_flatmate_gender=c_pref)
                if not compute_profile_completeness(c_name, candidate_profile)[0]:
                    continue

                # 6. Deal-Breakers Exclusion Check
                is_excluded, _ = check_deal_breakers(my_prof_dict, candidate_profile)
                if is_excluded:
                    continue

                # 7. Dual Have-Flat Exclusion Check
                is_intent_ok, _, _ = evaluate_housing_intent(my_prof_dict.get("housing_intent"), c_intent)
                if not is_intent_ok:
                    continue

                # 8. Intelligent Multi-factor Compatibility Scoring
                compatibility, reasons, highlights, lifestyle_tags = compute_multi_factor_match(
                    my_prof_dict,
                    candidate_profile,
                )

                matches.append({
                    "user_id": c_id,
                    "name": c_name,
                    "avatar_url": c_avatar,
                    "compatibility": compatibility,
                    "reasons": reasons,
                    "highlights": highlights,
                    "lifestyle_tags": lifestyle_tags,
                    "age": c_age,
                    "gender": c_gender,
                    "preferred_flatmate_gender": c_pref,
                    "location": c_loc or "",
                    "budget_min": c_bmin,
                    "budget_max": c_bmax,
                    "occupation": c_occ or "",
                    "drinking_preference": c_drink or "",
                    "smoking_preference": row[7] or "",
                    "food_preferences": row[8] or "",
                    "sleep_schedule": row[3] or "",
                    "cleanliness": row[4],
                    "noise_tolerance": row[5],
                    "college": row[11] or "",
                    "degree": row[12] or "",
                    "stream": row[13] or "",
                    "year": row[14] or "",
                    "pets_preference": row[15] or "",
                    "work_from_home": row[16] or "",
                    "housing_intent": c_intent or "",
                    "move_in_date": c_move_in or "",
                    "preferred_localities": c_localities,
                    "deal_breakers": c_deal_breakers,
                    "bio": c_bio or "",
                    "profile_visibility": c_visibility or "hidden",
                })

            # Best matches first
            matches.sort(
                key=lambda x: x["compatibility"],
                reverse=True,
            )

            return {
                "matches": matches,
                "profile_incomplete": False,
                "completion_percentage": pct,
                "total": len(matches),
            }

    finally:
        connection.close()


def _fetch_all_profiles(cursor):
    """Return {user_id: {...}} for every user with a profile."""
    cursor.execute(
        """
        SELECT
            u.id,
            u.name,
            sp.sleep_schedule,
            sp.cleanliness,
            sp.noise_tolerance,
            sp.study_habits,
            sp.smoking_preference,
            sp.food_preferences,
            sp.social_preferences,
            sp.guest_preferences,
            sp.gender,
            sp.preferred_flatmate_gender,
            sp.dob,
            sp.preferred_age_min,
            sp.preferred_age_max
        FROM users u
        JOIN student_profiles sp ON sp.user_id = u.id
        """
    )
    rows = cursor.fetchall()
    result = {}
    for row in rows:
        result[row[0]] = {
            "name": row[1],
            "profile": {
                "sleep_schedule": row[2],
                "cleanliness": row[3],
                "noise_tolerance": row[4],
                "study_habits": row[5],
                "smoking_preference": row[6],
                "food_preferences": row[7],
                "social_preference": row[8],
                "social_preferences": row[8],
                "guest_preferences": row[9],
            },
            "gender": row[10],
            "preferred_flatmate_gender": row[11],
            "dob": row[12],
            "age": calculate_age_from_dob(row[12]),
            "preferred_age_min": row[13],
            "preferred_age_max": row[14],
        }
    return result



def _group_aggregate(profiles):
    """Average cleanliness/noise, majority vote on exact fields."""
    numeric = {"cleanliness": [], "noise_tolerance": []}
    counts = {}
    for profile in profiles:
        for f in numeric:
            v = profile[f]
            if v is not None:
                numeric[f].append(int(v))
        for f in ["sleep_schedule", "study_habits", "smoking_preference",
                  "food_preferences", "social_preference", "guest_preferences"]:
            v = profile[f]
            if v is not None:
                key = str(v).lower()
                counts.setdefault(f, {}).setdefault(key, 0)
                counts[f][key] += 1

    agg = {}
    for f in numeric:
        if numeric[f]:
            agg[f] = round(sum(numeric[f]) / len(numeric[f]))
        else:
            agg[f] = None
    for f in counts:
        agg[f] = max(counts[f], key=counts[f].get) if counts[f] else None
    return agg


def _user_preferences(cursor, user_id):
    """Ordered list of preferred user_ids from the user's ranking, best first."""
    cursor.execute(
        """
        SELECT preferred_user_id
        FROM match_preferences
        WHERE user_id = %s
        ORDER BY rank ASC
        """,
        (user_id,),
    )
    return [row[0] for row in cursor.fetchall()]


@router.get("/preferences")
def get_preferences(
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            ranked = _user_preferences(cursor, user_id)
            if not ranked:
                return {"preferences": []}

            cursor.execute(
                f"""
                SELECT u.id, u.name
                FROM users u
                WHERE u.id = ANY(%s)
                """,
                (ranked,),
            )
            name_map = {row[0]: row[1] for row in cursor.fetchall()}

            return {
                "preferences": [
                    {"user_id": uid, "name": name_map.get(uid, "User")}
                    for uid in ranked
                ]
            }

    finally:
        connection.close()


@router.put("/preferences")
def update_preferences(
    data: PreferenceUpdate,
    user_id: int = Depends(get_current_user_id),
):
    if len(set(data.preferred_user_ids)) != len(data.preferred_user_ids):
        raise HTTPException(status_code=400, detail="Duplicate users in ranking")
    if user_id in data.preferred_user_ids:
        raise HTTPException(status_code=400, detail="You cannot rank yourself")

    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            if data.preferred_user_ids:
                cursor.execute(
                    """
                    SELECT id FROM users WHERE id = ANY(%s)
                    """,
                    (data.preferred_user_ids,),
                )
                found = {row[0] for row in cursor.fetchall()}
                missing = [uid for uid in data.preferred_user_ids if uid not in found]
                if missing:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unknown users: {missing}",
                    )

            cursor.execute(
                "DELETE FROM match_preferences WHERE user_id = %s",
                (user_id,),
            )
            for rank, preferred_id in enumerate(data.preferred_user_ids, start=1):
                cursor.execute(
                    """
                    INSERT INTO match_preferences (user_id, preferred_user_id, rank)
                    VALUES (%s, %s, %s)
                    """,
                    (user_id, preferred_id, rank),
                )
            connection.commit()

            return {"message": "Preferences saved", "count": len(data.preferred_user_ids)}

    finally:
        connection.close()


@router.get("/stable")
def get_stable_matching(
    user_id: int = Depends(get_current_user_id),
):
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            all_profiles = _fetch_all_profiles(cursor)
            user_ids = list(all_profiles.keys())
            if len(user_ids) < 2:
                return {"pairs": [], "unmatched": [], "blocking_pairs": [], "matches": []}

            # Fetch all blocked pairs so blocked users are not paired
            cursor.execute("SELECT user_a_id, user_b_id FROM blocked_pairs")
            blocked_pairs_set = {(r[0], r[1]) for r in cursor.fetchall()}

            # Build each user's preference list: explicit ranking first,
            # then remaining users sorted by compatibility descending.
            preferences = {}
            compat_map = {}
            for uid in user_ids:
                my_profile = all_profiles[uid]["profile"]
                my_gen = all_profiles[uid].get("gender")
                my_pgen = all_profiles[uid].get("preferred_flatmate_gender")
                my_age = all_profiles[uid].get("age")
                my_pamin = all_profiles[uid].get("preferred_age_min")
                my_pamax = all_profiles[uid].get("preferred_age_max")

                others = []
                for oid in user_ids:
                    if oid == uid:
                        continue
                    if (min(uid, oid), max(uid, oid)) in blocked_pairs_set:
                        continue

                    # Mutual gender compatibility
                    if not is_gender_compatible(
                        my_gen, my_pgen,
                        all_profiles[oid].get("gender"),
                        all_profiles[oid].get("preferred_flatmate_gender"),
                    ):
                        continue

                    # Age compatibility check
                    o_age = all_profiles[oid].get("age")
                    if not is_age_compatible(o_age, my_pamin, my_pamax):
                        continue
                    if not is_age_compatible(my_age, all_profiles[oid].get("preferred_age_min"), all_profiles[oid].get("preferred_age_max")):
                        continue

                    score, _ = compare_preferences(my_profile, all_profiles[oid]["profile"])
                    compat_map[(uid, oid)] = score
                    others.append((oid, score))
                others.sort(key=lambda x: -x[1])
                ranked = _user_preferences(cursor, uid)
                explicit = [
                    r for r in ranked
                    if r in all_profiles and r != uid and (min(uid, r), max(uid, r)) not in blocked_pairs_set
                    and is_gender_compatible(my_gen, my_pgen, all_profiles[r].get("gender"), all_profiles[r].get("preferred_flatmate_gender"))
                ]
                rest = [oid for oid, _ in others if oid not in explicit]
                preferences[uid] = explicit + rest

            pairs, unmatched = stable_match(preferences)
            blocking = find_blocking_pairs(preferences, pairs)

            # Only the caller's own blocking pairs are returned. Global
            # blocking-pair detection reveals two OTHER users' internal
            # preferences, so any pair the caller is not part of is dropped.
            # pairings of other users are never serialized.
            blocking_with_names = [
                {
                    "user_a_id": bp["user_a_id"],
                    "user_a_name": all_profiles[bp["user_a_id"]]["name"],
                    "user_b_id": bp["user_b_id"],
                    "user_b_name": all_profiles[bp["user_b_id"]]["name"],
                    "reason": bp["reason"],
                }
                for bp in blocking
                if bp["user_a_id"] == user_id or bp["user_b_id"] == user_id
            ]

            my_pair = next(
                (
                    {
                        "partner_id": b if a == user_id else a,
                        "partner_name": all_profiles[b]["name"] if a == user_id else all_profiles[a]["name"],
                        "compatibility": compat_map.get(
                            (user_id, b if a == user_id else a), 0
                        ),
                    }
                    for a, b in pairs
                    if a == user_id or b == user_id
                ),
                None,
            )

            return {
                # Global tables are intentionally not serialized here —
                # the complete pairing graph belongs to no single user and
                # would expose every other user's assignment, scores and
                # blocking reasons. The frontend shows an empty state when
                # these lists are absent.
                "pairs": [],
                "unmatched": [],
                "blocking_pairs": blocking_with_names,
                "my_match": my_pair,
            }

    finally:
        connection.close()


@router.get("/reverse")
def reverse_matching(
    group_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Reverse matching: rank users by fit with a living group's aggregate profile."""
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id FROM living_groups WHERE id = %s
                """,
                (group_id,),
            )
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="Group not found")

            require_active_member(cursor, group_id, user_id)

            cursor.execute(
                """
                SELECT gm.user_id
                FROM group_members gm
                WHERE gm.group_id = %s AND gm.status = 'active'
                """,
                (group_id,),
            )
            member_ids = [row[0] for row in cursor.fetchall()]

            all_profiles = _fetch_all_profiles(cursor)
            if not member_ids:
                return {"candidates": []}

            member_profiles = [
                all_profiles[mid]["profile"] for mid in member_ids if mid in all_profiles
            ]
            if not member_profiles:
                return {"candidates": []}

            aggregate = _group_aggregate(member_profiles)

            candidates = []
            for oid, data in all_profiles.items():
                if oid in member_ids:
                    continue
                score, reasons = compare_preferences(aggregate, data["profile"])
                candidates.append({
                    "user_id": oid,
                    "name": data["name"],
                    "compatibility": score,
                    "reasons": reasons,
                })

            candidates.sort(key=lambda x: -x["compatibility"])

            return {
                "group_id": group_id,
                "candidates": candidates,
            }

    finally:
        connection.close()

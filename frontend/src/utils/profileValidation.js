import { calculateAge } from "./format";

/**
 * Single Canonical Source of Truth for CoRoomies Profile Completeness.
 * Mirrors backend/app/Routers/profile.py:MANDATORY_FIELDS exactly (7 Canonical Mandatory Fields).
 */
export const CANONICAL_MANDATORY_FIELDS = [
    {
        key: "name",
        label: "Full Name",
        section: "personal",
        fieldId: "field-name",
        validate: (name) => Boolean(name && String(name).trim()),
    },
    {
        key: "dob",
        label: "Date of Birth (Age)",
        section: "personal",
        fieldId: "field-dob",
        validate: (_, p) => {
            if (!p?.dob) return false;
            const age = calculateAge(p.dob);
            return age !== null && age >= 18 && age <= 100;
        },
    },
    {
        key: "gender",
        label: "Gender",
        section: "personal",
        fieldId: "field-gender",
        validate: (_, p) => Boolean(p?.gender && ["male", "female", "prefer_not_to_say"].includes(p.gender)),
    },
    {
        key: "preferred_flatmate_gender",
        label: "Preferred Flatmate Gender",
        section: "criteria",
        fieldId: "field-pref-gender",
        validate: (_, p) => Boolean(p?.preferred_flatmate_gender && ["male", "female", "unisex"].includes(p.preferred_flatmate_gender)),
    },
    {
        key: "location",
        label: "Location",
        section: "criteria",
        fieldId: "field-location",
        validate: (_, p) => Boolean(p?.location && String(p.location).trim()),
    },
    {
        key: "budget",
        label: "Budget Range",
        section: "criteria",
        fieldId: "field-budget-min",
        validate: (_, p) => Boolean(
            (p?.budget_min !== "" && p?.budget_min !== null && p?.budget_min !== undefined && !isNaN(Number(p.budget_min))) ||
            (p?.budget_max !== "" && p?.budget_max !== null && p?.budget_max !== undefined && !isNaN(Number(p.budget_max)))
        ),
    },
    {
        key: "housing_intent",
        label: "Housing Intent",
        section: "criteria",
        fieldId: "field-housing-intent",
        validate: (_, p) => Boolean(p?.housing_intent && ["have_flat", "need_room", "find_together"].includes(p.housing_intent)),
    },
];

/**
 * Recommended Fields for Enhanced Roommate Matchmaking.
 * Mirrors backend/app/Routers/profile.py:RECOMMENDED_FIELDS.
 */
export const RECOMMENDED_FIELDS = [
    {
        key: "smoking_preference",
        label: "Smoking Preference",
        section: "lifestyle",
        fieldId: "field-smoking",
        validate: (_, p) => Boolean(p?.smoking_preference && String(p.smoking_preference).trim()),
    },
    {
        key: "drinking_preference",
        label: "Drinking Preference",
        section: "lifestyle",
        fieldId: "field-drinking",
        validate: (_, p) => Boolean(p?.drinking_preference && String(p.drinking_preference).trim()),
    },
    {
        key: "food_preferences",
        label: "Food Preference",
        section: "lifestyle",
        fieldId: "field-food",
        validate: (_, p) => Boolean(p?.food_preferences && String(p.food_preferences).trim()),
    },
    {
        key: "sleep_schedule",
        label: "Sleep Schedule",
        section: "routine",
        fieldId: "field-sleep",
        validate: (_, p) => Boolean(p?.sleep_schedule && String(p.sleep_schedule).trim()),
    },
    {
        key: "cleanliness",
        label: "Cleanliness Standard",
        section: "routine",
        fieldId: "field-cleanliness",
        validate: (_, p) => p?.cleanliness !== null && p?.cleanliness !== undefined && p?.cleanliness !== "" && !isNaN(Number(p.cleanliness)),
    },
    {
        key: "noise_tolerance",
        label: "Noise Tolerance",
        section: "routine",
        fieldId: "field-noise",
        validate: (_, p) => p?.noise_tolerance !== null && p?.noise_tolerance !== undefined && p?.noise_tolerance !== "" && !isNaN(Number(p.noise_tolerance)),
    },
];

/**
 * Housing Intent Choices
 */
export const HOUSING_INTENTS = [
    {
        value: "have_flat",
        label: "Have a flat & need a flatmate",
        shortLabel: "Has Flat",
        badgeVariant: "brand",
        icon: "home",
        description: "You currently hold or lease a flat and have room(s) available for flatmates.",
    },
    {
        value: "need_room",
        label: "Need a room",
        shortLabel: "Needs Room",
        badgeVariant: "info",
        icon: "key",
        description: "You are looking to move into an existing flat or vacant room.",
    },
    {
        value: "find_together",
        label: "Find a flat together",
        shortLabel: "Team Up",
        badgeVariant: "secondary",
        icon: "users",
        description: "You want to find like-minded flatmates first, then hunt for an apartment together.",
    },
];

/**
 * Move-in Timeline Choices
 */
export const MOVE_IN_TIMELINES = [
    { value: "immediately", label: "Immediately" },
    { value: "within_15_days", label: "Within 15 days" },
    { value: "within_1_month", label: "Within 1 month" },
    { value: "flexible", label: "Flexible" },
];

/**
 * Standard Deal-Breaker Options for Strict Exclusion
 */
export const DEAL_BREAKER_OPTIONS = [
    { value: "no_smoking", label: "No Smoking", hint: "Candidate cannot be a smoker" },
    { value: "no_drinking", label: "No Drinking / Sober Only", hint: "Candidate cannot be a regular drinker" },
    { value: "veg_only", label: "Vegetarian Only", hint: "Candidate cannot eat non-vegetarian food in flat" },
    { value: "no_pets", label: "No Pets", hint: "Candidate cannot bring pets" },
    { value: "strictly_clean", label: "Strictly Clean (3+)", hint: "Candidate must maintain organized/clean space" },
    { value: "early_sleeper_only", label: "Early Sleeper Only", hint: "Candidate cannot be a night owl" },
    { value: "no_parties", label: "No Frequent Parties / Guests", hint: "Candidate cannot host frequent gatherings" },
];

/**
 * Computes profile completeness based on canonical requirements.
 *
 * @param {string|null} name User's full name
 * @param {object|null} profile Profile data dictionary
 * @returns {object} Completeness breakdown
 */
export function computeProfileCompleteness(name, profile = {}) {
    const results = CANONICAL_MANDATORY_FIELDS.map((f) => {
        const isValid = f.validate(name, profile);
        return {
            ...f,
            valid: Boolean(isValid),
        };
    });

    const completedFields = results.filter((f) => f.valid);
    const missingFieldsList = results.filter((f) => !f.valid);
    const missing = missingFieldsList.map((f) => f.label);
    const totalCount = CANONICAL_MANDATORY_FIELDS.length;
    const completedCount = completedFields.length;
    const percentage = Math.floor((completedCount / totalCount) * 100);
    const isComplete = missingFieldsList.length === 0;

    return {
        results,
        completedFields,
        missingFieldsList,
        missing,
        totalCount,
        completedCount,
        percentage,
        isComplete,
    };
}

/**
 * Maps any backend or frontend missing field string to its target section and DOM element ID.
 *
 * @param {string} fieldName Missing field label or key
 * @returns {{ section: string, fieldId: string, label: string }}
 */
export function getFieldJumpTarget(fieldName = "") {
    const lower = String(fieldName).toLowerCase().trim();

    // Match by exact key or label
    const found = CANONICAL_MANDATORY_FIELDS.find(
        (f) =>
            f.key.toLowerCase() === lower ||
            f.label.toLowerCase() === lower ||
            lower.includes(f.label.toLowerCase()) ||
            f.label.toLowerCase().includes(lower)
    );

    if (found) {
        return {
            section: found.section,
            fieldId: found.fieldId,
            label: found.label,
        };
    }

    const recFound = RECOMMENDED_FIELDS.find(
        (f) =>
            f.key.toLowerCase() === lower ||
            f.label.toLowerCase() === lower ||
            lower.includes(f.label.toLowerCase()) ||
            f.label.toLowerCase().includes(lower)
    );

    if (recFound) {
        return {
            section: recFound.section,
            fieldId: recFound.fieldId,
            label: recFound.label,
        };
    }

    // Heuristic fallbacks
    if (lower.includes("name")) return { section: "personal", fieldId: "field-name", label: "Full Name" };
    if (lower.includes("birth") || lower.includes("age") || lower.includes("dob")) return { section: "personal", fieldId: "field-dob", label: "Date of Birth (Age)" };
    if (lower.includes("intent") || lower.includes("housing")) return { section: "criteria", fieldId: "field-housing-intent", label: "Housing Intent" };
    if (lower.includes("flatmate gender") || lower.includes("preferred flatmate")) return { section: "criteria", fieldId: "field-pref-gender", label: "Preferred Flatmate Gender" };
    if (lower.includes("gender")) return { section: "personal", fieldId: "field-gender", label: "Gender" };
    if (lower.includes("location") || lower.includes("city")) return { section: "criteria", fieldId: "field-location", label: "Location" };
    if (lower.includes("budget")) return { section: "criteria", fieldId: "field-budget-min", label: "Budget Range" };
    if (lower.includes("smoke") || lower.includes("smoking")) return { section: "lifestyle", fieldId: "field-smoking", label: "Smoking Preference" };
    if (lower.includes("drink") || lower.includes("drinking")) return { section: "lifestyle", fieldId: "field-drinking", label: "Drinking Preference" };
    if (lower.includes("food") || lower.includes("diet")) return { section: "lifestyle", fieldId: "field-food", label: "Food Preference" };
    if (lower.includes("sleep")) return { section: "routine", fieldId: "field-sleep", label: "Sleep Schedule" };
    if (lower.includes("clean")) return { section: "routine", fieldId: "field-cleanliness", label: "Cleanliness Standard" };
    if (lower.includes("noise")) return { section: "routine", fieldId: "field-noise", label: "Noise Tolerance" };
    if (lower.includes("occup") || lower.includes("career")) return { section: "education", fieldId: "field-occupation", label: "Occupation" };
    if (lower.includes("bio") || lower.includes("about")) return { section: "personal", fieldId: "field-bio", label: "Bio" };

    return { section: "personal", fieldId: "field-name", label: fieldName };
}

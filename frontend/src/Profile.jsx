import { useEffect, useMemo, useRef, useState } from "react";
import api, { API_BASE } from "./api";
import Card from "./components/ui/Card";
import Button from "./components/ui/Button";
import Avatar from "./components/ui/Avatar";
import Modal from "./components/ui/Modal";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import Spinner from "./components/ui/Spinner";
import PageHeader from "./components/ui/PageHeader";
import Badge from "./components/ui/Badge";
import { Input, Select } from "./components/ui/Field";
import { useToast } from "./components/Toast";
import {
    UserRoundIcon,
    CameraIcon,
    Trash2Icon,
    SparklesIcon,
    MoonIcon,
    UtensilsIcon,
    BriefcaseBusinessIcon,
    GraduationCapIcon,
    CheckCircleIcon,
    AlertIcon,
    RefreshIcon,
    EyeIcon,
    WalletIcon,
    ArrowRightIcon,
    SaveIcon,
    SlidersHorizontalIcon,
    ClockIcon,
    UsersRoundIcon,
} from "./components/Icons";
import { isValidUpiId } from "./utils/upi";
import { errorMessage, calculateAge } from "./utils/format";

// Default living preference values
const PREF_DEFAULTS = {
    sleep_schedule: "normal",
    cleanliness: 5,
    noise_tolerance: 5,
    study_habits: "morning",
    smoking_preference: "non_smoker",
    food_preferences: "vegetarian",
    drinking_preference: "non_drinker",
    social_preferences: "moderate",
    guest_preferences: "sometimes",
    work_from_home: "sometimes",
    study_environment: "low_noise",
    pets_preference: "no_preference",
    college: "",
    degree: "",
    stream: "",
    year: "",
    // Demographics & Smart Matching Fields
    dob: "",
    gender: "",
    preferred_flatmate_gender: "unisex",
    location: "",
    budget_min: "",
    budget_max: "",
    occupation: "",
    preferred_age_min: "",
    preferred_age_max: "",
};

const maxDobDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split("T")[0];
})();

const minDobDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 100);
    return d.toISOString().split("T")[0];
})();

// Cleanliness ratings (1 to 10 scale with clear descriptive labels)
const CLEANLINESS_OPTIONS = [
    ["1", "1 / 10 — Very relaxed (mess doesn't bother me)"],
    ["2", "2 / 10 — Relaxed (cleans occasionally)"],
    ["3", "3 / 10 — Casual (tidies common areas weekly)"],
    ["4", "4 / 10 — Moderate casual (keeps shared areas decent)"],
    ["5", "5 / 10 — Balanced (regular cleaning routine)"],
    ["6", "6 / 10 — Organized (tidies daily, washes dishes quickly)"],
    ["7", "7 / 10 — Very clean (neat spaces, chores done on time)"],
    ["8", "8 / 10 — High standard (spotless kitchen & bathrooms)"],
    ["9", "9 / 10 — Meticulous (strict hygiene & sanitization)"],
    ["10", "10 / 10 — Spotless (immaculate order at all times)"],
];

// Noise tolerance ratings (1 to 10 scale with clear descriptive labels)
const NOISE_TOLERANCE_OPTIONS = [
    ["1", "1 / 10 — Deep silence (very sensitive, quiet hours essential)"],
    ["2", "2 / 10 — Very low (prefers library-like quiet)"],
    ["3", "3 / 10 — Low tolerance (headphones preferred for media)"],
    ["4", "4 / 10 — Moderate low (soft conversations and low TV ok)"],
    ["5", "5 / 10 — Balanced (normal daytime household sounds are fine)"],
    ["6", "6 / 10 — Moderate high (comfortable with background audio/TV)"],
    ["7", "7 / 10 — Lively (social home, video calls, active chatter)"],
    ["8", "8 / 10 — High tolerance (music, daytime guests, casual gaming)"],
    ["9", "9 / 10 — Very high tolerance (parties, late chats, instruments ok)"],
    ["10", "10 / 10 — Maximum tolerance (any noise level is completely fine)"],
];

// Living preferences grouped into 4 clear categories
const PREFERENCE_GROUPS = [
    {
        id: "daily_routine",
        title: "Daily Routine & Productivity",
        description: "Your sleep schedule and when you are most productive.",
        icon: MoonIcon,
        fields: [
            {
                key: "sleep_schedule",
                label: "Sleep schedule",
                hint: "When do you typically sleep and wake up?",
                options: [
                    ["early", "Early bird (Sleep before 10:00 PM)"],
                    ["normal", "Normal rhythm (Sleep 10:00 PM – 12:00 AM)"],
                    ["late", "Night owl (Sleep after 12:00 AM)"],
                ],
            },
            {
                key: "study_habits",
                label: "Peak focus / Study hours",
                hint: "When are you most focused for study or deep work?",
                options: [
                    ["morning", "Morning person (6:00 AM – 12:00 PM)"],
                    ["afternoon", "Afternoon person (12:00 PM – 6:00 PM)"],
                    ["night", "Night owl (Late evenings & nights)"],
                ],
            },
        ],
    },
    {
        id: "cleanliness_noise",
        title: "Cleanliness & Noise Standards",
        description: "Your standards for shared space tidiness and volume.",
        icon: SparklesIcon,
        fields: [
            {
                key: "cleanliness",
                label: "Cleanliness standard",
                hint: "How tidy do you keep your personal and shared spaces?",
                options: CLEANLINESS_OPTIONS,
            },
            {
                key: "noise_tolerance",
                label: "Noise tolerance",
                hint: "How sensitive are you to household sounds and conversations?",
                options: NOISE_TOLERANCE_OPTIONS,
            },
        ],
    },
    {
        id: "lifestyle",
        title: "Lifestyle, Diet & Social Life",
        description: "Food preferences, guests, social energy, smoking, and drinking.",
        icon: UtensilsIcon,
        fields: [
            {
                key: "food_preferences",
                label: "Dietary preference",
                hint: "Your primary food habits in the apartment.",
                options: [
                    ["vegetarian", "Vegetarian"],
                    ["non_vegetarian", "Non-vegetarian"],
                    ["vegan", "Vegan"],
                ],
            },
            {
                key: "smoking_preference",
                label: "Smoking policy",
                hint: "Your personal smoking habit or preference.",
                options: [
                    ["non_smoker", "Non-smoker (Smoke-free living environment)"],
                    ["smoker", "Smoker (Smoker / outdoor smoking permitted)"],
                ],
            },
            {
                key: "drinking_preference",
                label: "Drinking preference",
                hint: "Your alcohol consumption habits and comfort level.",
                options: [
                    ["non_drinker", "Non-drinker (Alcohol-free home)"],
                    ["social_drinker", "Social drinker (Drinks occasionally in social settings)"],
                    ["regular_drinker", "Regular drinker (Drinks regularly)"],
                ],
            },
            {
                key: "social_preferences",
                label: "Social energy",
                hint: "How much social interaction do you prefer at home?",
                options: [
                    ["low", "Low — Quiet, values alone time & personal space"],
                    ["moderate", "Moderate — Balanced, occasional hangouts"],
                    ["high", "High — Outgoing, loves regular socializing & hosting"],
                ],
            },
            {
                key: "guest_preferences",
                label: "Guest frequency",
                hint: "How often do you invite outside guests over?",
                options: [
                    ["rarely", "Rarely — Prefer minimal outside visitors"],
                    ["sometimes", "Sometimes — Occasional planned guests/friends"],
                    ["often", "Often — Frequently host friends or study groups"],
                ],
            },
            {
                key: "pets_preference",
                label: "Pet preference",
                hint: "Your stance on living with pets in the apartment.",
                options: [
                    ["no_preference", "No preference — Open to any pet situation"],
                    ["must_have", "Must have pets — Love living with pets"],
                    ["must_not", "No pets — Strictly prefer a pet-free home (allergies / comfort)"],
                    ["own_pet", "I have a pet — Living with my pet"],
                ],
            },
        ],
    },
    {
        id: "work_study",
        title: "Work & Study Environment",
        description: "Your remote working schedule and study atmosphere.",
        icon: BriefcaseBusinessIcon,
        fields: [
            {
                key: "work_from_home",
                label: "Work / Study from home",
                hint: "How frequently are you home during regular work hours?",
                options: [
                    ["never", "Never — Work / study on campus or at an office"],
                    ["sometimes", "Sometimes — Work from home 1–2 days/week"],
                    ["most_days", "Most days — Work from home 3–4 days/week"],
                    ["full_time", "Full-time — 100% remote work / home study"],
                ],
            },
            {
                key: "study_environment",
                label: "Study atmosphere",
                hint: "Your preferred sound environment when studying.",
                options: [
                    ["silence", "Silence — Need complete quiet to focus"],
                    ["low_noise", "Low noise — Gentle background cafe buzz is fine"],
                    ["music_fine", "Music is fine — Background music or ambient audio welcome"],
                ],
            },
        ],
    },
];

export default function Profile({ setPage }) {
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState("all"); // "all" | "account" | "preferences"

    // Account state
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [upiId, setUpiId] = useState("");
    const [avatarUrl, setAvatarUrl] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [canChangeUsername, setCanChangeUsername] = useState(true);
    const [daysUntilChange, setDaysUntilChange] = useState(0);
    const [usernameChangedAt, setUsernameChangedAt] = useState(null);

    // Initial state snapshots for dirty checking
    const [initialAccount, setInitialAccount] = useState({
        name: "",
        username: "",
        upiId: "",
    });
    const [initialPrefs, setInitialPrefs] = useState(PREF_DEFAULTS);

    // Living preferences state
    const [prefs, setPrefs] = useState(PREF_DEFAULTS);

    // Operational state
    const [savingAccount, setSavingAccount] = useState(false);
    const [savingPrefs, setSavingPrefs] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [showRemoveAvatarModal, setShowRemoveAvatarModal] = useState(false);

    // Email change state
    const [newEmail, setNewEmail] = useState("");
    const [emailCode, setEmailCode] = useState("");
    const [emailStep, setEmailStep] = useState(0); // 0: Idle, 1: Request Email, 2: Enter Code
    const [requestingEmail, setRequestingEmail] = useState(false);
    const [confirmingEmail, setConfirmingEmail] = useState(false);

    // Validation error state
    const [accountErrors, setAccountErrors] = useState({});

    const fileInputRef = useRef(null);
    const toast = useToast();

    // Load user settings and living preferences
    useEffect(() => {
        let mounted = true;

        const fetchProfile = async () => {
            try {
                const [settingsRes, profileRes] = await Promise.all([
                    api.get("/settings/"),
                    api.get("/profile/").catch(() => null),
                ]);

                if (!mounted) return;
                const s = settingsRes.data;
                setName(s.name || "");
                setEmail(s.email || "");
                setUsername(s.username || "");
                setUpiId(s.upi_id || "");
                setAvatarUrl(s.avatar_url || null);
                setCanChangeUsername(Boolean(s.can_change_username));
                setDaysUntilChange(s.days_until_username_change || 0);
                setUsernameChangedAt(s.username_changed_at || null);

                setInitialAccount({
                    name: s.name || "",
                    username: s.username || "",
                    upiId: s.upi_id || "",
                });

                if (profileRes && profileRes.data && !profileRes.data.message) {
                    const d = profileRes.data;
                    const loadedPrefs = {
                        ...PREF_DEFAULTS,
                        ...d,
                        cleanliness: Number(d.cleanliness) || 5,
                        noise_tolerance: Number(d.noise_tolerance) || 5,
                        college: d.college || "",
                        degree: d.degree || "",
                        stream: d.stream || "",
                        year: d.year ? String(d.year) : "",
                        dob: d.dob || "",
                        gender: d.gender || "",
                        preferred_flatmate_gender: d.preferred_flatmate_gender || "unisex",
                        location: d.location || "",
                        budget_min: d.budget_min !== null && d.budget_min !== undefined ? String(d.budget_min) : "",
                        budget_max: d.budget_max !== null && d.budget_max !== undefined ? String(d.budget_max) : "",
                        occupation: d.occupation || "",
                        drinking_preference: d.drinking_preference || "non_drinker",
                        preferred_age_min: d.preferred_age_min !== null && d.preferred_age_min !== undefined ? String(d.preferred_age_min) : "",
                        preferred_age_max: d.preferred_age_max !== null && d.preferred_age_max !== undefined ? String(d.preferred_age_max) : "",
                    };
                    setPrefs(loadedPrefs);
                    setInitialPrefs(loadedPrefs);
                }
            } catch (error) {
                if (mounted) {
                    toast.error(errorMessage(error, "Could not load your profile"));
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        void fetchProfile();

        return () => {
            mounted = false;
        };
    }, [toast]);

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    // Check if account fields have been modified
    const isAccountDirty = useMemo(() => {
        return (
            name.trim() !== initialAccount.name.trim() ||
            username.trim() !== initialAccount.username.trim() ||
            upiId.trim() !== initialAccount.upiId.trim()
        );
    }, [name, username, upiId, initialAccount]);

    // Check if living preferences have been modified
    const isPrefsDirty = useMemo(() => {
        return Object.keys(PREF_DEFAULTS).some((key) => {
            return String(prefs[key] ?? "") !== String(initialPrefs[key] ?? "");
        });
    }, [prefs, initialPrefs]);

    // Calculate mandatory flatmate discovery profile completeness (12 required fields)
    const mandatoryStatus = useMemo(() => {
        const fields = [];
        const isNameValid = Boolean(name && name.trim());
        fields.push({ key: "name", label: "Full Name", valid: isNameValid });

        const computedAge = calculateAge(prefs.dob);
        const isDobValid = Boolean(prefs.dob && computedAge !== null && computedAge >= 18 && computedAge <= 100);
        fields.push({ key: "dob", label: "Date of Birth (18+)", valid: isDobValid });

        const isGenderValid = Boolean(prefs.gender && ["male", "female", "prefer_not_to_say"].includes(prefs.gender));
        fields.push({ key: "gender", label: "Your Gender", valid: isGenderValid });

        const isPrefGenderValid = Boolean(prefs.preferred_flatmate_gender && ["male", "female", "unisex"].includes(prefs.preferred_flatmate_gender));
        fields.push({ key: "preferred_flatmate_gender", label: "Flatmate Gender Preference", valid: isPrefGenderValid });

        const isLocValid = Boolean(prefs.location && prefs.location.trim());
        fields.push({ key: "location", label: "Preferred Location", valid: isLocValid });

        const isBudgetValid = Boolean(
            (prefs.budget_min !== "" && !isNaN(Number(prefs.budget_min))) ||
            (prefs.budget_max !== "" && !isNaN(Number(prefs.budget_max)))
        );
        fields.push({ key: "budget", label: "Budget Range", valid: isBudgetValid });

        const isOccValid = Boolean(prefs.occupation && prefs.occupation.trim());
        fields.push({ key: "occupation", label: "Occupation / Status", valid: isOccValid });

        const isSmokeValid = Boolean(prefs.smoking_preference);
        fields.push({ key: "smoking", label: "Smoking Policy", valid: isSmokeValid });

        const isDrinkValid = Boolean(prefs.drinking_preference);
        fields.push({ key: "drinking", label: "Drinking Preference", valid: isDrinkValid });

        const isFoodValid = Boolean(prefs.food_preferences);
        fields.push({ key: "food", label: "Dietary Preference", valid: isFoodValid });

        const isSleepValid = Boolean(prefs.sleep_schedule);
        fields.push({ key: "sleep", label: "Sleep Schedule", valid: isSleepValid });

        const isCleanValid = prefs.cleanliness !== null && prefs.cleanliness !== undefined && !isNaN(Number(prefs.cleanliness));
        fields.push({ key: "cleanliness", label: "Cleanliness Rating", valid: isCleanValid });

        const missing = fields.filter((f) => !f.valid).map((f) => f.label);
        const completedCount = fields.filter((f) => f.valid).length;
        const percentage = Math.round((completedCount / fields.length) * 100);
        return {
            fields,
            missing,
            completedCount,
            total: fields.length,
            percentage,
            isComplete: missing.length === 0,
        };
    }, [name, prefs]);

    const profileCompletion = mandatoryStatus.percentage;

    // UPI ID status validation helper
    const upiValidation = useMemo(() => {
        const trimmed = upiId.trim();
        if (!trimmed) {
            return {
                valid: null,
                message: "Optional. Add a UPI ID so roommates can pay shared expense balances directly to your bank account.",
            };
        }
        if (isValidUpiId(trimmed)) {
            return {
                valid: true,
                message: "Valid UPI ID format (username@bank). Routing is confirmed during bank transfer.",
            };
        }
        return {
            valid: false,
            message: "Invalid UPI ID. Format must be username@bank (e.g. name@okhdfcbank or 9876543210@paytm).",
        };
    }, [upiId]);

    // Username validation helper
    const validateUsernameInput = (val) => {
        const trimmed = val.trim();
        if (!trimmed) return null;
        if (trimmed.length < 3) {
            return "Username must be at least 3 characters";
        }
        if (trimmed.length > 30) {
            return "Username must be 30 characters or fewer";
        }
        if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
            return "Username can only contain letters, numbers, and underscores";
        }
        return null;
    };

    // Handle avatar file selection and upload
    const handleAvatarSelect = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            toast.error("File size must be under 5 MB");
            e.target.value = "";
            return;
        }

        const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        if (!allowed.includes(file.type)) {
            toast.error("Only JPG, PNG, GIF, and WebP images are allowed");
            e.target.value = "";
            return;
        }

        const tempUrl = URL.createObjectURL(file);
        setPreviewUrl(tempUrl);

        try {
            setUploading(true);
            const formData = new FormData();
            formData.append("file", file);
            const res = await api.post("/settings/avatar", formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            setAvatarUrl(res.data.avatar_url);
            URL.revokeObjectURL(tempUrl);
            setPreviewUrl(null);
            localStorage.setItem("user_avatar", res.data.avatar_url);
            window.dispatchEvent(new Event("storage"));
            toast.success("Profile photo updated successfully");
        } catch (error) {
            URL.revokeObjectURL(tempUrl);
            setPreviewUrl(null);
            toast.error(errorMessage(error, "Upload failed. Please try a different image."));
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // Handle profile photo removal
    const handleRemoveAvatar = async () => {
        try {
            setUploading(true);
            await api.delete("/settings/avatar");
            setAvatarUrl(null);
            setPreviewUrl(null);
            localStorage.removeItem("user_avatar");
            window.dispatchEvent(new Event("storage"));
            setShowRemoveAvatarModal(false);
            toast.success("Profile photo removed");
        } catch (error) {
            toast.error(errorMessage(error, "Could not remove profile photo"));
        } finally {
            setUploading(false);
        }
    };

    // Discard account changes
    const handleDiscardAccount = () => {
        setName(initialAccount.name);
        setUsername(initialAccount.username);
        setUpiId(initialAccount.upiId);
        setAccountErrors({});
        toast.info("Account changes discarded");
    };

    // Save account details
    const handleSaveAccount = async () => {
        const errors = {};
        const cleanName = name.trim();
        const cleanUsername = username.trim();
        const cleanUpi = upiId.trim();

        if (!cleanName) {
            errors.name = "Full name is required";
        } else if (cleanName.length > 100) {
            errors.name = "Full name must be 100 characters or fewer";
        }

        const usernameErr = validateUsernameInput(cleanUsername);
        if (usernameErr) {
            errors.username = usernameErr;
        }

        if (cleanUpi && !isValidUpiId(cleanUpi)) {
            errors.upiId = "Enter a valid UPI ID in username@bank format";
        }

        setAccountErrors(errors);
        if (Object.keys(errors).length > 0) {
            toast.error("Please fix the validation errors before saving");
            return;
        }

        try {
            setSavingAccount(true);
            const res = await api.put("/settings/account", {
                name: cleanName,
                username: cleanUsername || null,
                upi_id: cleanUpi || null,
            });

            const updatedName = res.data.name ?? cleanName;
            const updatedUsername = res.data.username || "";
            const updatedUpi = res.data.upi_id || "";

            setName(updatedName);
            setUsername(updatedUsername);
            setUpiId(updatedUpi);

            setInitialAccount({
                name: updatedName,
                username: updatedUsername,
                upiId: updatedUpi,
            });

            localStorage.setItem("user_name", updatedName);
            if (updatedUsername) {
                localStorage.setItem("user_username", updatedUsername);
            } else {
                localStorage.removeItem("user_username");
            }
            if (updatedUpi) {
                localStorage.setItem("user_upi_id", updatedUpi);
            } else {
                localStorage.removeItem("user_upi_id");
            }
            window.dispatchEvent(new Event("storage"));

            setAccountErrors({});
            toast.success("Account details saved successfully");
        } catch (error) {
            const msg = errorMessage(error, "Could not save account details");
            if (msg.toLowerCase().includes("username is already taken")) {
                setAccountErrors((prev) => ({
                    ...prev,
                    username: "This username is already taken. Please choose another.",
                }));
            }
            toast.error(msg);
        } finally {
            setSavingAccount(false);
        }
    };

    // Request email verification code
    const handleRequestEmailChange = async (e) => {
        if (e) e.preventDefault();
        const cleanEmail = newEmail.trim().toLowerCase();

        if (!cleanEmail) {
            toast.error("Please enter a new email address");
            return;
        }
        if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
            toast.error("Please enter a valid email address");
            return;
        }
        if (cleanEmail === email.toLowerCase()) {
            toast.error("The new email is the same as your current address");
            return;
        }

        try {
            setRequestingEmail(true);
            const res = await api.post("/settings/email/request-change", {
                new_email: cleanEmail,
            });
            setEmailStep(2);
            setEmailCode("");
            toast.success(res.data?.message || "Verification code sent to your new email");
        } catch (error) {
            toast.error(errorMessage(error, "Could not send verification code"));
        } finally {
            setRequestingEmail(false);
        }
    };

    // Confirm email verification code
    const handleConfirmEmailChange = async (e) => {
        if (e) e.preventDefault();
        const cleanCode = emailCode.trim();

        if (!cleanCode) {
            toast.error("Please enter the 6-digit verification code");
            return;
        }

        try {
            setConfirmingEmail(true);
            const res = await api.post("/settings/email/confirm-change", {
                new_email: newEmail.trim().toLowerCase(),
                code: cleanCode,
            });
            setEmail(res.data.email);
            setNewEmail("");
            setEmailCode("");
            setEmailStep(0);
            toast.success("Email address updated successfully");
        } catch (error) {
            toast.error(errorMessage(error, "Could not verify code. Please check and try again."));
        } finally {
            setConfirmingEmail(false);
        }
    };

    // Discard living preferences changes
    const handleDiscardPrefs = () => {
        setPrefs(initialPrefs);
        toast.info("Living preferences discarded");
    };

    // Save living preferences
    const handleSavePrefs = async () => {
        try {
            setSavingPrefs(true);

            // Client-side validations
            if (prefs.dob) {
                const age = calculateAge(prefs.dob);
                if (age === null || age < 18) {
                    toast.error("You must be at least 18 years old to join CoRoomies.");
                    setSavingPrefs(false);
                    return;
                }
                if (age > 100) {
                    toast.error("Please enter a realistic date of birth (maximum age is 100).");
                    setSavingPrefs(false);
                    return;
                }
            }
            if (prefs.budget_min !== "" && prefs.budget_max !== "") {
                if (Number(prefs.budget_min) > Number(prefs.budget_max)) {
                    toast.error("Minimum budget cannot exceed maximum budget.");
                    setSavingPrefs(false);
                    return;
                }
            }

            const payload = {
                ...prefs,
                cleanliness: Math.min(10, Math.max(1, Number(prefs.cleanliness) || 5)),
                noise_tolerance: Math.min(10, Math.max(1, Number(prefs.noise_tolerance) || 5)),
                college: prefs.college?.trim() || null,
                degree: prefs.degree?.trim() || null,
                stream: prefs.stream?.trim() || null,
                year: prefs.year ? Number(prefs.year) : null,
                dob: prefs.dob || null,
                gender: prefs.gender || null,
                preferred_flatmate_gender: prefs.preferred_flatmate_gender || "unisex",
                location: prefs.location?.trim() || null,
                budget_min: prefs.budget_min !== "" ? Number(prefs.budget_min) : null,
                budget_max: prefs.budget_max !== "" ? Number(prefs.budget_max) : null,
                occupation: prefs.occupation?.trim() || null,
                drinking_preference: prefs.drinking_preference || null,
                preferred_age_min: prefs.preferred_age_min !== "" ? Number(prefs.preferred_age_min) : null,
                preferred_age_max: prefs.preferred_age_max !== "" ? Number(prefs.preferred_age_max) : null,
            };

            await api.put("/profile/", payload);
            setInitialPrefs({ ...prefs });
            toast.success("Living preferences saved. Matchmaking ratings updated!");
            window.dispatchEvent(new CustomEvent("coroomies:profile-updated"));
        } catch (error) {
            toast.error(errorMessage(error, "Could not save preferences"));
        } finally {
            setSavingPrefs(false);
        }
    };

    const displayAvatar = previewUrl || (avatarUrl ? `${API_BASE}${avatarUrl}` : "");
    const displayName = localStorage.getItem("user_name") || name || "Roommate";
    const emailLocked = requestingEmail || confirmingEmail;

    if (loading) {
        return (
            <div className="w-full max-w-4xl mx-auto space-y-6">
                <PageHeader
                    title="My Profile"
                    subtitle="Manage your personal identity, contact details, and living preferences."
                />
                <Card className="flex flex-col items-center justify-center py-20 text-center">
                    <Spinner size="lg" />
                    <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                        Loading profile details...
                    </p>
                </Card>
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl mx-auto space-y-6 pb-12">
            {/* Page Header with Profile Status Badges */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <PageHeader
                    title="My Profile"
                    subtitle="Manage your personal identity, contact details, and roommate living preferences."
                />
                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <Badge variant={profileCompletion >= 80 ? "success" : "brand"} dot>
                        Profile {profileCompletion}% complete
                    </Badge>
                    <Badge variant="neutral">
                        @{username || "roommate"}
                    </Badge>
                </div>
            </div>

            {/* Profile Completion Status Banner */}
            {!mandatoryStatus.isComplete ? (
                <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 dark:border-amber-900/50 dark:from-amber-950/30 dark:to-orange-950/20 p-4 sm:p-5 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                                <AlertIcon className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                                        Mandatory Profile: {mandatoryStatus.percentage}% Complete
                                    </h3>
                                    <Badge variant="warning" size="sm">Action Required</Badge>
                                </div>
                                <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                                    Complete all required fields below to unlock flatmate discovery and send roommate connection requests.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 self-start sm:self-auto">
                            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                                {mandatoryStatus.missing.length} missing field{mandatoryStatus.missing.length > 1 ? "s" : ""}
                            </span>
                        </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="mt-3.5 h-2 w-full overflow-hidden rounded-full bg-amber-200/60 dark:bg-amber-900/40">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                            style={{ width: `${mandatoryStatus.percentage}%` }}
                        />
                    </div>
                    {/* Missing fields pills */}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-amber-800/80 dark:text-amber-300/80 mr-1">Missing:</span>
                        {mandatoryStatus.missing.map((f, idx) => (
                            <span
                                key={idx}
                                className="inline-flex items-center gap-1 rounded-md bg-white/90 dark:bg-slate-800/90 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800/60 shadow-2xs"
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                {f}
                            </span>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 to-teal-50 dark:border-emerald-900/50 dark:from-emerald-950/30 dark:to-teal-950/20 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-xs">
                            <CheckCircleIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                                Mandatory Profile 100% Complete!
                            </h3>
                            <p className="text-xs text-emerald-800 dark:text-emerald-300">
                                Your profile meets all requirements. Flatmate discovery and roommate matching are fully active.
                            </p>
                        </div>
                    </div>
                    <Badge variant="success" dot className="self-start sm:self-auto">
                        Discovery Active
                    </Badge>
                </div>
            )}

            {/* Section Switcher Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200/60 dark:border-slate-700/60 max-w-full overflow-x-auto no-scrollbar touch-scroll">
                <button
                    type="button"
                    onClick={() => setActiveSection("all")}
                    className={`shrink-0 whitespace-nowrap px-3.5 py-1.5 min-h-[40px] text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer ${
                        activeSection === "all"
                            ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                >
                    All Sections
                </button>
                <button
                    type="button"
                    onClick={() => setActiveSection("account")}
                    className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3.5 py-1.5 min-h-[40px] text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer ${
                        activeSection === "account"
                            ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                >
                    <UserRoundIcon className="h-4 w-4" />
                    Account Details
                    {isAccountDirty && (
                        <span className="h-2 w-2 rounded-full bg-amber-500" title="Unsaved changes" />
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => setActiveSection("preferences")}
                    className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3.5 py-1.5 min-h-[40px] text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer ${
                        activeSection === "preferences"
                            ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                >
                    <SlidersHorizontalIcon className="h-4 w-4 text-violet-500" />
                    Living Preferences
                    {isPrefsDirty && (
                        <span className="h-2 w-2 rounded-full bg-amber-500" title="Unsaved changes" />
                    )}
                </button>
            </div>

            {/* SECTION 1: ACCOUNT DETAILS & IDENTITY */}
            {(activeSection === "all" || activeSection === "account") && (
                <Card className="p-5 sm:p-7 shadow-sm transition-all duration-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-5 mb-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400 ring-1 ring-inset ring-brand-500/20">
                                <UserRoundIcon className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
                                    Account Details & Identity
                                </h2>
                                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                                    Your public avatar, display name, handle, and payment settlement ID.
                                </p>
                            </div>
                        </div>
                        {isAccountDirty && (
                            <Badge variant="warning" dot className="self-start sm:self-auto">
                                Unsaved changes
                            </Badge>
                        )}
                    </div>

                    {/* Profile Photo Area */}
                    <div className="mb-8 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-700/50 dark:bg-slate-800/40">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                            {/* Avatar with click-to-preview & camera button */}
                            <div className="relative group shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setShowPreviewModal(true)}
                                    className="block relative rounded-2xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 cursor-pointer shadow-sm"
                                    aria-label="View larger profile photo"
                                    title="Click to view full photo"
                                >
                                    <Avatar
                                        name={displayName}
                                        src={displayAvatar}
                                        size="xl"
                                        className="h-20 w-20 sm:h-22 sm:w-22 rounded-2xl ring-2 ring-white dark:ring-slate-700 object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium gap-1 backdrop-blur-[1px]">
                                        <EyeIcon className="h-4 w-4" />
                                        <span>View</span>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="absolute -bottom-1.5 -right-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-white dark:bg-slate-700 shadow-md ring-1 ring-slate-200 dark:ring-slate-600 transition-all hover:bg-slate-50 dark:hover:bg-slate-600 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 cursor-pointer"
                                    aria-label="Upload or change profile photo"
                                    title="Upload photo"
                                >
                                    <CameraIcon className="h-4 w-4 text-slate-700 dark:text-slate-200" />
                                </button>

                                {uploading && (
                                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-[2px]">
                                        <Spinner size="md" />
                                    </div>
                                )}
                            </div>

                            {/* Photo Details and Actions */}
                            <div className="flex-1 space-y-2">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploading}
                                    >
                                        <CameraIcon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                                        <span>{avatarUrl ? "Change Photo" : "Upload Photo"}</span>
                                    </Button>

                                    {avatarUrl && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowPreviewModal(true)}
                                            disabled={uploading}
                                        >
                                            <EyeIcon className="h-4 w-4" />
                                            <span>View Full Size</span>
                                        </Button>
                                    )}

                                    {avatarUrl && (
                                        <Button
                                            variant="dangerOutline"
                                            size="sm"
                                            onClick={() => setShowRemoveAvatarModal(true)}
                                            disabled={uploading}
                                        >
                                            <Trash2Icon className="h-4 w-4" />
                                            <span>Remove</span>
                                        </Button>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                    JPG, PNG, GIF, or WebP. Maximum file size 5 MB. A square aspect ratio (1:1) looks best on discovery cards.
                                </p>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/gif,image/webp"
                                className="hidden"
                                onChange={handleAvatarSelect}
                            />
                        </div>
                    </div>

                    {/* Form Fields Grid */}
                    <div className="space-y-5">
                        {/* Full Name & Username in 2 Columns */}
                        <div className="grid gap-5 sm:grid-cols-2">
                            {/* Full Name */}
                            <div>
                                <Input
                                    id="profile-name"
                                    label="Full Name"
                                    required
                                    value={name}
                                    error={accountErrors.name}
                                    onChange={(e) => {
                                        setName(e.target.value);
                                        if (accountErrors.name) {
                                            setAccountErrors((prev) => ({ ...prev, name: null }));
                                        }
                                    }}
                                    placeholder="Enter your full name"
                                    disabled={savingAccount}
                                    hint="Visible on your profile, flatmate matching, and group expenses."
                                />
                            </div>

                            {/* Username Handle */}
                            <div>
                                <Input
                                    id="profile-username"
                                    label="Username"
                                    value={username}
                                    error={accountErrors.username}
                                    onChange={(e) => {
                                        const clean = e.target.value.replace(/[^a-zA-Z0-9_]/g, "");
                                        setUsername(clean);
                                        if (accountErrors.username) {
                                            setAccountErrors((prev) => ({ ...prev, username: null }));
                                        }
                                    }}
                                    placeholder="e.g. alex_roomie"
                                    disabled={savingAccount || (!canChangeUsername && username !== "")}
                                    hint={
                                        username
                                            ? `Other users can find and tag you via @${username}`
                                            : "Choose a unique username handle (letters, numbers, underscores)."
                                    }
                                />

                                {/* Cooldown Notification */}
                                {!canChangeUsername && (
                                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                                        <ClockIcon className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                                        <span>
                                            Username was changed on{" "}
                                            <strong>
                                                {usernameChangedAt
                                                    ? new Date(usernameChangedAt).toLocaleDateString("en-US", {
                                                          day: "numeric",
                                                          month: "short",
                                                          year: "numeric",
                                                      })
                                                    : "recently"}
                                            </strong>
                                            . For account security, it can be updated again in{" "}
                                            <strong>{daysUntilChange} days</strong>.
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* UPI ID (VPA) with Live Validation */}
                        <div className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-700/80 bg-white dark:bg-slate-800">
                            <div className="flex items-center gap-2 mb-2">
                                <WalletIcon className="h-4.5 w-4.5 text-brand-500" />
                                <label
                                    htmlFor="profile-upi-id"
                                    className="text-sm font-semibold text-slate-800 dark:text-slate-200"
                                >
                                    UPI ID (VPA) for Expense Settlements
                                </label>
                            </div>
                            <Input
                                id="profile-upi-id"
                                value={upiId}
                                error={accountErrors.upiId}
                                onChange={(e) => {
                                    setUpiId(e.target.value.trim().toLowerCase());
                                    if (accountErrors.upiId) {
                                        setAccountErrors((prev) => ({ ...prev, upiId: null }));
                                    }
                                }}
                                placeholder="username@okhdfcbank, 9876543210@paytm, etc."
                                disabled={savingAccount}
                            />
                            {/* UPI Helper Message / Syntax Feedback */}
                            <div className="mt-2 flex items-start gap-2 text-xs">
                                {upiValidation.valid === true ? (
                                    <>
                                        <CheckCircleIcon className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                        <span className="text-emerald-700 dark:text-emerald-400">
                                            {upiValidation.message}
                                        </span>
                                    </>
                                ) : upiValidation.valid === false ? (
                                    <>
                                        <AlertIcon className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                                        <span className="text-rose-600 dark:text-rose-400">
                                            {upiValidation.message}
                                        </span>
                                    </>
                                ) : (
                                    <p className="text-slate-500 dark:text-slate-400">
                                        {upiValidation.message}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Email Address & Two-Step Verification Flow */}
                        <div className="rounded-xl border border-slate-200/80 p-4 dark:border-slate-700/80 bg-white dark:bg-slate-800">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <label
                                    htmlFor="profile-email-display"
                                    className="text-sm font-semibold text-slate-800 dark:text-slate-200"
                                >
                                    Email Address (Login & Security)
                                </label>
                                <Badge variant="success" dot>
                                    Verified
                                </Badge>
                            </div>

                            {emailStep === 0 ? (
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center gap-2.5 truncate">
                                        <span id="profile-email-display" className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                                            {email}
                                        </span>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                            setNewEmail("");
                                            setEmailCode("");
                                            setEmailStep(1);
                                        }}
                                    >
                                        Change Email
                                    </Button>
                                </div>
                            ) : emailStep === 1 ? (
                                /* Step 1: Enter New Email */
                                <form onSubmit={handleRequestEmailChange} className="space-y-3 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <div>
                                        <Input
                                            type="email"
                                            id="new-email-input"
                                            label="New Email Address"
                                            value={newEmail}
                                            onChange={(e) => setNewEmail(e.target.value)}
                                            placeholder="Enter your new email address"
                                            disabled={emailLocked}
                                            required
                                            hint="We will send a 6-digit confirmation code to verify access."
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <Button
                                            type="submit"
                                            size="sm"
                                            loading={requestingEmail}
                                        >
                                            Send Verification Code
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => {
                                                setEmailStep(0);
                                                setNewEmail("");
                                            }}
                                            disabled={emailLocked}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </form>
                            ) : (
                                /* Step 2: Enter Verification Code */
                                <form onSubmit={handleConfirmEmailChange} className="space-y-3 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-brand-200 dark:border-brand-500/30">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-slate-600 dark:text-slate-400">
                                            Verification code sent to <strong>{newEmail}</strong>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setEmailStep(1)}
                                            className="text-brand-600 hover:underline dark:text-brand-400 font-medium"
                                        >
                                            Change email
                                        </button>
                                    </div>
                                    <Input
                                        id="email-code-input"
                                        label="6-Digit Verification Code"
                                        value={emailCode}
                                        onChange={(e) => setEmailCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                                        placeholder="e.g. 123456"
                                        maxLength={6}
                                        disabled={confirmingEmail}
                                        required
                                        hint="Valid for 15 minutes. Check your inbox and spam folder."
                                    />
                                    <div className="flex flex-wrap items-center gap-2 pt-1">
                                        <Button
                                            type="submit"
                                            size="sm"
                                            loading={confirmingEmail}
                                        >
                                            <CheckCircleIcon className="h-4 w-4" />
                                            Verify & Update Email
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={handleRequestEmailChange}
                                            disabled={emailLocked}
                                        >
                                            <RefreshIcon className="h-3.5 w-3.5" />
                                            Resend Code
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setEmailStep(0);
                                                setNewEmail("");
                                                setEmailCode("");
                                            }}
                                            disabled={emailLocked}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>

                    {/* Account Save & Discard Action Bar */}
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-700/60 pt-5">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            {isAccountDirty ? (
                                <span className="font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                    <AlertIcon className="h-3.5 w-3.5" /> You have unsaved account changes
                                </span>
                            ) : (
                                <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                                    <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" /> Account details up to date
                                </span>
                            )}
                        </div>

                        <div className="flex w-full sm:w-auto items-center gap-2.5">
                            {isAccountDirty && (
                                <Button
                                    variant="secondary"
                                    onClick={handleDiscardAccount}
                                    disabled={savingAccount}
                                    className="flex-1 sm:flex-initial"
                                >
                                    Discard
                                </Button>
                            )}
                            <Button
                                loading={savingAccount}
                                onClick={handleSaveAccount}
                                disabled={!isAccountDirty || savingAccount}
                                className="flex-1 sm:flex-initial"
                            >
                                <SaveIcon className="h-4 w-4" />
                                Save Account Details
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {/* SECTION 2: LIVING PREFERENCES */}
            {(activeSection === "all" || activeSection === "preferences") && (
                <Card className="p-5 sm:p-7 shadow-sm transition-all duration-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-5 mb-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400 ring-1 ring-inset ring-violet-500/20">
                                <SlidersHorizontalIcon className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
                                    Living Preferences
                                </h2>
                                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                                    Configure your routine and lifestyle to generate high-accuracy roommate matches.
                                </p>
                            </div>
                        </div>
                        {isPrefsDirty && (
                            <Badge variant="warning" dot className="self-start sm:self-auto">
                                Unsaved changes
                            </Badge>
                        )}
                    </div>

                    {/* Preference Categories */}
                    <div className="space-y-8">
                        {/* Mandatory Demographics & Mutual Flatmate Matching */}
                        <div className="rounded-2xl border-2 border-brand-200/90 dark:border-brand-800/80 p-4 sm:p-6 bg-brand-50/30 dark:bg-brand-950/20 space-y-6">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                                        <UsersRoundIcon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                                                Identity, Gender & Roommate Criteria
                                            </h3>
                                            <Badge variant="brand" size="sm">Mandatory</Badge>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            Required for flatmate discovery and mutual compatibility matching.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Date of Birth & Age */}
                            <div className="space-y-1.5">
                                <label htmlFor="profile-dob" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    Date of Birth <span className="text-rose-500">*</span>
                                </label>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                    <input
                                        id="profile-dob"
                                        type="date"
                                        max={maxDobDate}
                                        min={minDobDate}
                                        value={prefs.dob || ""}
                                        onChange={(e) => setPrefs((prev) => ({ ...prev, dob: e.target.value }))}
                                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                    />
                                    {calculateAge(prefs.dob) !== null && (
                                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300 text-xs font-bold shrink-0 self-start sm:self-auto">
                                            <span>{calculateAge(prefs.dob)} years old</span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Strictly private. Your full date of birth is never revealed publicly; only your calculated age is shown to eligible flatmates. (Must be 18+)
                                </p>
                            </div>

                            {/* Your Gender */}
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    Your Gender <span className="text-rose-500">*</span>
                                </label>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    We never assume your gender based on name or photo. Select how you identify:
                                </p>
                                <div className="grid gap-2.5 sm:grid-cols-3">
                                    {[
                                        { value: "male", label: "Male", desc: "Identify as Male" },
                                        { value: "female", label: "Female", desc: "Identify as Female" },
                                        { value: "prefer_not_to_say", label: "Prefer not to say", desc: "Private (matched with Unisex preference only)" },
                                    ].map((opt) => {
                                        const isSelected = prefs.gender === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setPrefs((prev) => ({ ...prev, gender: opt.value }))}
                                                className={`relative flex flex-col items-start p-3.5 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                                                    isSelected
                                                        ? "border-brand-500 bg-brand-50/80 dark:bg-brand-950/40 text-slate-900 dark:text-slate-100 ring-2 ring-brand-500/30 shadow-xs"
                                                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between w-full">
                                                    <span className="text-sm font-semibold">{opt.label}</span>
                                                    <span className={`h-4 w-4 rounded-full border flex items-center justify-center ${isSelected ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 dark:border-slate-600"}`}>
                                                        {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-snug">
                                                    {opt.desc}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Preferred Flatmate Gender */}
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    Who would you prefer to live with? <span className="text-rose-500">*</span>
                                </label>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Gender identity and flatmate preference are separate fields. Both sides must agree for mutual compatibility:
                                </p>
                                <div className="grid gap-2.5 sm:grid-cols-3">
                                    {[
                                        { value: "female", label: "Female", desc: "Show female flatmate suggestions only." },
                                        { value: "male", label: "Male", desc: "Show male flatmate suggestions only." },
                                        { value: "unisex", label: "Unisex", desc: "Show compatible flatmates of all genders." },
                                    ].map((opt) => {
                                        const isSelected = (prefs.preferred_flatmate_gender || "unisex") === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setPrefs((prev) => ({ ...prev, preferred_flatmate_gender: opt.value }))}
                                                className={`relative flex flex-col items-start p-3.5 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                                                    isSelected
                                                        ? "border-brand-500 bg-brand-50/80 dark:bg-brand-950/40 text-slate-900 dark:text-slate-100 ring-2 ring-brand-500/30 shadow-xs"
                                                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between w-full">
                                                    <span className="text-sm font-semibold">{opt.label}</span>
                                                    <span className={`h-4 w-4 rounded-full border flex items-center justify-center ${isSelected ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 dark:border-slate-600"}`}>
                                                        {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-snug">
                                                    {opt.desc}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Preferred Location & Occupation */}
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Input
                                    id="profile-location"
                                    label="Preferred Living Location *"
                                    placeholder="e.g. Koramangala, Bangalore or South Delhi"
                                    value={prefs.location || ""}
                                    onChange={(e) => setPrefs((prev) => ({ ...prev, location: e.target.value }))}
                                    disabled={savingPrefs}
                                    hint="The neighbourhood or city where you are looking to rent."
                                />
                                <Input
                                    id="profile-occupation"
                                    label="Occupation / Current Status *"
                                    placeholder="e.g. Software Engineer, Medical Student"
                                    value={prefs.occupation || ""}
                                    onChange={(e) => setPrefs((prev) => ({ ...prev, occupation: e.target.value }))}
                                    disabled={savingPrefs}
                                    hint="Your current profession, student status, or field."
                                />
                            </div>

                            {/* Budget Range & Flatmate Age Preferences */}
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                        Monthly Rent Budget Range (₹) *
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input
                                            id="profile-budget-min"
                                            type="number"
                                            placeholder="Min (e.g. 8000)"
                                            value={prefs.budget_min ?? ""}
                                            onChange={(e) => setPrefs((prev) => ({ ...prev, budget_min: e.target.value }))}
                                            disabled={savingPrefs}
                                        />
                                        <Input
                                            id="profile-budget-max"
                                            type="number"
                                            placeholder="Max (e.g. 16000)"
                                            value={prefs.budget_max ?? ""}
                                            onChange={(e) => setPrefs((prev) => ({ ...prev, budget_max: e.target.value }))}
                                            disabled={savingPrefs}
                                        />
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Expected rent per person.
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                        Preferred Flatmate Age Range (Years)
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Input
                                            id="profile-age-min"
                                            type="number"
                                            placeholder="Min (e.g. 20)"
                                            value={prefs.preferred_age_min ?? ""}
                                            onChange={(e) => setPrefs((prev) => ({ ...prev, preferred_age_min: e.target.value }))}
                                            disabled={savingPrefs}
                                        />
                                        <Input
                                            id="profile-age-max"
                                            type="number"
                                            placeholder="Max (e.g. 30)"
                                            value={prefs.preferred_age_max ?? ""}
                                            onChange={(e) => setPrefs((prev) => ({ ...prev, preferred_age_max: e.target.value }))}
                                            disabled={savingPrefs}
                                        />
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Leave blank if open to flatmates of any adult age.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {PREFERENCE_GROUPS.map((group) => {
                            const GroupIcon = group.icon;
                            return (
                                <div
                                    key={group.id}
                                    className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-800/30"
                                >
                                    <div className="flex items-start gap-3 mb-4">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600">
                                            <GroupIcon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                {group.title}
                                            </h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                {group.description}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        {group.fields.map((field) => (
                                            <div key={field.key} className="space-y-1">
                                                <Select
                                                    id={`profile-pref-${field.key}`}
                                                    label={field.label}
                                                    hint={field.hint}
                                                    value={String(prefs[field.key] ?? "")}
                                                    disabled={savingPrefs}
                                                    onChange={(e) =>
                                                        setPrefs((prev) => ({
                                                            ...prev,
                                                            [field.key]: e.target.value,
                                                        }))
                                                    }
                                                >
                                                    {field.options.map(([value, label]) => (
                                                        <option key={value} value={value}>
                                                            {label}
                                                        </option>
                                                    ))}
                                                </Select>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Optional Academic & Professional Background */}
                        <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 p-4 sm:p-6 bg-slate-50/50 dark:bg-slate-800/30">
                            <div className="flex items-start gap-3 mb-4">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600">
                                    <GraduationCapIcon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                        <span>Education & Background</span>
                                        <Badge variant="neutral">Optional</Badge>
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Helps find roommates from your college, university, or academic field.
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <Input
                                    id="profile-college"
                                    label="College / University"
                                    value={prefs.college || ""}
                                    onChange={(e) =>
                                        setPrefs((prev) => ({ ...prev, college: e.target.value }))
                                    }
                                    placeholder="e.g. IIT Bombay, St. Xavier's, Delhi University"
                                    disabled={savingPrefs}
                                />
                                <Input
                                    id="profile-degree"
                                    label="Degree / Major"
                                    value={prefs.degree || ""}
                                    onChange={(e) =>
                                        setPrefs((prev) => ({ ...prev, degree: e.target.value }))
                                    }
                                    placeholder="e.g. B.Tech Computer Science, MBA Finance"
                                    disabled={savingPrefs}
                                />
                                <Input
                                    id="profile-stream"
                                    label="Stream / Specialization"
                                    value={prefs.stream || ""}
                                    onChange={(e) =>
                                        setPrefs((prev) => ({ ...prev, stream: e.target.value }))
                                    }
                                    placeholder="e.g. Engineering, Design, Business"
                                    disabled={savingPrefs}
                                />
                                <Select
                                    id="profile-year"
                                    label="Graduation Year"
                                    value={prefs.year || ""}
                                    onChange={(e) =>
                                        setPrefs((prev) => ({ ...prev, year: e.target.value }))
                                    }
                                    disabled={savingPrefs}
                                >
                                    <option value="">Not specified</option>
                                    {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                                        <option key={y} value={String(y)}>
                                            Class of {y}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Preferences Save & Discard Action Bar */}
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-700/60 pt-5">
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                            {isPrefsDirty ? (
                                <span className="font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                    <AlertIcon className="h-3.5 w-3.5" /> You have unsaved living preferences
                                </span>
                            ) : (
                                <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                                    <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" /> Preferences synchronized
                                </span>
                            )}
                        </div>

                        <div className="flex w-full sm:w-auto items-center gap-2.5">
                            {isPrefsDirty && (
                                <Button
                                    variant="secondary"
                                    onClick={handleDiscardPrefs}
                                    disabled={savingPrefs}
                                    className="flex-1 sm:flex-initial"
                                >
                                    Discard
                                </Button>
                            )}
                            <Button
                                loading={savingPrefs}
                                onClick={handleSavePrefs}
                                disabled={!isPrefsDirty || savingPrefs}
                                className="flex-1 sm:flex-initial"
                            >
                                <SaveIcon className="h-4 w-4" />
                                Save Living Preferences
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {/* Matchmaking Algorithm Callout Banner */}
            <Card className="p-5 sm:p-6 bg-gradient-to-br from-brand-500/5 via-violet-500/5 to-transparent border-brand-200/60 dark:border-brand-500/20">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-300">
                            <SparklesIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                How CoRoomies Matchmaking Works
                            </h3>
                            <p className="mt-0.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
                                Your sleep schedule, noise tolerance, and cleanliness ratings are compared with prospective flatmates. Match compatibility scores recalculate immediately when preferences are updated.
                            </p>
                        </div>
                    </div>
                    {typeof setPage === "function" && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setPage("matches")}
                            className="shrink-0 w-full sm:w-auto"
                        >
                            <span>Explore Matches</span>
                            <ArrowRightIcon className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </Card>

            {/* Profile Photo Preview Modal */}
            <Modal
                open={showPreviewModal}
                onClose={() => setShowPreviewModal(false)}
                title="Profile Photo"
                maxWidth="max-w-md"
            >
                <div className="flex flex-col items-center justify-center py-2">
                    {displayAvatar ? (
                        <img
                            src={displayAvatar}
                            alt={displayName}
                            className="max-h-[65vh] w-auto max-w-full rounded-2xl object-cover shadow-lg ring-1 ring-black/10 dark:ring-white/10"
                        />
                    ) : (
                        <div className="flex h-44 w-44 items-center justify-center rounded-2xl bg-brand-500 text-5xl font-bold text-white shadow-inner">
                            {displayName?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                    )}
                    <p className="mt-4 text-center text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {displayName}
                    </p>
                    {username && (
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                            @{username}
                        </p>
                    )}
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <Button
                        variant="secondary"
                        onClick={() => setShowPreviewModal(false)}
                    >
                        Close
                    </Button>
                </div>
            </Modal>

            {/* Remove Profile Photo Confirmation Dialog */}
            <ConfirmDialog
                open={showRemoveAvatarModal}
                title="Remove profile photo?"
                message="Your profile photo will be permanently deleted and replaced with your initials avatar. You can upload a new photo at any time."
                confirmLabel="Remove Photo"
                cancelLabel="Keep Photo"
                variant="danger"
                loading={uploading}
                onConfirm={handleRemoveAvatar}
                onCancel={() => setShowRemoveAvatarModal(false)}
            />
        </div>
    );
}

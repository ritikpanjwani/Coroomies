import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "./api";
import Card from "./components/ui/Card";
import Button from "./components/ui/Button";
import Avatar from "./components/ui/Avatar";
import Modal from "./components/ui/Modal";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import Spinner from "./components/ui/Spinner";
import PageHeader from "./components/ui/PageHeader";
import Badge from "./components/ui/Badge";
import { Input, Select, Textarea } from "./components/ui/Field";
import { useToast } from "./components/Toast";
import {
    UserRoundIcon,
    CameraIcon,
    Trash2Icon,
    SparklesIcon,
    MoonIcon,
    UtensilsIcon,
    GraduationCapIcon,
    CheckCircleIcon,
    AlertIcon,
    RefreshIcon,
    EyeIcon,
    EyeOffIcon,
    ArrowRightIcon,
    SaveIcon,
    ClockIcon,
    UsersRoundIcon,
    PlusIcon,
    XIcon,
    ShieldCheckIcon,
    MapPinIcon,
} from "./components/Icons";
import { isValidUpiId } from "./utils/upi";
import { errorMessage, calculateAge, resolveAvatarUrl } from "./utils/format";
import {
    computeProfileCompleteness,
    HOUSING_INTENTS,
    MOVE_IN_TIMELINES,
    DEAL_BREAKER_OPTIONS,
} from "./utils/profileValidation";

// Default living preference values (empty strings / null for unset fields to prevent false completion)
const PREF_DEFAULTS = {
    sleep_schedule: "",
    cleanliness: null,
    noise_tolerance: null,
    study_habits: "",
    smoking_preference: "",
    food_preferences: "",
    drinking_preference: "",
    social_preferences: "",
    guest_preferences: "",
    work_from_home: "",
    study_environment: "",
    pets_preference: "",
    college: "",
    degree: "",
    stream: "",
    year: "",
    // Demographics & Smart Matching Fields
    dob: "",
    gender: "",
    preferred_flatmate_gender: "",
    location: "",
    budget_min: "",
    budget_max: "",
    occupation: "",
    preferred_age_min: "",
    preferred_age_max: "",
    // Phase 3 Smart Matching & Profile Features
    housing_intent: "",
    move_in_date: "",
    preferred_localities: [],
    deal_breakers: [],
    bio: "",
    profile_visibility: "hidden",
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

// Cleanliness ratings descriptions (1 to 5)
const CLEANLINESS_DESCRIPTIONS = {
    1: "Very relaxed — Mess doesn't bother me",
    2: "Casual — Tidies common areas weekly",
    3: "Balanced — Regular cleaning routine",
    4: "Organized — Tidies daily, neat shared spaces",
    5: "Meticulous — Spotless hygiene & high standards",
};

// Noise tolerance descriptions (1 to 5)
const NOISE_DESCRIPTIONS = {
    1: "Deep silence — Very sensitive, quiet hours essential",
    2: "Low tolerance — Headphones preferred for media",
    3: "Balanced — Normal daytime sounds are fine",
    4: "Lively — Comfortable with background audio and chatter",
    5: "High tolerance — Any noise level is fine",
};

// Section definitions
const SECTIONS = [
    {
        id: "personal",
        title: "Personal Details",
        shortTitle: "Personal",
        description: "Your identity, avatar, contact details, date of birth, and gender.",
        icon: UserRoundIcon,
    },
    {
        id: "criteria",
        title: "Roommate Criteria",
        shortTitle: "Criteria",
        description: "Preferred flatmate gender, budget range, location, and age preferences.",
        icon: UsersRoundIcon,
    },
    {
        id: "lifestyle",
        title: "Lifestyle & Social",
        shortTitle: "Lifestyle",
        description: "Food habits, smoking policy, drinking, social energy, guests, and pets.",
        icon: UtensilsIcon,
    },
    {
        id: "routine",
        title: "Daily Routine",
        shortTitle: "Routine",
        description: "Sleep schedules, peak study hours, cleanliness, and noise tolerance.",
        icon: MoonIcon,
    },
    {
        id: "education",
        title: "Education & Career",
        shortTitle: "Career",
        description: "Occupation, university, degree, specialization, and graduation year.",
        icon: GraduationCapIcon,
    },
];

// Accessible Chip Selection Group for Lifestyle & Routines
function ChipGroup({ id, label, required, hint, options, value, onChange, disabled }) {
    return (
        <div id={id} className="space-y-1.5">
            <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {label} {required && <span className="text-rose-500">*</span>}
                </label>
            </div>
            {hint && <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
            <div className="flex flex-wrap gap-2 pt-0.5">
                {options.map((opt) => {
                    const isSelected = value === opt.value;
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            disabled={disabled}
                            onClick={() => onChange(opt.value)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                                isSelected
                                    ? "bg-brand-600 text-white shadow-xs font-semibold ring-2 ring-brand-500/20"
                                    : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60"
                            }`}
                        >
                            <span>{opt.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// Interactive 1-5 Segmented Scale for Cleanliness & Noise
function SegmentedScale({ id, label, hint, value, onChange, descriptions, disabled, required }) {
    const hasValue = value !== null && value !== undefined && value !== "" && !isNaN(Number(value));
    const currentVal = hasValue ? Number(value) : null;
    const desc = currentVal ? (descriptions[currentVal] || "") : "Not set — choose from 1 to 5";

    return (
        <div id={id} className="space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {label} {required && <span className="text-rose-500">*</span>}
                    </label>
                    {hint && <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
                </div>
                {hasValue ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/50 px-2 py-0.5 rounded-md border border-brand-200 dark:border-brand-800/80">
                        <span>{currentVal}</span>
                        <span className="text-[10px] text-slate-400 font-normal">/ 5</span>
                    </span>
                ) : (
                    <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                        Not set
                    </span>
                )}
            </div>

            {/* 5-point segmented bar */}
            <div className="grid grid-cols-5 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/70 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                {[1, 2, 3, 4, 5].map((num) => {
                    const isSelected = currentVal === num;
                    return (
                        <button
                            key={num}
                            type="button"
                            disabled={disabled}
                            onClick={() => onChange(num)}
                            className={`h-9 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer flex items-center justify-center ${
                                isSelected
                                    ? "bg-brand-600 text-white shadow-xs scale-102 ring-2 ring-brand-500/20"
                                    : "text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100"
                            }`}
                        >
                            {num}
                        </button>
                    );
                })}
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5 font-medium min-h-[20px]">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${hasValue ? "bg-brand-500" : "bg-slate-400"}`} />
                <span className="truncate">{desc}</span>
            </p>
        </div>
    );
}

export default function Profile({ setPage }) {
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("personal");

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
    const [savedProfile, setSavedProfile] = useState(null);

    // Living preferences state
    const [prefs, setPrefs] = useState(PREF_DEFAULTS);

    // Operational state
    const [isSaving, setIsSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [showPublicPreviewModal, setShowPublicPreviewModal] = useState(false);
    const [previewFailed, setPreviewFailed] = useState(false);
    const [showRemoveAvatarModal, setShowRemoveAvatarModal] = useState(false);

    // Email change state (dedicated modal)
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [emailCode, setEmailCode] = useState("");
    const [emailStep, setEmailStep] = useState(1); // 1: Request, 2: Code
    const [requestingEmail, setRequestingEmail] = useState(false);
    const [confirmingEmail, setConfirmingEmail] = useState(false);

    // Form errors
    const [accountErrors, setAccountErrors] = useState({});

    const fileInputRef = useRef(null);
    const toast = useToast();

    // Fetch user settings and living preferences
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
                    setSavedProfile(d);
                    const loadedPrefs = {
                        ...PREF_DEFAULTS,
                        ...d,
                        cleanliness: d.cleanliness !== null && d.cleanliness !== undefined && d.cleanliness !== "" ? Number(d.cleanliness) : null,
                        noise_tolerance: d.noise_tolerance !== null && d.noise_tolerance !== undefined && d.noise_tolerance !== "" ? Number(d.noise_tolerance) : null,
                        college: d.college || "",
                        degree: d.degree || "",
                        stream: d.stream || "",
                        year: d.year ? String(d.year) : "",
                        dob: d.dob || "",
                        gender: d.gender || "",
                        preferred_flatmate_gender: d.preferred_flatmate_gender || "",
                        location: d.location || "",
                        budget_min: d.budget_min !== null && d.budget_min !== undefined ? String(d.budget_min) : "",
                        budget_max: d.budget_max !== null && d.budget_max !== undefined ? String(d.budget_max) : "",
                        occupation: d.occupation || "",
                        smoking_preference: d.smoking_preference || "",
                        drinking_preference: d.drinking_preference || "",
                        food_preferences: d.food_preferences || "",
                        sleep_schedule: d.sleep_schedule || "",
                        social_preferences: d.social_preferences || "",
                        guest_preferences: d.guest_preferences || "",
                        pets_preference: d.pets_preference || "",
                        study_habits: d.study_habits || "",
                        work_from_home: d.work_from_home || "",
                        study_environment: d.study_environment || "",
                        preferred_age_min: d.preferred_age_min !== null && d.preferred_age_min !== undefined ? String(d.preferred_age_min) : "",
                        preferred_age_max: d.preferred_age_max !== null && d.preferred_age_max !== undefined ? String(d.preferred_age_max) : "",
                        housing_intent: d.housing_intent || "",
                        move_in_date: d.move_in_date || "",
                        preferred_localities: Array.isArray(d.preferred_localities)
                            ? d.preferred_localities
                            : (typeof d.preferred_localities === "string" ? (() => { try { return JSON.parse(d.preferred_localities); } catch { return []; } })() : []),
                        deal_breakers: Array.isArray(d.deal_breakers)
                            ? d.deal_breakers
                            : (typeof d.deal_breakers === "string" ? (() => { try { return JSON.parse(d.deal_breakers); } catch { return []; } })() : []),
                        bio: d.bio || "",
                        profile_visibility: d.profile_visibility || "hidden",
                    };
                    setPrefs(loadedPrefs);
                    setInitialPrefs(loadedPrefs);
                } else {
                    setSavedProfile({});
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

    // Quick navigation to a missing field
    const handleJumpToField = useCallback((sectionId, fieldId) => {
        setActiveTab(sectionId);
        setTimeout(() => {
            const el = document.getElementById(fieldId);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                const focusable =
                    el.matches && el.matches("button, input, select, textarea")
                        ? el
                        : el.querySelector("button, input, select, textarea");
                if (focusable && focusable.focus) {
                    focusable.focus();
                } else if (el.focus) {
                    el.focus();
                }
            }
        }, 120);
    }, []);

    // Check for pending jump target from Find Flatmates or Dashboard
    useEffect(() => {
        if (loading) return;
        const pendingJump = localStorage.getItem("coroomies:jump_to_field");
        if (pendingJump) {
            try {
                const target = JSON.parse(pendingJump);
                if (target?.section && target?.fieldId) {
                    setTimeout(() => {
                        handleJumpToField(target.section, target.fieldId);
                    }, 0);
                }
            } catch (e) {
                console.error("Jump to field parse error", e);
            } finally {
                localStorage.removeItem("coroomies:jump_to_field");
            }
        }
    }, [loading, handleJumpToField]);

    // Saved completion status (canonical single source of truth matching backend & Find Flatmates)
    const savedStatus = useMemo(() => {
        return computeProfileCompleteness(name, savedProfile || {});
    }, [name, savedProfile]);

    // Live editing status reflecting current form inputs
    const formStatus = useMemo(() => {
        return computeProfileCompleteness(name, prefs);
    }, [name, prefs]);

    // Section stats computed from formStatus so tab badges reflect current section completion
    const sectionStats = useMemo(() => {
        const stats = {};
        for (const sec of SECTIONS) {
            const secFields = formStatus.results.filter((f) => f.section === sec.id);
            stats[sec.id] = {
                total: secFields.length,
                completed: secFields.filter((f) => f.valid).length,
                missing: secFields.filter((f) => !f.valid),
            };
        }
        return stats;
    }, [formStatus]);

    const mandatoryStatus = useMemo(() => {
        return {
            ...savedStatus,
            formPercentage: formStatus.percentage,
            formCompletedCount: formStatus.completedCount,
            hasUnsavedProgress: formStatus.completedCount > savedStatus.completedCount,
            sectionStats,
        };
    }, [savedStatus, formStatus, sectionStats]);

    // Check dirty state per section
    const sectionDirtyMap = useMemo(() => {
        const isAccountDirty =
            name.trim() !== initialAccount.name.trim() ||
            username.trim() !== initialAccount.username.trim() ||
            upiId.trim() !== initialAccount.upiId.trim();

        const personalDirty =
            isAccountDirty ||
            String(prefs.dob ?? "") !== String(initialPrefs.dob ?? "") ||
            String(prefs.gender ?? "") !== String(initialPrefs.gender ?? "") ||
            String(prefs.bio ?? "").trim() !== String(initialPrefs.bio ?? "").trim() ||
            String(prefs.profile_visibility ?? "hidden") !== String(initialPrefs.profile_visibility ?? "hidden");

        const criteriaDirty =
            String(prefs.preferred_flatmate_gender ?? "") !== String(initialPrefs.preferred_flatmate_gender ?? "") ||
            String(prefs.location ?? "").trim() !== String(initialPrefs.location ?? "").trim() ||
            String(prefs.budget_min ?? "") !== String(initialPrefs.budget_min ?? "") ||
            String(prefs.budget_max ?? "") !== String(initialPrefs.budget_max ?? "") ||
            String(prefs.preferred_age_min ?? "") !== String(initialPrefs.preferred_age_min ?? "") ||
            String(prefs.preferred_age_max ?? "") !== String(initialPrefs.preferred_age_max ?? "") ||
            String(prefs.housing_intent ?? "") !== String(initialPrefs.housing_intent ?? "") ||
            String(prefs.move_in_date ?? "") !== String(initialPrefs.move_in_date ?? "") ||
            JSON.stringify(prefs.preferred_localities || []) !== JSON.stringify(initialPrefs.preferred_localities || []) ||
            JSON.stringify(prefs.deal_breakers || []) !== JSON.stringify(initialPrefs.deal_breakers || []);

        const lifestyleDirty =
            String(prefs.food_preferences ?? "") !== String(initialPrefs.food_preferences ?? "") ||
            String(prefs.smoking_preference ?? "") !== String(initialPrefs.smoking_preference ?? "") ||
            String(prefs.drinking_preference ?? "") !== String(initialPrefs.drinking_preference ?? "") ||
            String(prefs.social_preferences ?? "") !== String(initialPrefs.social_preferences ?? "") ||
            String(prefs.guest_preferences ?? "") !== String(initialPrefs.guest_preferences ?? "") ||
            String(prefs.pets_preference ?? "") !== String(initialPrefs.pets_preference ?? "");

        const routineDirty =
            String(prefs.sleep_schedule ?? "") !== String(initialPrefs.sleep_schedule ?? "") ||
            String(prefs.study_habits ?? "") !== String(initialPrefs.study_habits ?? "") ||
            Number(prefs.cleanliness) !== Number(initialPrefs.cleanliness) ||
            Number(prefs.noise_tolerance) !== Number(initialPrefs.noise_tolerance) ||
            String(prefs.work_from_home ?? "") !== String(initialPrefs.work_from_home ?? "") ||
            String(prefs.study_environment ?? "") !== String(initialPrefs.study_environment ?? "");

        const educationDirty =
            String(prefs.occupation ?? "").trim() !== String(initialPrefs.occupation ?? "").trim() ||
            String(prefs.college ?? "").trim() !== String(initialPrefs.college ?? "").trim() ||
            String(prefs.degree ?? "").trim() !== String(initialPrefs.degree ?? "").trim() ||
            String(prefs.stream ?? "").trim() !== String(initialPrefs.stream ?? "").trim() ||
            String(prefs.year ?? "") !== String(initialPrefs.year ?? "");

        return {
            personal: personalDirty,
            criteria: criteriaDirty,
            lifestyle: lifestyleDirty,
            routine: routineDirty,
            education: educationDirty,
        };
    }, [name, username, upiId, initialAccount, prefs, initialPrefs]);

    const isCurrentSectionDirty = Boolean(sectionDirtyMap[activeTab]);

    // UPI Validation helper
    const upiValidation = useMemo(() => {
        const trimmed = upiId.trim();
        if (!trimmed) {
            return {
                valid: null,
                message: "Optional. Add a UPI ID so roommates can pay balances directly.",
            };
        }
        if (isValidUpiId(trimmed)) {
            return {
                valid: true,
                message: "Valid UPI ID format (username@bank).",
            };
        }
        return {
            valid: false,
            message: "Invalid UPI ID. Format must be username@bank (e.g. name@okhdfcbank).",
        };
    }, [upiId]);

    // Handle avatar upload
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
            toast.success("Profile photo updated");
        } catch (error) {
            URL.revokeObjectURL(tempUrl);
            setPreviewUrl(null);
            toast.error(errorMessage(error, "Upload failed. Please try a different image."));
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // Handle avatar removal
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

    // Clean payload builder for PUT /profile/
    const buildProfilePayload = (sourcePrefs = prefs) => ({
        ...sourcePrefs,
        cleanliness:
            sourcePrefs.cleanliness !== null &&
            sourcePrefs.cleanliness !== undefined &&
            sourcePrefs.cleanliness !== ""
                ? Math.min(5, Math.max(1, Number(sourcePrefs.cleanliness)))
                : null,
        noise_tolerance:
            sourcePrefs.noise_tolerance !== null &&
            sourcePrefs.noise_tolerance !== undefined &&
            sourcePrefs.noise_tolerance !== ""
                ? Math.min(5, Math.max(1, Number(sourcePrefs.noise_tolerance)))
                : null,
        college: sourcePrefs.college?.trim() || null,
        degree: sourcePrefs.degree?.trim() || null,
        stream: sourcePrefs.stream?.trim() || null,
        year: sourcePrefs.year ? Number(sourcePrefs.year) : null,
        dob: sourcePrefs.dob || null,
        gender: sourcePrefs.gender || null,
        preferred_flatmate_gender: sourcePrefs.preferred_flatmate_gender || null,
        location: sourcePrefs.location?.trim() || null,
        budget_min:
            sourcePrefs.budget_min !== "" && sourcePrefs.budget_min !== null
                ? Number(sourcePrefs.budget_min)
                : null,
        budget_max:
            sourcePrefs.budget_max !== "" && sourcePrefs.budget_max !== null
                ? Number(sourcePrefs.budget_max)
                : null,
        occupation: sourcePrefs.occupation?.trim() || null,
        smoking_preference: sourcePrefs.smoking_preference || null,
        drinking_preference: sourcePrefs.drinking_preference || null,
        food_preferences: sourcePrefs.food_preferences || null,
        sleep_schedule: sourcePrefs.sleep_schedule || null,
        preferred_age_min:
            sourcePrefs.preferred_age_min !== "" && sourcePrefs.preferred_age_min !== null
                ? Number(sourcePrefs.preferred_age_min)
                : null,
        preferred_age_max:
            sourcePrefs.preferred_age_max !== "" && sourcePrefs.preferred_age_max !== null
                ? Number(sourcePrefs.preferred_age_max)
                : null,
        housing_intent: sourcePrefs.housing_intent || null,
        move_in_date: sourcePrefs.move_in_date || null,
        preferred_localities: Array.isArray(sourcePrefs.preferred_localities)
            ? sourcePrefs.preferred_localities
            : [],
        deal_breakers: Array.isArray(sourcePrefs.deal_breakers)
            ? sourcePrefs.deal_breakers
            : [],
        bio: sourcePrefs.bio?.trim() || null,
        profile_visibility: sourcePrefs.profile_visibility || "hidden",
    });

    // Save Personal Details
    const handleSavePersonal = async () => {
        const errors = {};
        const cleanName = name.trim();
        const cleanUsername = username.trim();
        const cleanUpi = upiId.trim();

        if (!cleanName) {
            errors.name = "Full name is required";
        } else if (cleanName.length > 100) {
            errors.name = "Full name must be 100 characters or fewer";
        }

        if (cleanUsername) {
            if (cleanUsername.length < 3) {
                errors.username = "Username must be at least 3 characters";
            } else if (cleanUsername.length > 30) {
                errors.username = "Username must be 30 characters or fewer";
            } else if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
                errors.username = "Only letters, numbers, and underscores allowed";
            }
        }

        if (cleanUpi && !isValidUpiId(cleanUpi)) {
            errors.upiId = "Enter a valid UPI ID (username@bank)";
        }

        if (prefs.dob) {
            const age = calculateAge(prefs.dob);
            if (age === null || age < 18) {
                errors.dob = "You must be at least 18 years old to join CoRoomies.";
            } else if (age > 100) {
                errors.dob = "Please enter a realistic date of birth (max 100 years).";
            }
        }

        setAccountErrors(errors);
        if (Object.keys(errors).length > 0) {
            toast.error("Please resolve the highlighted fields before saving");
            return;
        }

        try {
            setIsSaving(true);

            // 1. Account update if changed
            const isAccountDirty =
                cleanName !== initialAccount.name.trim() ||
                cleanUsername !== initialAccount.username.trim() ||
                cleanUpi !== initialAccount.upiId.trim();

            if (isAccountDirty) {
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
            }

            // 2. Profile update if dob or gender changed (or profile wasn't saved yet)
            const payload = buildProfilePayload();
            await api.put("/profile/", payload);
            setInitialPrefs({ ...prefs });
            setSavedProfile((prev) => ({
                ...(prev || {}),
                ...payload,
                name: cleanName,
            }));
            window.dispatchEvent(
                new CustomEvent("coroomies:profile-updated", {
                    detail: { name: cleanName, profile: payload },
                })
            );

            setAccountErrors({});
            toast.success("Personal details saved successfully");
        } catch (error) {
            const msg = errorMessage(error, "Could not save personal details");
            if (msg.toLowerCase().includes("username is already taken")) {
                setAccountErrors((prev) => ({
                    ...prev,
                    username: "This username is already taken. Please choose another.",
                }));
            }
            toast.error(msg);
        } finally {
            setIsSaving(false);
        }
    };

    // Save Roommate Criteria
    const handleSaveCriteria = async () => {
        if (!prefs.housing_intent) {
            toast.error("Please select your housing intent (Have a flat / Need a room / Find together).");
            handleJumpToField("criteria", "field-housing-intent");
            return;
        }
        if (prefs.budget_min !== "" && prefs.budget_max !== "") {
            if (Number(prefs.budget_min) > Number(prefs.budget_max)) {
                toast.error("Minimum budget cannot exceed maximum budget.");
                return;
            }
        }
        if (prefs.preferred_age_min !== "" && prefs.preferred_age_max !== "") {
            if (Number(prefs.preferred_age_min) > Number(prefs.preferred_age_max)) {
                toast.error("Minimum flatmate age cannot exceed maximum age.");
                return;
            }
        }

        try {
            setIsSaving(true);
            const payload = buildProfilePayload();
            await api.put("/profile/", payload);
            setInitialPrefs({ ...prefs });
            setSavedProfile((prev) => ({
                ...(prev || {}),
                ...payload,
                name,
            }));
            toast.success("Roommate criteria saved");
            window.dispatchEvent(
                new CustomEvent("coroomies:profile-updated", {
                    detail: { name, profile: payload },
                })
            );
        } catch (error) {
            toast.error(errorMessage(error, "Could not save roommate criteria"));
        } finally {
            setIsSaving(false);
        }
    };

    // Save Lifestyle, Routine, or Education section
    const handleSavePrefsSection = async (sectionTitle) => {
        try {
            setIsSaving(true);
            const payload = buildProfilePayload();
            await api.put("/profile/", payload);
            setInitialPrefs({ ...prefs });
            setSavedProfile((prev) => ({
                ...(prev || {}),
                ...payload,
                name,
            }));
            toast.success(`${sectionTitle} saved`);
            window.dispatchEvent(
                new CustomEvent("coroomies:profile-updated", {
                    detail: { name, profile: payload },
                })
            );
        } catch (error) {
            toast.error(errorMessage(error, `Could not save ${sectionTitle.toLowerCase()}`));
        } finally {
            setIsSaving(false);
        }
    };

    // Unified Section Save
    const handleSaveCurrentSection = async () => {
        if (activeTab === "personal") {
            await handleSavePersonal();
        } else if (activeTab === "criteria") {
            await handleSaveCriteria();
        } else if (activeTab === "lifestyle") {
            await handleSavePrefsSection("Lifestyle preferences");
        } else if (activeTab === "routine") {
            await handleSavePrefsSection("Daily routine");
        } else if (activeTab === "education") {
            await handleSavePrefsSection("Education & career");
        }
    };

    // Unified Section Discard
    const handleDiscardCurrentSection = () => {
        if (activeTab === "personal") {
            setName(initialAccount.name);
            setUsername(initialAccount.username);
            setUpiId(initialAccount.upiId);
            setPrefs((prev) => ({
                ...prev,
                dob: initialPrefs.dob,
                gender: initialPrefs.gender,
            }));
            setAccountErrors({});
        } else if (activeTab === "criteria") {
            setPrefs((prev) => ({
                ...prev,
                preferred_flatmate_gender: initialPrefs.preferred_flatmate_gender,
                location: initialPrefs.location,
                budget_min: initialPrefs.budget_min,
                budget_max: initialPrefs.budget_max,
                preferred_age_min: initialPrefs.preferred_age_min,
                preferred_age_max: initialPrefs.preferred_age_max,
            }));
        } else if (activeTab === "lifestyle") {
            setPrefs((prev) => ({
                ...prev,
                food_preferences: initialPrefs.food_preferences,
                smoking_preference: initialPrefs.smoking_preference,
                drinking_preference: initialPrefs.drinking_preference,
                social_preferences: initialPrefs.social_preferences,
                guest_preferences: initialPrefs.guest_preferences,
                pets_preference: initialPrefs.pets_preference,
            }));
        } else if (activeTab === "routine") {
            setPrefs((prev) => ({
                ...prev,
                sleep_schedule: initialPrefs.sleep_schedule,
                study_habits: initialPrefs.study_habits,
                cleanliness: initialPrefs.cleanliness,
                noise_tolerance: initialPrefs.noise_tolerance,
                work_from_home: initialPrefs.work_from_home,
                study_environment: initialPrefs.study_environment,
            }));
        } else if (activeTab === "education") {
            setPrefs((prev) => ({
                ...prev,
                occupation: initialPrefs.occupation,
                college: initialPrefs.college,
                degree: initialPrefs.degree,
                stream: initialPrefs.stream,
                year: initialPrefs.year,
            }));
        }
        toast.info("Changes discarded");
    };

    // Email Change Flow
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
            setShowEmailModal(false);
            setEmailStep(1);
            toast.success("Email address updated successfully");
        } catch (error) {
            toast.error(errorMessage(error, "Invalid or expired verification code"));
        } finally {
            setConfirmingEmail(false);
        }
    };

    const displayAvatar = previewUrl || resolveAvatarUrl(avatarUrl);
    const displayName = localStorage.getItem("user_name") || name || "Roommate";
    const emailLocked = requestingEmail || confirmingEmail;

    if (loading) {
        return (
            <div className="w-full max-w-4xl mx-auto space-y-6">
                <PageHeader
                    title="My Profile"
                    subtitle="Manage your personal identity, contact details, and roommate living preferences."
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
        <div className="w-full max-w-4xl mx-auto space-y-5 pb-12">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <PageHeader
                    title="My Profile"
                    subtitle="Manage your identity, flatmate preferences, and lifestyle routine."
                />
                <div className="flex items-center gap-2 self-start sm:self-auto">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowPublicPreviewModal(true)}
                    >
                        <EyeIcon className="h-3.5 w-3.5" />
                        <span>Preview Profile</span>
                    </Button>
                    <Badge variant={mandatoryStatus.percentage >= 80 ? "success" : "brand"} dot>
                        Profile {mandatoryStatus.percentage}% complete
                    </Badge>
                    <Badge variant="neutral">
                        @{username || "roommate"}
                    </Badge>
                </div>
            </div>

            {/* Compact Profile Completeness Card (Linear / Notion style) */}
            <Card className="p-4 sm:p-5 border-slate-200/80 dark:border-slate-700/80 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-xs ${
                                mandatoryStatus.isComplete ? "bg-emerald-500" : "bg-brand-600"
                            }`}
                        >
                            {mandatoryStatus.isComplete ? (
                                <CheckCircleIcon className="h-5 w-5" />
                            ) : (
                                <SparklesIcon className="h-5 w-5" />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                    {mandatoryStatus.isComplete
                                        ? "Profile 100% Complete"
                                        : `Profile ${mandatoryStatus.percentage}% Complete`}
                                </h2>
                                <Badge
                                    variant={mandatoryStatus.isComplete ? "success" : "brand"}
                                    size="sm"
                                >
                                    {mandatoryStatus.isComplete
                                        ? "Discovery Active"
                                        : `${mandatoryStatus.completedCount}/${mandatoryStatus.totalCount} Saved`}
                                </Badge>
                                {mandatoryStatus.hasUnsavedProgress && (
                                    <Badge variant="warning" size="sm">
                                        {mandatoryStatus.formCompletedCount}/{mandatoryStatus.totalCount} in form
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {mandatoryStatus.isComplete
                                    ? "Your profile is fully ready for AI roommate matchmaking and flatmate requests."
                                    : mandatoryStatus.hasUnsavedProgress
                                    ? `${mandatoryStatus.formCompletedCount} of ${mandatoryStatus.totalCount} fields filled in form. Click "Save Changes" on the section to update your live profile and unlock matches.`
                                    : "Complete the required fields to unlock flatmate discovery and send connection requests."}
                            </p>
                        </div>
                    </div>
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 self-start sm:self-auto">
                        {mandatoryStatus.isComplete ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                Discovery Active
                            </span>
                        ) : (
                            <span>
                                {mandatoryStatus.missing.length} missing field
                                {mandatoryStatus.missing.length > 1 ? "s" : ""}
                            </span>
                        )}
                    </div>
                </div>

                {/* Slim Smooth Progress Bar */}
                <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${
                            mandatoryStatus.isComplete
                                ? "bg-emerald-500"
                                : "bg-gradient-to-r from-brand-500 to-violet-500"
                        }`}
                        style={{ width: `${mandatoryStatus.percentage}%` }}
                    />
                </div>

                {/* Interactive Clickable Missing Fields Pills */}
                {!mandatoryStatus.isComplete && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mr-1">
                            Jump to missing:
                        </span>
                        {mandatoryStatus.missingFieldsList.map((item) => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => handleJumpToField(item.section, item.fieldId)}
                                className="inline-flex items-center gap-1 rounded-md bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200 border border-amber-200/80 dark:border-amber-800/60 transition-colors cursor-pointer group"
                            >
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 group-hover:scale-125 transition-transform" />
                                <span>+ {item.label}</span>
                            </button>
                        ))}
                    </div>
                )}
            </Card>

            {/* Section Switcher Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200/70 dark:border-slate-700/70 overflow-x-auto no-scrollbar touch-scroll">
                {SECTIONS.map((sec) => {
                    const Icon = sec.icon;
                    const isActive = activeTab === sec.id;
                    const isDirty = sectionDirtyMap[sec.id];
                    const missingCount = mandatoryStatus.sectionStats[sec.id]?.missing?.length || 0;

                    return (
                        <button
                            key={sec.id}
                            type="button"
                            onClick={() => setActiveTab(sec.id)}
                            className={`shrink-0 flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer ${
                                isActive
                                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs ring-1 ring-slate-200/80 dark:ring-slate-600"
                                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-700/50"
                            }`}
                        >
                            <Icon
                                className={`h-4 w-4 ${
                                    isActive
                                        ? "text-brand-600 dark:text-brand-400"
                                        : "text-slate-500 dark:text-slate-400"
                                }`}
                            />
                            <span className="hidden sm:inline">{sec.title}</span>
                            <span className="sm:hidden">{sec.shortTitle}</span>
                            {missingCount > 0 && (
                                <span
                                    className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/80 text-[10px] font-bold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
                                    title={`${missingCount} required fields missing`}
                                >
                                    {missingCount}
                                </span>
                            )}
                            {isDirty && (
                                <span
                                    className="h-1.5 w-1.5 rounded-full bg-amber-500"
                                    title="Unsaved changes in this section"
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* SECTION CONTAINER (Only active section is rendered) */}
            <Card className="p-5 sm:p-6 shadow-xs border-slate-200/80 dark:border-slate-700/80">
                {/* Section Subheader */}
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-4 mb-6">
                    <div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            {SECTIONS.find((s) => s.id === activeTab)?.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {SECTIONS.find((s) => s.id === activeTab)?.description}
                        </p>
                    </div>
                    {isCurrentSectionDirty && (
                        <Badge variant="warning" dot className="shrink-0">
                            Unsaved
                        </Badge>
                    )}
                </div>

                {/* 1. PERSONAL DETAILS TAB */}
                {activeTab === "personal" && (
                    <div className="space-y-6">
                        {/* Compact Avatar Area */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-3.5 sm:p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50">
                            <div className="relative group shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setShowPreviewModal(true)}
                                    className="block relative rounded-2xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 cursor-pointer shadow-xs"
                                    title="Click to view full photo"
                                >
                                    <Avatar
                                        name={displayName}
                                        src={displayAvatar}
                                        size="lg"
                                        className="h-16 w-16 sm:h-18 sm:w-18 rounded-2xl ring-2 ring-white dark:ring-slate-700 object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-medium gap-1 backdrop-blur-[1px]">
                                        <EyeIcon className="h-3.5 w-3.5" />
                                        <span>View</span>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-lg bg-white dark:bg-slate-700 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600 transition-all hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 cursor-pointer"
                                    title="Upload photo"
                                >
                                    <CameraIcon className="h-3.5 w-3.5 text-slate-700 dark:text-slate-200" />
                                </button>

                                {uploading && (
                                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-[2px]">
                                        <Spinner size="sm" />
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={uploading}
                                    >
                                        <CameraIcon className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                                        <span>{avatarUrl ? "Change Photo" : "Upload Photo"}</span>
                                    </Button>

                                    {avatarUrl && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowPreviewModal(true)}
                                            disabled={uploading}
                                        >
                                            <EyeIcon className="h-3.5 w-3.5" />
                                            <span>Full Size</span>
                                        </Button>
                                    )}

                                    {avatarUrl && (
                                        <Button
                                            variant="dangerOutline"
                                            size="sm"
                                            onClick={() => setShowRemoveAvatarModal(true)}
                                            disabled={uploading}
                                        >
                                            <Trash2Icon className="h-3.5 w-3.5" />
                                            <span>Remove</span>
                                        </Button>
                                    )}
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    JPG, PNG, GIF, or WebP up to 5 MB. Square aspect ratio recommended.
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

                        {/* 2-Column Grid: Full Name & Username */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <Input
                                    id="field-name"
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
                                    disabled={isSaving}
                                    hint="Shown on your public card and flatmate matches."
                                />
                            </div>

                            <div>
                                <Input
                                    id="field-username"
                                    label="Username Handle"
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
                                    disabled={isSaving || (!canChangeUsername && username !== "")}
                                    hint={
                                        username
                                            ? `Other roommates can tag you via @${username}`
                                            : "Unique handle (letters, numbers, underscores)."
                                    }
                                />
                                {!canChangeUsername && (
                                    <div className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                                        <ClockIcon className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                                        <span>
                                            Changed on{" "}
                                            <strong>
                                                {usernameChangedAt
                                                    ? new Date(usernameChangedAt).toLocaleDateString("en-US", {
                                                          day: "numeric",
                                                          month: "short",
                                                          year: "numeric",
                                                      })
                                                    : "recently"}
                                            </strong>
                                            . Editable again in <strong>{daysUntilChange} days</strong>.
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Date of Birth & Gender Grid */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            {/* Date of Birth */}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor="field-dob"
                                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                                >
                                    Date of Birth <span className="text-rose-500">*</span>
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        id="field-dob"
                                        type="date"
                                        max={maxDobDate}
                                        min={minDobDate}
                                        value={prefs.dob || ""}
                                        onChange={(e) =>
                                            setPrefs((prev) => ({ ...prev, dob: e.target.value }))
                                        }
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                    />
                                    {calculateAge(prefs.dob) !== null && (
                                        <div className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300 text-xs font-bold shrink-0">
                                            <span>{calculateAge(prefs.dob)} yrs</span>
                                        </div>
                                    )}
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Strictly private. Only your calculated age is shown to roommates. (18+)
                                </p>
                            </div>

                            {/* UPI ID */}
                            <div className="space-y-1">
                                <Input
                                    id="field-upi-id"
                                    label="UPI ID (VPA) for Expense Settlements"
                                    value={upiId}
                                    error={accountErrors.upiId}
                                    onChange={(e) => {
                                        setUpiId(e.target.value.trim().toLowerCase());
                                        if (accountErrors.upiId) {
                                            setAccountErrors((prev) => ({ ...prev, upiId: null }));
                                        }
                                    }}
                                    placeholder="username@bank (e.g. name@okhdfcbank)"
                                    disabled={isSaving}
                                />
                                <div className="text-[11px] flex items-center gap-1.5">
                                    {upiValidation.valid === true ? (
                                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                                            <CheckCircleIcon className="h-3 w-3" />
                                            {upiValidation.message}
                                        </span>
                                    ) : upiValidation.valid === false ? (
                                        <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1 font-medium">
                                            <AlertIcon className="h-3 w-3" />
                                            {upiValidation.message}
                                        </span>
                                    ) : (
                                        <span className="text-slate-400 dark:text-slate-500">
                                            {upiValidation.message}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Your Gender Selection */}
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Your Gender <span className="text-rose-500">*</span>
                            </label>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                We never assume gender based on name or photo. Select how you identify:
                            </p>
                            <div id="field-gender" className="grid gap-2 sm:grid-cols-3">
                                {[
                                    { value: "male", label: "Male", desc: "Identify as Male" },
                                    { value: "female", label: "Female", desc: "Identify as Female" },
                                    {
                                        value: "prefer_not_to_say",
                                        label: "Prefer not to say",
                                        desc: "Private (Unisex matches)",
                                    },
                                ].map((opt) => {
                                    const isSelected = prefs.gender === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() =>
                                                setPrefs((prev) => ({ ...prev, gender: opt.value }))
                                            }
                                            className={`relative flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                                isSelected
                                                    ? "border-brand-500 bg-brand-50/70 dark:bg-brand-950/40 text-slate-900 dark:text-slate-100 ring-2 ring-brand-500/20 shadow-xs"
                                                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <span className="text-xs sm:text-sm font-semibold">
                                                    {opt.label}
                                                </span>
                                                <span
                                                    className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                                                        isSelected
                                                            ? "border-brand-600 bg-brand-600 text-white"
                                                            : "border-slate-300 dark:border-slate-600"
                                                    }`}
                                                >
                                                    {isSelected && (
                                                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                                    )}
                                                </span>
                                            </div>
                                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                {opt.desc}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Verified Email Banner */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/40">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                        Email Address
                                    </span>
                                    <Badge variant="success" size="sm" dot>
                                        Verified
                                    </Badge>
                                </div>
                                <p className="text-xs font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                                    {email}
                                </p>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                    setNewEmail("");
                                    setEmailCode("");
                                    setEmailStep(1);
                                    setShowEmailModal(true);
                                }}
                                className="self-start sm:self-auto"
                            >
                                Change Email
                            </Button>
                        </div>

                        {/* Short Personal Bio (Optional 280-char) */}
                        <div id="field-bio" className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label
                                    htmlFor="field-bio-input"
                                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                                >
                                    Personal Bio <span className="text-slate-400 font-normal">(Optional)</span>
                                </label>
                                <span className="text-[11px] font-medium text-slate-400">
                                    {280 - (prefs.bio || "").length} characters left
                                </span>
                            </div>
                            <Textarea
                                id="field-bio-input"
                                rows={3}
                                maxLength={280}
                                value={prefs.bio || ""}
                                onChange={(e) =>
                                    setPrefs((prev) => ({
                                        ...prev,
                                        bio: e.target.value.slice(0, 280),
                                    }))
                                }
                                placeholder="e.g. Software engineer working from home 3 days a week. Love weekend cooking, board games, and quiet evenings. Looking for flatmates who value clean common spaces."
                                disabled={isSaving}
                                hint="Displayed on your public discovery card. Max 280 characters."
                            />
                        </div>

                        {/* Profile Visibility / Privacy Controls */}
                        <div id="field-visibility" className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Discovery Visibility
                            </label>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Control whether your profile is discoverable to flatmate seekers or kept private.
                            </p>
                            <div className="grid gap-2.5 sm:grid-cols-2">
                                {[
                                    {
                                        value: "public",
                                        label: "Discoverable",
                                        badge: "Active",
                                        icon: EyeIcon,
                                        desc: "Your profile card appears in Find Flatmates and roommate recommendations.",
                                    },
                                    {
                                        value: "hidden",
                                        label: "Hidden / Private",
                                        badge: "Private",
                                        icon: EyeOffIcon,
                                        desc: "You are hidden from all roommate searches. Existing chats and living groups remain active.",
                                    },
                                ].map((opt) => {
                                    const isSelected = (prefs.profile_visibility || "hidden") === opt.value;
                                    const Icon = opt.icon;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() =>
                                                setPrefs((prev) => ({
                                                    ...prev,
                                                    profile_visibility: opt.value,
                                                }))
                                            }
                                            className={`relative flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                                                isSelected
                                                    ? "border-brand-500 bg-brand-50/70 dark:bg-brand-950/40 text-slate-900 dark:text-slate-100 ring-2 ring-brand-500/20 shadow-xs"
                                                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-2">
                                                    <Icon className={`h-4 w-4 ${isSelected ? "text-brand-600 dark:text-brand-400" : "text-slate-400"}`} />
                                                    <span className="text-xs sm:text-sm font-semibold">
                                                        {opt.label}
                                                    </span>
                                                </div>
                                                <span
                                                    className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                                                        isSelected
                                                            ? "border-brand-600 bg-brand-600 text-white"
                                                            : "border-slate-300 dark:border-slate-600"
                                                    }`}
                                                >
                                                    {isSelected && (
                                                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                                    )}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                                {opt.desc}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. ROOMMATE CRITERIA TAB */}
                {activeTab === "criteria" && (
                    <div className="space-y-6">
                        {/* Housing Intent (Canonical Mandatory Field) */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    What is your housing intent? <span className="text-rose-500">*</span>
                                </label>
                                {!prefs.housing_intent && (
                                    <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                        Required for flatmate matching
                                    </span>
                                )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Select the option that reflects your situation (never preselected):
                            </p>
                            <div id="field-housing-intent" className="grid gap-2.5 sm:grid-cols-3">
                                {HOUSING_INTENTS.map((intent) => {
                                    const isSelected = prefs.housing_intent === intent.value;
                                    return (
                                        <button
                                            key={intent.value}
                                            type="button"
                                            onClick={() =>
                                                setPrefs((prev) => ({
                                                    ...prev,
                                                    housing_intent: intent.value,
                                                }))
                                            }
                                            className={`relative flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                                                isSelected
                                                    ? "border-brand-500 bg-brand-50/70 dark:bg-brand-950/40 text-slate-900 dark:text-slate-100 ring-2 ring-brand-500/20 shadow-xs"
                                                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <span className="text-xs sm:text-sm font-semibold">
                                                    {intent.label}
                                                </span>
                                                <span
                                                    className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ml-1 ${
                                                        isSelected
                                                            ? "border-brand-600 bg-brand-600 text-white"
                                                            : "border-slate-300 dark:border-slate-600"
                                                    }`}
                                                >
                                                    {isSelected && (
                                                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                                    )}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                                {intent.description}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Flatmate Gender Preference */}
                        <div className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Who would you prefer to live with? <span className="text-rose-500">*</span>
                            </label>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Mutual matching requires both users&apos; gender preferences to align.
                            </p>
                            <div id="field-pref-gender" className="grid gap-2.5 sm:grid-cols-3">
                                {[
                                    {
                                        value: "unisex",
                                        label: "Unisex / Any",
                                        desc: "Open to roommates of all genders",
                                    },
                                    {
                                        value: "female",
                                        label: "Female Only",
                                        desc: "Female roommate suggestions only",
                                    },
                                    {
                                        value: "male",
                                        label: "Male Only",
                                        desc: "Male roommate suggestions only",
                                    },
                                ].map((opt) => {
                                    const isSelected =
                                        (prefs.preferred_flatmate_gender || "unisex") === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() =>
                                                setPrefs((prev) => ({
                                                    ...prev,
                                                    preferred_flatmate_gender: opt.value,
                                                }))
                                            }
                                            className={`relative flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                                isSelected
                                                    ? "border-brand-500 bg-brand-50/70 dark:bg-brand-950/40 text-slate-900 dark:text-slate-100 ring-2 ring-brand-500/20 shadow-xs"
                                                    : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <span className="text-xs sm:text-sm font-semibold">
                                                    {opt.label}
                                                </span>
                                                <span
                                                    className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                                                        isSelected
                                                            ? "border-brand-600 bg-brand-600 text-white"
                                                            : "border-slate-300 dark:border-slate-600"
                                                    }`}
                                                >
                                                    {isSelected && (
                                                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                                    )}
                                                </span>
                                            </div>
                                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                {opt.desc}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Preferred Location */}
                        <div>
                            <Input
                                id="field-location"
                                label="Preferred Living Location / City"
                                required
                                placeholder="e.g. Koramangala, Bangalore or South Delhi"
                                value={prefs.location || ""}
                                onChange={(e) =>
                                    setPrefs((prev) => ({ ...prev, location: e.target.value }))
                                }
                                disabled={isSaving}
                                hint="The neighbourhood, campus area, or city you wish to reside in."
                            />
                        </div>

                        {/* Preferred Localities / Neighborhoods */}
                        <div id="field-localities" className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Preferred Neighborhoods / Localities
                            </label>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Add specific neighborhoods you prefer (e.g. Koramangala, Indiranagar, HSR Layout). Press Enter or Add.
                            </p>
                            <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                                {(prefs.preferred_localities || []).map((loc, idx) => (
                                    <span
                                        key={idx}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 text-xs font-medium border border-brand-200 dark:border-brand-800"
                                    >
                                        <MapPinIcon className="h-3 w-3 text-brand-500" />
                                        <span>{loc}</span>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setPrefs((prev) => ({
                                                    ...prev,
                                                    preferred_localities: prev.preferred_localities.filter((_, i) => i !== idx),
                                                }))
                                            }
                                            className="hover:text-rose-600 dark:hover:text-rose-400 p-0.5 rounded cursor-pointer"
                                            title="Remove locality"
                                        >
                                            <XIcon className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="flex gap-2 max-w-md">
                                <input
                                    type="text"
                                    id="new-locality-input"
                                    placeholder="Add neighborhood (e.g. HSR Sector 4)"
                                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            const val = e.target.value.trim();
                                            if (val && !(prefs.preferred_localities || []).includes(val)) {
                                                if ((prefs.preferred_localities || []).length >= 15) {
                                                    toast.error("Maximum 15 localities allowed");
                                                    return;
                                                }
                                                setPrefs((prev) => ({
                                                    ...prev,
                                                    preferred_localities: [...(prev.preferred_localities || []), val],
                                                }));
                                                e.target.value = "";
                                            }
                                        }
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                        const input = document.getElementById("new-locality-input");
                                        if (!input) return;
                                        const val = input.value.trim();
                                        if (val && !(prefs.preferred_localities || []).includes(val)) {
                                            if ((prefs.preferred_localities || []).length >= 15) {
                                                toast.error("Maximum 15 localities allowed");
                                                return;
                                            }
                                            setPrefs((prev) => ({
                                                ...prev,
                                                preferred_localities: [...(prev.preferred_localities || []), val],
                                            }));
                                            input.value = "";
                                        }
                                    }}
                                >
                                    <PlusIcon className="h-3.5 w-3.5" />
                                    <span>Add</span>
                                </Button>
                            </div>
                        </div>

                        {/* Move-in Timeline / Target Date */}
                        <div id="field-move-in" className="space-y-2">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                Target Move-in Timeline
                            </label>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Aligns you with flatmates planning to move in around the same time.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {MOVE_IN_TIMELINES.map((t) => {
                                    const isSelected = prefs.move_in_date === t.value;
                                    return (
                                        <button
                                            key={t.value}
                                            type="button"
                                            onClick={() =>
                                                setPrefs((prev) => ({
                                                    ...prev,
                                                    move_in_date: t.value,
                                                }))
                                            }
                                            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                                                isSelected
                                                    ? "bg-brand-600 text-white shadow-xs font-semibold ring-2 ring-brand-500/20"
                                                    : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60"
                                            }`}
                                        >
                                            {t.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex items-center gap-2 pt-1 max-w-xs">
                                <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">Or specific date:</span>
                                <input
                                    type="date"
                                    value={prefs.move_in_date && prefs.move_in_date.includes("-") ? prefs.move_in_date : ""}
                                    onChange={(e) =>
                                        setPrefs((prev) => ({
                                            ...prev,
                                            move_in_date: e.target.value,
                                        }))
                                    }
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                />
                            </div>
                        </div>

                        {/* Rent Budget Range & Flatmate Age Range */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            {/* Budget Range */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    Monthly Rent Budget Range (₹) <span className="text-rose-500">*</span>
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input
                                        id="field-budget-min"
                                        type="number"
                                        placeholder="Min (e.g. 8000)"
                                        value={prefs.budget_min ?? ""}
                                        onChange={(e) =>
                                            setPrefs((prev) => ({
                                                ...prev,
                                                budget_min: e.target.value,
                                            }))
                                        }
                                        disabled={isSaving}
                                    />
                                    <Input
                                        id="field-budget-max"
                                        type="number"
                                        placeholder="Max (e.g. 16000)"
                                        value={prefs.budget_max ?? ""}
                                        onChange={(e) =>
                                            setPrefs((prev) => ({
                                                ...prev,
                                                budget_max: e.target.value,
                                            }))
                                        }
                                        disabled={isSaving}
                                    />
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Target rent per room / person.
                                </p>
                            </div>

                            {/* Preferred Flatmate Age */}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    Preferred Flatmate Age Range (Years)
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input
                                        id="field-age-min"
                                        type="number"
                                        placeholder="Min (e.g. 20)"
                                        value={prefs.preferred_age_min ?? ""}
                                        onChange={(e) =>
                                            setPrefs((prev) => ({
                                                ...prev,
                                                preferred_age_min: e.target.value,
                                            }))
                                        }
                                        disabled={isSaving}
                                    />
                                    <Input
                                        id="field-age-max"
                                        type="number"
                                        placeholder="Max (e.g. 30)"
                                        value={prefs.preferred_age_max ?? ""}
                                        onChange={(e) =>
                                            setPrefs((prev) => ({
                                                ...prev,
                                                preferred_age_max: e.target.value,
                                            }))
                                        }
                                        disabled={isSaving}
                                    />
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    Leave blank if open to flatmates of any age.
                                </p>
                            </div>
                        </div>

                        {/* Household Deal-Breakers (Strict Filters) */}
                        <div id="field-deal-breakers" className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                                <ShieldCheckIcon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    Household Deal-Breakers (Strict Filters)
                                </label>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Select strict household boundaries. Candidates who violate these will be excluded from your recommendations:
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {DEAL_BREAKER_OPTIONS.map((db) => {
                                    const isSelected = (prefs.deal_breakers || []).includes(db.value);
                                    return (
                                        <button
                                            key={db.value}
                                            type="button"
                                            onClick={() => {
                                                setPrefs((prev) => {
                                                    const current = prev.deal_breakers || [];
                                                    return {
                                                        ...prev,
                                                        deal_breakers: isSelected
                                                            ? current.filter((x) => x !== db.value)
                                                            : [...current, db.value],
                                                    };
                                                });
                                            }}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                                                isSelected
                                                    ? "bg-rose-600 text-white shadow-xs font-semibold ring-2 ring-rose-500/20"
                                                    : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60"
                                            }`}
                                            title={db.hint}
                                        >
                                            {isSelected ? <XIcon className="h-3 w-3" /> : <PlusIcon className="h-3 w-3" />}
                                            <span>{db.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. LIFESTYLE & SOCIAL TAB */}
                {activeTab === "lifestyle" && (
                    <div className="space-y-6">
                        <div className="grid gap-6 sm:grid-cols-2">
                            {/* Dietary Preference */}
                            <ChipGroup
                                id="field-food"
                                label="Dietary Preference"
                                required
                                value={String(prefs.food_preferences ?? "")}
                                disabled={isSaving}
                                onChange={(val) =>
                                    setPrefs((prev) => ({
                                        ...prev,
                                        food_preferences: val,
                                    }))
                                }
                                options={[
                                    { value: "vegetarian", label: "Vegetarian 🌱" },
                                    { value: "non_vegetarian", label: "Non-Veg 🍗" },
                                    { value: "vegan", label: "Vegan 🥗" },
                                ]}
                            />

                            {/* Smoking Policy */}
                            <ChipGroup
                                id="field-smoking"
                                label="Smoking Policy"
                                required
                                value={String(prefs.smoking_preference ?? "")}
                                disabled={isSaving}
                                onChange={(val) =>
                                    setPrefs((prev) => ({
                                        ...prev,
                                        smoking_preference: val,
                                    }))
                                }
                                options={[
                                    { value: "non_smoker", label: "Non-smoker 🚭" },
                                    { value: "smoker", label: "Smoker 🚬" },
                                ]}
                            />

                            {/* Drinking Preference */}
                            <ChipGroup
                                id="field-drinking"
                                label="Drinking Preference"
                                required
                                value={String(prefs.drinking_preference ?? "")}
                                disabled={isSaving}
                                onChange={(val) =>
                                    setPrefs((prev) => ({
                                        ...prev,
                                        drinking_preference: val,
                                    }))
                                }
                                options={[
                                    { value: "non_drinker", label: "Non-drinker 🚫" },
                                    { value: "social_drinker", label: "Social drinker 🍷" },
                                    { value: "regular_drinker", label: "Regular drinker 🍻" },
                                ]}
                            />

                            {/* Social Energy */}
                            <ChipGroup
                                id="field-social"
                                label="Social Energy at Home"
                                value={String(prefs.social_preferences ?? "")}
                                disabled={isSaving}
                                onChange={(val) =>
                                    setPrefs((prev) => ({
                                        ...prev,
                                        social_preferences: val,
                                    }))
                                }
                                options={[
                                    { value: "low", label: "Low / Quiet 🛋️" },
                                    { value: "moderate", label: "Moderate ☕" },
                                    { value: "high", label: "High / Outgoing 🎉" },
                                ]}
                            />

                            {/* Guest Frequency */}
                            <ChipGroup
                                id="field-guests"
                                label="Guest Frequency"
                                value={String(prefs.guest_preferences ?? "")}
                                disabled={isSaving}
                                onChange={(val) =>
                                    setPrefs((prev) => ({
                                        ...prev,
                                        guest_preferences: val,
                                    }))
                                }
                                options={[
                                    { value: "rarely", label: "Rarely 🤫" },
                                    { value: "sometimes", label: "Sometimes 👥" },
                                    { value: "often", label: "Often 🥳" },
                                ]}
                            />

                            {/* Pet Preference */}
                            <ChipGroup
                                id="field-pets"
                                label="Pet Preference"
                                value={String(prefs.pets_preference ?? "")}
                                disabled={isSaving}
                                onChange={(val) =>
                                    setPrefs((prev) => ({
                                        ...prev,
                                        pets_preference: val,
                                    }))
                                }
                                options={[
                                    { value: "no_preference", label: "Open to pets 🐾" },
                                    { value: "must_have", label: "Must have pets 🐕" },
                                    { value: "must_not", label: "No pets 🚫" },
                                    { value: "own_pet", label: "Have a pet 🐱" },
                                ]}
                            />
                        </div>
                    </div>
                )}

                {/* 4. DAILY ROUTINE TAB */}
                {activeTab === "routine" && (
                    <div className="space-y-6">
                        <div className="grid gap-6 sm:grid-cols-2">
                            {/* Sleep Schedule */}
                            <ChipGroup
                                id="field-sleep"
                                label="Sleep Schedule"
                                value={String(prefs.sleep_schedule ?? "")}
                                disabled={isSaving}
                                onChange={(val) =>
                                    setPrefs((prev) => ({
                                        ...prev,
                                        sleep_schedule: val,
                                    }))
                                }
                                options={[
                                    { value: "early", label: "Early Bird (< 10 PM) 🌅" },
                                    { value: "normal", label: "Normal (10 PM – 12 AM) 🌙" },
                                    { value: "late", label: "Night Owl (> 12 AM) 🦉" },
                                ]}
                            />

                            {/* Peak Focus Hours */}
                            <ChipGroup
                                id="field-study"
                                label="Peak Focus / Productivity Hours"
                                value={String(prefs.study_habits ?? "")}
                                disabled={isSaving}
                                onChange={(val) =>
                                    setPrefs((prev) => ({
                                        ...prev,
                                        study_habits: val,
                                    }))
                                }
                                options={[
                                    { value: "morning", label: "Morning (6 AM – 12 PM) ☀️" },
                                    { value: "afternoon", label: "Afternoon (12 PM – 6 PM) 🌤️" },
                                    { value: "night", label: "Night Owl (Late) 🌌" },
                                ]}
                            />

                            {/* Work from home */}
                            <ChipGroup
                                id="field-wfh"
                                label="Work / Study from Home"
                                value={String(prefs.work_from_home ?? "")}
                                disabled={isSaving}
                                onChange={(val) =>
                                    setPrefs((prev) => ({
                                        ...prev,
                                        work_from_home: val,
                                    }))
                                }
                                options={[
                                    { value: "never", label: "Campus / Office 🏢" },
                                    { value: "sometimes", label: "Hybrid (1–2 days) 💻" },
                                    { value: "most_days", label: "Hybrid (3–4 days) 🏠" },
                                    { value: "full_time", label: "Full remote 🌐" },
                                ]}
                            />

                            {/* Study Atmosphere */}
                            <ChipGroup
                                id="field-atmosphere"
                                label="Study / Work Atmosphere"
                                value={String(prefs.study_environment ?? "")}
                                disabled={isSaving}
                                onChange={(val) =>
                                    setPrefs((prev) => ({
                                        ...prev,
                                        study_environment: val,
                                    }))
                                }
                                options={[
                                    { value: "silence", label: "Silence 🎧" },
                                    { value: "low_noise", label: "Low noise ☕" },
                                    { value: "music_fine", label: "Music ok 🎶" },
                                ]}
                            />
                        </div>

                        {/* Interactive 5-Point Rating Scales */}
                        <div className="grid gap-6 sm:grid-cols-2 pt-4 border-t border-slate-100 dark:border-slate-700/60">
                            <SegmentedScale
                                id="field-cleanliness"
                                label="Cleanliness Standard"
                                hint="Your tidiness routine for shared spaces."
                                value={prefs.cleanliness}
                                onChange={(val) =>
                                    setPrefs((prev) => ({ ...prev, cleanliness: val }))
                                }
                                descriptions={CLEANLINESS_DESCRIPTIONS}
                                disabled={isSaving}
                            />

                            <SegmentedScale
                                id="field-noise"
                                label="Noise Tolerance"
                                hint="Your sensitivity to conversations and household sounds."
                                value={prefs.noise_tolerance}
                                onChange={(val) =>
                                    setPrefs((prev) => ({ ...prev, noise_tolerance: val }))
                                }
                                descriptions={NOISE_DESCRIPTIONS}
                                disabled={isSaving}
                            />
                        </div>
                    </div>
                )}

                {/* 5. EDUCATION & CAREER TAB */}
                {activeTab === "education" && (
                    <div className="space-y-6">
                        {/* Occupation / Profession */}
                        <div>
                            <Input
                                id="field-occupation"
                                label="Occupation / Current Profession"
                                placeholder="e.g. Software Engineer, Medical Resident, Freelance Designer"
                                value={prefs.occupation || ""}
                                onChange={(e) =>
                                    setPrefs((prev) => ({ ...prev, occupation: e.target.value }))
                                }
                                disabled={isSaving}
                                hint="Your current career or professional field (recommended for discovery)."
                            />
                        </div>

                        {/* Education Details (Conditional) */}
                        <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                        College & University History
                                    </h4>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Optional. Connect with alumni or students from your campus.
                                    </p>
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <Input
                                    id="field-college"
                                    label="College / University"
                                    value={prefs.college || ""}
                                    onChange={(e) =>
                                        setPrefs((prev) => ({ ...prev, college: e.target.value }))
                                    }
                                    placeholder="e.g. IIT Bombay, Delhi University"
                                    disabled={isSaving}
                                />

                                <Input
                                    id="field-degree"
                                    label="Degree / Major"
                                    value={prefs.degree || ""}
                                    onChange={(e) =>
                                        setPrefs((prev) => ({ ...prev, degree: e.target.value }))
                                    }
                                    placeholder="e.g. B.Tech Computer Science, MBA"
                                    disabled={isSaving}
                                />

                                <Input
                                    id="field-stream"
                                    label="Stream / Specialization"
                                    value={prefs.stream || ""}
                                    onChange={(e) =>
                                        setPrefs((prev) => ({ ...prev, stream: e.target.value }))
                                    }
                                    placeholder="e.g. Engineering, Design, Finance"
                                    disabled={isSaving}
                                />

                                <Select
                                    id="field-year"
                                    label="Graduation Year"
                                    value={prefs.year || ""}
                                    onChange={(e) =>
                                        setPrefs((prev) => ({ ...prev, year: e.target.value }))
                                    }
                                    disabled={isSaving}
                                >
                                    <option value="">Not specified</option>
                                    {[2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map((y) => (
                                        <option key={y} value={String(y)}>
                                            Class of {y}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                        </div>
                    </div>
                )}

                {/* Unified Clean Bottom Action Bar */}
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-700/60 pt-4">
                    <div className="text-xs text-slate-500 dark:text-slate-400 self-start sm:self-auto">
                        {isCurrentSectionDirty ? (
                            <span className="font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                <AlertIcon className="h-3.5 w-3.5" />
                                Unsaved changes in this section
                            </span>
                        ) : (
                            <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                                <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-500" />
                                Section up to date
                            </span>
                        )}
                    </div>

                    <div className="flex w-full sm:w-auto items-center gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleDiscardCurrentSection}
                            disabled={!isCurrentSectionDirty || isSaving}
                            className="flex-1 sm:flex-initial"
                        >
                            Discard
                        </Button>
                        <Button
                            size="sm"
                            loading={isSaving}
                            onClick={handleSaveCurrentSection}
                            disabled={!isCurrentSectionDirty || isSaving}
                            className="flex-1 sm:flex-initial"
                        >
                            <SaveIcon className="h-3.5 w-3.5" />
                            Save Changes
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Smart Matching Footer Banner */}
            <Card className="p-4 sm:p-5 bg-gradient-to-r from-brand-500/5 via-violet-500/5 to-transparent border-brand-200/60 dark:border-brand-500/20">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 dark:bg-brand-500/20 text-brand-600 dark:text-brand-300">
                            <SparklesIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
                                Real-Time Compatibility Engine
                            </h3>
                            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
                                Your sleep schedule, noise tolerance, and cleanliness ratings are compared with prospective flatmates. Match scores recalculate immediately when your profile is saved.
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
                            <ArrowRightIcon className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </Card>

            {/* Photo Preview Modal */}
            <Modal
                open={showPreviewModal}
                onClose={() => {
                    setShowPreviewModal(false);
                    setPreviewFailed(false);
                }}
                title="Profile Photo"
                maxWidth="max-w-md"
            >
                <div className="flex flex-col items-center justify-center py-2">
                    {displayAvatar && !previewFailed ? (
                        <img
                            src={displayAvatar}
                            alt={displayName}
                            onError={() => setPreviewFailed(true)}
                            className="max-h-[60vh] w-auto max-w-full rounded-2xl object-cover shadow-md ring-1 ring-black/10 dark:ring-white/10"
                        />
                    ) : (
                        <div className="flex h-36 w-36 items-center justify-center rounded-2xl bg-brand-500 text-4xl font-bold text-white shadow-inner">
                            {displayName?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                    )}
                    <p className="mt-3 text-center text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {displayName}
                    </p>
                    {username && (
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                            @{username}
                        </p>
                    )}
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowPreviewModal(false)}
                    >
                        Close
                    </Button>
                </div>
            </Modal>

            {/* Remove Photo Confirm Dialog */}
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

            {/* Email Change Modal */}
            <Modal
                open={showEmailModal}
                onClose={() => {
                    if (!emailLocked) {
                        setShowEmailModal(false);
                        setEmailStep(1);
                        setNewEmail("");
                        setEmailCode("");
                    }
                }}
                title="Change Verified Email"
                maxWidth="max-w-md"
            >
                {emailStep === 1 ? (
                    <form onSubmit={handleRequestEmailChange} className="space-y-4">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Enter your new email address. We will send a 6-digit verification code to confirm access.
                        </p>
                        <Input
                            type="email"
                            id="new-email-modal-input"
                            label="New Email Address"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="Enter your new email"
                            disabled={emailLocked}
                            required
                        />
                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setShowEmailModal(false)}
                                disabled={emailLocked}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                loading={requestingEmail}
                            >
                                Send Verification Code
                            </Button>
                        </div>
                    </form>
                ) : (
                    <form onSubmit={handleConfirmEmailChange} className="space-y-4">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 dark:text-slate-400">
                                Code sent to <strong>{newEmail}</strong>
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
                            id="email-code-modal-input"
                            label="6-Digit Verification Code"
                            value={emailCode}
                            onChange={(e) =>
                                setEmailCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
                            }
                            placeholder="e.g. 123456"
                            maxLength={6}
                            disabled={confirmingEmail}
                            required
                            hint="Valid for 15 minutes. Check your inbox and spam folder."
                        />
                        <div className="flex justify-between items-center pt-2">
                            <button
                                type="button"
                                onClick={handleRequestEmailChange}
                                disabled={emailLocked}
                                className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                            >
                                <RefreshIcon className="h-3.5 w-3.5" />
                                <span>Resend Code</span>
                            </button>
                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setShowEmailModal(false)}
                                    disabled={emailLocked}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    loading={confirmingEmail}
                                >
                                    Verify & Update
                                </Button>
                            </div>
                        </div>
                    </form>
                )}
            </Modal>

            {/* Public Discovery Profile Preview Modal */}
            <Modal
                open={showPublicPreviewModal}
                onClose={() => setShowPublicPreviewModal(false)}
                title="Public Profile Preview"
                maxWidth="max-w-lg"
            >
                <div className="space-y-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        This is how other potential roommates see your card in Find Flatmates and discovery recommendations.
                    </p>

                    {/* Preview Discovery Card */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                        <div className="p-4 sm:p-5 space-y-4">
                            <div className="flex items-start gap-3.5">
                                <Avatar
                                    name={displayName}
                                    src={displayAvatar}
                                    size="lg"
                                    className="h-16 w-16 rounded-2xl ring-2 ring-brand-500/20 object-cover shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                                            {displayName}
                                        </h3>
                                        {calculateAge(prefs.dob) && (
                                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                                {calculateAge(prefs.dob)} yrs
                                            </span>
                                        )}
                                        {prefs.gender && (
                                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 capitalize">
                                                {prefs.gender.replace("_", " ")}
                                            </span>
                                        )}
                                    </div>

                                    {username && (
                                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                            @{username}
                                        </p>
                                    )}

                                    {/* Housing Intent & Move-in badges */}
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        {prefs.housing_intent && (
                                            <Badge variant={prefs.housing_intent === "have_flat" ? "brand" : prefs.housing_intent === "need_room" ? "info" : "secondary"} size="sm">
                                                {prefs.housing_intent === "have_flat" ? "🏠 Has Flat" : prefs.housing_intent === "need_room" ? "🔑 Needs Room" : "🤝 Team Up"}
                                            </Badge>
                                        )}
                                        {prefs.move_in_date && (
                                            <Badge variant="neutral" size="sm">
                                                🗓️ Move in: {prefs.move_in_date.replace("_", " ")}
                                            </Badge>
                                        )}
                                        <Badge variant={prefs.profile_visibility === "hidden" ? "warning" : "success"} size="sm" dot>
                                            {prefs.profile_visibility === "hidden" ? "Private" : "Discoverable"}
                                        </Badge>
                                    </div>

                                    {/* Bio snippet */}
                                    {prefs.bio && (
                                        <p className="mt-2 text-xs italic text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800 line-clamp-3">
                                            &ldquo;{prefs.bio}&rdquo;
                                        </p>
                                    )}

                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                                        {prefs.location ? (
                                            <span className="flex items-center gap-1 font-medium">
                                                📍 {prefs.location}
                                            </span>
                                        ) : (
                                            <span className="text-slate-400 italic">No location set</span>
                                        )}
                                        {(prefs.budget_min || prefs.budget_max) && (
                                            <span className="font-semibold text-brand-600 dark:text-brand-400">
                                                ₹{prefs.budget_min || "—"} – ₹{prefs.budget_max || "—"}/mo
                                            </span>
                                        )}
                                    </div>

                                    {/* Preferred localities preview */}
                                    {(prefs.preferred_localities || []).length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {prefs.preferred_localities.map((loc, i) => (
                                                <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-brand-50/80 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 border border-brand-200/50 dark:border-brand-800/50">
                                                    {loc}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Occupation & College */}
                            {(prefs.occupation || prefs.college) && (
                                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
                                    {prefs.occupation && (
                                        <p className="font-medium text-slate-800 dark:text-slate-200">
                                            💼 {prefs.occupation}
                                        </p>
                                    )}
                                    {(prefs.college || prefs.degree) && (
                                        <p className="text-slate-600 dark:text-slate-400">
                                            🎓 {[prefs.degree, prefs.college].filter(Boolean).join(" at ")}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Lifestyle Highlights Chips */}
                            <div className="space-y-1.5">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                    Lifestyle & Routine
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                    {prefs.food_preferences && (
                                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 capitalize">
                                            🥗 {prefs.food_preferences.replace("_", " ")}
                                        </span>
                                    )}
                                    {prefs.smoking_preference && (
                                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 capitalize">
                                            🚭 {prefs.smoking_preference.replace("_", " ")}
                                        </span>
                                    )}
                                    {prefs.drinking_preference && (
                                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 capitalize">
                                            🍷 {prefs.drinking_preference.replace("_", " ")}
                                        </span>
                                    )}
                                    {prefs.sleep_schedule && (
                                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 capitalize">
                                            🌙 {prefs.sleep_schedule} sleep
                                        </span>
                                    )}
                                    {prefs.cleanliness !== null && (
                                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300">
                                            ✨ Cleanliness: {prefs.cleanliness}/5
                                        </span>
                                    )}
                                    {prefs.noise_tolerance !== null && (
                                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300">
                                            🔊 Noise: {prefs.noise_tolerance}/5
                                        </span>
                                    )}
                                    {prefs.social_preferences && (
                                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 capitalize">
                                            👥 {prefs.social_preferences} social
                                        </span>
                                    )}
                                    {prefs.pets_preference && (
                                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 capitalize">
                                            🐾 {prefs.pets_preference.replace("_", " ")}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Discovery Status Banner */}
                            <div className="pt-2">
                                {mandatoryStatus.isComplete ? (
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-medium">
                                        <CheckCircleIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                                        <span>Discovery Active: Your card is publicly visible in roommate searches.</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-medium">
                                        <AlertIcon className="h-4 w-4 text-amber-600 shrink-0" />
                                        <span>
                                            Profile {mandatoryStatus.percentage}% complete ({mandatoryStatus.missing.length} required field{mandatoryStatus.missing.length > 1 ? "s" : ""} left). Complete all required fields to appear in matches.
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setShowPublicPreviewModal(false)}
                        >
                            Close Preview
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}

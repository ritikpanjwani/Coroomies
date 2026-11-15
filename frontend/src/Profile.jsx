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
} from "./components/Icons";
import { isValidUpiId } from "./utils/upi";
import { errorMessage } from "./utils/format";

// Default living preference values
const PREF_DEFAULTS = {
    sleep_schedule: "normal",
    cleanliness: 5,
    noise_tolerance: 5,
    study_habits: "morning",
    smoking_preference: "non_smoker",
    food_preferences: "vegetarian",
    social_preferences: "moderate",
    guest_preferences: "sometimes",
    work_from_home: "sometimes",
    study_environment: "low_noise",
    pets_preference: "no_preference",
    college: "",
    degree: "",
    stream: "",
    year: "",
};

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
        description: "Food preferences, guests, social energy, and smoking.",
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
                    const loadedPrefs = {
                        ...PREF_DEFAULTS,
                        ...profileRes.data,
                        cleanliness: Number(profileRes.data.cleanliness) || 5,
                        noise_tolerance: Number(profileRes.data.noise_tolerance) || 5,
                        college: profileRes.data.college || "",
                        degree: profileRes.data.degree || "",
                        stream: profileRes.data.stream || "",
                        year: profileRes.data.year ? String(profileRes.data.year) : "",
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

    // Calculate profile completion percentage
    const profileCompletion = useMemo(() => {
        let total = 6;
        let completed = 0;
        if (avatarUrl) completed += 1;
        if (name.trim()) completed += 1;
        if (username.trim()) completed += 1;
        if (upiId.trim() && isValidUpiId(upiId)) completed += 1;
        if (prefs.cleanliness && prefs.noise_tolerance) completed += 1;
        if (prefs.food_preferences && prefs.smoking_preference) completed += 1;
        return Math.round((completed / total) * 100);
    }, [avatarUrl, name, username, upiId, prefs]);

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
            const payload = {
                ...prefs,
                cleanliness: Math.min(10, Math.max(1, Number(prefs.cleanliness) || 5)),
                noise_tolerance: Math.min(10, Math.max(1, Number(prefs.noise_tolerance) || 5)),
                college: prefs.college?.trim() || null,
                degree: prefs.degree?.trim() || null,
                stream: prefs.stream?.trim() || null,
                year: prefs.year ? Number(prefs.year) : null,
            };

            await api.put("/profile/", payload);
            setInitialPrefs({ ...prefs });
            toast.success("Living preferences saved. Matchmaking ratings updated!");
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

import { useCallback, useEffect, useMemo, useState } from "react";

import api from "./api";

import Card from "./components/ui/Card";

import Button from "./components/ui/Button";

import Badge from "./components/ui/Badge";

import Avatar from "./components/ui/Avatar";

import Modal from "./components/ui/Modal";

import ConfirmDialog from "./components/ui/ConfirmDialog";

import EmptyState from "./components/ui/EmptyState";

import Spinner from "./components/ui/Spinner";

import PageHeader from "./components/ui/PageHeader";

import { Select, Input, Textarea } from "./components/ui/Field";

import { useToast } from "./components/Toast";

import {
    UsersRoundIcon,
    UserRoundIcon,
    UserRoundPlusIcon,
    MessageCircleIcon,
    RefreshCwIcon,
    CheckCircleIcon,
    InfoIcon,
    XIcon,
    UsersIcon,
    PlusIcon,
    Trash2Icon,
    MapPinIcon,
    WalletIcon,
    ClockIcon,
    SparklesIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    ArrowLeftRightIcon,
    SlidersHorizontalIcon,
    ArrowRightIcon,
} from "./components/Icons";

import { errorMessage, formatCurrency } from "./utils/format";

import {

    compatibilityColor,

    compatibilityLabel,

    compatibilityTailwind,

} from "./utils/compatibility";



function ScoreRing({ score, size = "lg" }) {
    const color = compatibilityColor(score);
    const dims = size === "lg" ? "h-16 w-16 sm:h-20 sm:w-20" : "h-12 w-12 sm:h-14 sm:w-14";
    const text = size === "lg" ? "text-base sm:text-lg" : "text-xs sm:text-sm";
    return (
        <div
            className={`relative ${dims} shrink-0`}
            style={{
                background: `conic-gradient(${color} ${score * 3.6}deg, #eef2f7 ${score * 3.6}deg)`,
                borderRadius: "9999px",
            }}
        >
            <div
                className={`absolute inset-1.5 sm:inset-2 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 ${text} font-bold`}
                style={{ color }}
            >
                {score}%
            </div>
        </div>
    );
}



function MatchDetail({ match, relState, onClose, onSendRequest, onOpenRequests, onMessage }) {
    const reasons = match.reasons || [];
    const matched = reasons.filter((r) => r.match);
    const mismatched = reasons.filter((r) => !r.match);

    return (
        <Modal open onClose={onClose} title="Roommate Compatibility Details">
            <div className="flex items-center gap-4">
                <Avatar name={match.name} size="xl" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="truncate text-xl font-bold text-slate-900 dark:text-slate-100">
                            {match.name}
                        </h3>
                        {match.age && (
                            <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                {match.age} yrs
                            </span>
                        )}
                        {match.gender && match.gender !== "prefer_not_to_say" && (
                            <span className="inline-flex items-center rounded-md bg-brand-50 dark:bg-brand-950/50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300 border border-brand-200/60 dark:border-brand-800/60">
                                {match.gender.charAt(0).toUpperCase() + match.gender.slice(1)}
                            </span>
                        )}
                    </div>
                    {match.occupation && (
                        <p className="text-xs font-semibold text-brand-600 dark:text-brand-400 mt-0.5">
                            {match.occupation}
                        </p>
                    )}
                    {(match.college || match.degree) && (
                        <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                            {[match.degree, match.stream, match.college].filter(Boolean).join(" · ")}
                        </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                        {match.location && (
                            <span className="inline-flex items-center gap-1">
                                <MapPinIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                {match.location}
                            </span>
                        )}
                        {(match.budget_min !== null || match.budget_max !== null) && (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                                <WalletIcon className="h-3.5 w-3.5 shrink-0" />
                                {match.budget_min && match.budget_max
                                    ? `₹${match.budget_min.toLocaleString()} – ₹${match.budget_max.toLocaleString()}`
                                    : (match.budget_min ? `From ₹${match.budget_min.toLocaleString()}` : `Up to ₹${match.budget_max.toLocaleString()}`)}
                            </span>
                        )}
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                        <div className="h-2 max-w-[9rem] flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                            <div
                                className={`h-full rounded-full bg-gradient-to-r ${compatibilityTailwind(
                                    match.compatibility
                                )}`}
                                style={{ width: `${match.compatibility}%` }}
                            />
                        </div>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                            {match.compatibility}% ({compatibilityLabel(match.compatibility)})
                        </span>
                    </div>
                </div>
            </div>

            {reasons.length === 0 ? (
                <p className="mt-6 rounded-lg bg-slate-50 dark:bg-slate-900 p-4 text-sm text-slate-500 dark:text-slate-400">
                    Lifestyle breakdown unavailable — complete your preferences in My Profile to see detailed comparisons.
                </p>
            ) : (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div>
                        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircleIcon className="h-4 w-4" />
                            <span>Matched Traits ({matched.length})</span>
                        </div>
                        {matched.length === 0 ? (
                            <p className="text-sm text-slate-400 dark:text-slate-500">No matching traits yet</p>
                        ) : (
                            <ul className="space-y-2">
                                {matched.map((reason, i) => (
                                    <li
                                        key={i}
                                        className="rounded-lg border border-emerald-200/60 bg-emerald-50/60 dark:border-emerald-900/30 dark:bg-emerald-950/20 p-2.5 text-sm"
                                    >
                                        <div className="flex items-center justify-between font-medium text-emerald-900 dark:text-emerald-300">
                                            <span>{reason.label}</span>
                                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Aligned</span>
                                        </div>
                                        {(reason.my_value || reason.other_value) && (
                                            <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                                <span>You: <strong className="text-slate-700 dark:text-slate-300">{reason.my_value || "—"}</strong></span>
                                                <span>Them: <strong className="text-slate-700 dark:text-slate-300">{reason.other_value || "—"}</strong></span>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div>
                        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
                            <InfoIcon className="h-4 w-4" />
                            <span>Different Habits ({mismatched.length})</span>
                        </div>
                        {mismatched.length === 0 ? (
                            <p className="text-sm text-slate-400 dark:text-slate-500">No lifestyle differences</p>
                        ) : (
                            <ul className="space-y-2">
                                {mismatched.map((reason, i) => (
                                    <li
                                        key={i}
                                        className="rounded-lg border border-amber-200/60 bg-amber-50/60 dark:border-amber-900/30 dark:bg-amber-950/20 p-2.5 text-sm"
                                    >
                                        <div className="flex items-center justify-between font-medium text-amber-900 dark:text-amber-300">
                                            <span>{reason.label}</span>
                                            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Different</span>
                                        </div>
                                        {(reason.my_value || reason.other_value) && (
                                            <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                                <span>You: <strong className="text-slate-700 dark:text-slate-300">{reason.my_value || "—"}</strong></span>
                                                <span>Them: <strong className="text-slate-700 dark:text-slate-300">{reason.other_value || "—"}</strong></span>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button variant="secondary" fullWidth onClick={onClose}>
                    Close
                </Button>
                {relState === "pending" ? (
                    <Button fullWidth variant="secondary" disabled>
                        <ClockIcon className="h-4 w-4" />
                        Pending request
                    </Button>
                ) : relState === "connected" ? (
                    <Button
                        fullWidth
                        variant="success"
                        onClick={() => {
                            localStorage.setItem("chat_peer", String(match.user_id));
                            if (onMessage) onMessage();
                        }}
                    >
                        <MessageCircleIcon className="h-4 w-4" />
                        Message
                    </Button>
                ) : relState === "incoming" ? (
                    <Button fullWidth variant="success" onClick={onOpenRequests}>
                        <UserRoundPlusIcon className="h-4 w-4" />
                        Respond to request
                    </Button>
                ) : relState === "declined" ? (
                    <Button fullWidth variant="secondary" disabled title="Your request was declined">
                        Request declined
                    </Button>
                ) : (
                    <Button fullWidth onClick={() => onSendRequest(match)}>
                        <UserRoundPlusIcon className="h-4 w-4" />
                        Connect as flatmate
                    </Button>
                )}
            </div>
        </Modal>
    );
}

function RequestStatusBadge({ status }) {

    const map = {

        pending: ["warning", "Pending"],

        accepted: ["success", "Accepted"],

        rejected: ["danger", "Rejected"],

    };

    const [variant, label] = map[status] || ["neutral", status];

    return (

        <Badge variant={variant} dot>

            {label}

        </Badge>

    );

}



function RequestsPanel({ setPage, activeSubtab, onSubtabChange }) {
    const [localTab, setLocalTab] = useState(() => {
        const stored = localStorage.getItem("requests_subtab");
        if (stored) {
            localStorage.removeItem("requests_subtab");
            return stored;
        }
        return activeSubtab || "received";
    });

    const tab = activeSubtab || localTab;

    const handleTabChange = (newTab) => {
        setLocalTab(newTab);
        if (onSubtabChange) onSubtabChange(newTab);
    };

    const [receivedRequests, setReceivedRequests] = useState([]);
    const [sentRequests, setSentRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmDialog, setConfirmDialog] = useState({
        show: false,
        requestId: null,
        action: null,
        userName: null,
    });
    const [acting, setActing] = useState(false);
    const [withdrawingId, setWithdrawingId] = useState(null);
    const toast = useToast();

    const openChat = (userId) => {
        localStorage.setItem("chat_peer", String(userId));
        if (setPage) setPage("chat");
    };

    const handleWithdrawRequest = async (request) => {
        try {
            setWithdrawingId(request.request_id);
            await api.delete(`/requests/${request.request_id}`);
            toast.success(`Withdrew request to ${request.user_name || "user"}`);
            setSentRequests((prev) => prev.filter((r) => r.request_id !== request.request_id));
            window.dispatchEvent(new CustomEvent("coroomies:refresh-counts"));
        } catch (error) {
            toast.error(errorMessage(error, "Could not withdraw request"));
        } finally {
            setWithdrawingId(null);
        }
    };



    const loadRequests = useCallback(

        async (showLoading = false) => {

            try {

                if (showLoading) setLoading(true);

                const response = await api.get("/requests/");

                setReceivedRequests(response.data.received_requests || []);

                setSentRequests(response.data.sent_requests || []);

            } catch (error) {

                console.error(error.response?.data);

                toast.error("Could not load requests");

            } finally {

                setLoading(false);

            }

        },

        [toast]

    );



    useEffect(() => {

        // Initial data load — async loader, safe in effect

        void (async () => {
            await loadRequests();
        })();

    }, [loadRequests]);



    const respond = async () => {

        const { requestId, action } = confirmDialog;

        try {

            setActing(true);

            await api.put(`/requests/${requestId}/${action}`);

            toast.success(

                action === "accept"

                    ? "Request accepted — you're now roommates!"

                    : "Request rejected."

            );

            setConfirmDialog({ show: false, requestId: null, action: null, userName: null });

            await loadRequests();
            window.dispatchEvent(new Event("coroomies:refresh-counts"));

        } catch (error) {

            toast.error(errorMessage(error, "Request failed"));

        } finally {

            setActing(false);

        }

    };



    const confirmAction = (requestId, action, userName) => {

        setConfirmDialog({ show: true, requestId, action, userName });

    };



    if (loading) {

        return (

            <div className="flex justify-center py-16">

                <Spinner size="lg" />

            </div>

        );

    }



    const receivedPending = receivedRequests.filter(

        (r) => r.status === "pending"

    );



    return (

        <>

            {/* Subtabs */}

            <div className="mb-6 flex gap-1.5 overflow-x-auto no-scrollbar rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 shadow-sm">

                <button

                    className={`shrink-0 sm:flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${

                        tab === "received"

                            ? "bg-gradient-to-r from-brand-600 to-violet-500 text-white shadow-sm"

                            : "text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900"

                    }`}

                    onClick={() => handleTabChange("received")}

                >

                    Received

                    {receivedPending.length > 0 && (

                        <span

                            className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${

                                tab === "received"

                                    ? "bg-white/25 text-white"

                                    : "bg-amber-100 text-amber-700 dark:text-amber-300"

                            }`}

                        >

                            {receivedPending.length}

                        </span>

                    )}

                </button>

                <button

                    className={`shrink-0 sm:flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:px-4 sm:text-sm ${

                        tab === "sent"

                            ? "bg-gradient-to-r from-brand-600 to-violet-500 text-white shadow-sm"

                            : "text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900"

                    }`}

                    onClick={() => handleTabChange("sent")}

                >

                    Sent ({sentRequests.length})

                </button>

            </div>



            {/* Received */}

            {tab === "received" &&

                (receivedRequests.length === 0 ? (

                    <Card>

                        <EmptyState

                            icon={<UserRoundPlusIcon className="h-6 w-6" />}

                            title="No requests yet"

                            description="When someone sends you a roommate request, it will appear here."

                        />

                    </Card>

                ) : (

                    <div className="space-y-3">

                        {receivedRequests.map((request) => (

                            <Card

                                key={request.request_id}

                                className="flex items-center gap-4 p-4"

                            >

                                <Avatar name={request.user_name} size="lg" />

                                <div className="min-w-0 flex-1">

                                    <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">

                                        {request.user_name}

                                    </h3>

                                    <div className="mt-1">

                                        <RequestStatusBadge status={request.status} />

                                    </div>

                                </div>



                                {request.status === "pending" ? (

                                    <div className="flex gap-2">

                                        <Button

                                            size="sm"

                                            variant="success"

                                            onClick={() =>

                                                confirmAction(

                                                    request.request_id,

                                                    "accept",

                                                    request.user_name

                                                )

                                            }

                                        >

                                            <CheckCircleIcon className="h-4 w-4" />

                                            Accept

                                        </Button>

                                        <Button

                                            size="sm"

                                            variant="dangerOutline"

                                            onClick={() =>

                                                confirmAction(

                                                    request.request_id,

                                                    "reject",

                                                    request.user_name

                                                )

                                            }

                                        >

                                            <XIcon className="h-4 w-4" />

                                            Reject

                                        </Button>

                                    </div>

                                ) : (

                                    request.status === "accepted" ? (

                                        <Button
                                            size="sm"
                                            variant="success"
                                            onClick={() => openChat(request.user_id)}
                                        >
                                            <MessageCircleIcon className="h-4 w-4" />
                                            Message
                                        </Button>

                                    ) : (

                                        <span className="text-xs text-slate-400 dark:text-slate-500">

                                            Request closed

                                        </span>

                                    )

                                )}

                            </Card>

                        ))}

                    </div>

                ))}



            {/* Sent */}

            {tab === "sent" &&

                (sentRequests.length === 0 ? (

                    <Card>

                        <EmptyState

                            icon={<UserRoundPlusIcon className="h-6 w-6" />}

                            title="No sent requests"

                            description="Send a request from the People tab to get started."

                        />

                    </Card>

                ) : (

                    <div className="space-y-3">

                        {sentRequests.map((request) => (

                            <Card

                                key={request.request_id}

                                className="flex items-center gap-4 p-4"

                            >

                                <Avatar name={request.user_name} size="lg" />

                                <div className="min-w-0 flex-1">

                                    <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">

                                        {request.user_name}

                                    </h3>

                                    <div className="mt-1">

                                        <RequestStatusBadge status={request.status} />

                                    </div>

                                </div>

                                {request.status === "pending" ? (
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500">
                                            Awaiting response
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            loading={withdrawingId === request.request_id}
                                            onClick={() => handleWithdrawRequest(request)}
                                            className="text-xs font-semibold py-1 px-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-900/50"
                                        >
                                            Withdraw
                                        </Button>
                                    </div>
                                ) : request.status === "accepted" ? (

                                    <Button
                                        size="sm"
                                        variant="success"
                                        onClick={() => openChat(request.user_id)}
                                    >
                                        <MessageCircleIcon className="h-4 w-4" />
                                        Message
                                    </Button>

                                ) : (

                                    <span className="text-xs text-slate-400 dark:text-slate-500">

                                        Rejected

                                    </span>

                                )}

                            </Card>

                        ))}

                    </div>

                ))}



            <ConfirmDialog

                open={confirmDialog.show}

                title={

                    confirmDialog.action === "accept"

                        ? "Accept request"

                        : "Reject request"

                }

                message={

                    confirmDialog.action === "accept"

                        ? `Accept the request from ${confirmDialog.userName}? You'll be matched as roommates.`

                        : `Reject the request from ${confirmDialog.userName}?`

                }

                confirmLabel={

                    confirmDialog.action === "accept" ? "Accept" : "Reject"

                }

                variant={

                    confirmDialog.action === "accept" ? "success" : "danger"

                }

                loading={acting}

                onConfirm={respond}

                onCancel={() =>

                    setConfirmDialog({

                        show: false,

                        requestId: null,

                        action: null,

                        userName: null,

                    })

                }

            />

        </>

    );

}



function CandidatesPanel({ setPage, onOpenRequests }) {
    const [allMatches, setAllMatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [sortBy, setSortBy] = useState("compatibility");

    // Discovery Filters
    const [filterMinScore, setFilterMinScore] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [genderFilter, setGenderFilter] = useState("all"); // "all" | "female" | "male"
    const [minAgeFilter, setMinAgeFilter] = useState("");
    const [maxAgeFilter, setMaxAgeFilter] = useState("");
    const [locationFilter, setLocationFilter] = useState("");
    const [minBudgetFilter, setMinBudgetFilter] = useState("");
    const [maxBudgetFilter, setMaxBudgetFilter] = useState("");
    const [lifestyleFilter, setLifestyleFilter] = useState("all");
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    // Profile completion requirement status from server
    const [profileIncomplete, setProfileIncomplete] = useState(false);
    const [missingFields, setMissingFields] = useState([]);

    const [detailMatch, setDetailMatch] = useState(null);
    const [requestTarget, setRequestTarget] = useState(null);
    const [sending, setSending] = useState(false);

    // user_id -> status of a request I sent them ("pending"/"accepted"/"rejected")
    const [sentStatus, setSentStatus] = useState({});

    // user_id -> status of a request THEY sent me ("pending"/"accepted"/"rejected")
    const [receivedStatus, setReceivedStatus] = useState({});

    // Combined relationship state used to pick the right button.
    const getRelation = (userId) => {
        const sent = sentStatus[userId];
        const received = receivedStatus[userId];
        if (sent === "accepted" || received === "accepted") return "connected";
        if (received === "pending") return "incoming";
        if (sent === "pending") return "pending";
        if (sent === "rejected") return "declined";
        return "none";
    };

    const toast = useToast();

    const hasActiveFilters = Boolean(
        searchQuery ||
        genderFilter !== "all" ||
        minAgeFilter !== "" ||
        maxAgeFilter !== "" ||
        locationFilter ||
        minBudgetFilter !== "" ||
        maxBudgetFilter !== "" ||
        lifestyleFilter !== "all" ||
        filterMinScore > 0
    );

    const handleResetFilters = () => {
        setSearchQuery("");
        setGenderFilter("all");
        setMinAgeFilter("");
        setMaxAgeFilter("");
        setLocationFilter("");
        setMinBudgetFilter("");
        setMaxBudgetFilter("");
        setLifestyleFilter("all");
        setFilterMinScore(0);
        setSortBy("compatibility");
    };

    const matches = useMemo(() => {
        let list = [...allMatches];

        // Search text
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter((m) =>
                m.name?.toLowerCase().includes(q) ||
                m.college?.toLowerCase().includes(q) ||
                m.degree?.toLowerCase().includes(q) ||
                m.stream?.toLowerCase().includes(q) ||
                m.location?.toLowerCase().includes(q) ||
                m.occupation?.toLowerCase().includes(q)
            );
        }

        // Gender filter
        if (genderFilter !== "all") {
            list = list.filter((m) => m.gender?.toLowerCase() === genderFilter.toLowerCase());
        }

        // Age bounds
        if (minAgeFilter !== "") {
            const minA = Number(minAgeFilter);
            if (!isNaN(minA)) {
                list = list.filter((m) => m.age !== null && m.age !== undefined && m.age >= minA);
            }
        }
        if (maxAgeFilter !== "") {
            const maxA = Number(maxAgeFilter);
            if (!isNaN(maxA)) {
                list = list.filter((m) => m.age !== null && m.age !== undefined && m.age <= maxA);
            }
        }

        // Location
        if (locationFilter.trim()) {
            const lq = locationFilter.trim().toLowerCase();
            list = list.filter((m) => m.location?.toLowerCase().includes(lq));
        }

        // Budget
        if (minBudgetFilter !== "") {
            const minB = Number(minBudgetFilter);
            if (!isNaN(minB)) {
                list = list.filter((m) => m.budget_max === null || m.budget_max === undefined || m.budget_max >= minB);
            }
        }
        if (maxBudgetFilter !== "") {
            const maxB = Number(maxBudgetFilter);
            if (!isNaN(maxB)) {
                list = list.filter((m) => m.budget_min === null || m.budget_min === undefined || m.budget_min <= maxB);
            }
        }

        // Lifestyle filter
        if (lifestyleFilter !== "all") {
            if (lifestyleFilter === "non_smoker") {
                list = list.filter((m) => m.smoking_preference === "non_smoker");
            } else if (lifestyleFilter === "vegetarian") {
                list = list.filter((m) => m.food_preferences === "vegetarian" || m.food_preferences === "vegan");
            } else if (lifestyleFilter === "non_drinker") {
                list = list.filter((m) => m.drinking_preference === "non_drinker");
            } else if (lifestyleFilter === "early_bird") {
                list = list.filter((m) => m.sleep_schedule === "early");
            }
        }

        // Compatibility score threshold
        list = list.filter((m) => m.compatibility >= filterMinScore);

        // Sorting
        if (sortBy === "compatibility") {
            list.sort((a, b) => b.compatibility - a.compatibility);
        } else if (sortBy === "name") {
            list.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortBy === "age_asc") {
            list.sort((a, b) => (a.age || 999) - (b.age || 999));
        }

        return list;
    }, [allMatches, searchQuery, genderFilter, minAgeFilter, maxAgeFilter, locationFilter, minBudgetFilter, maxBudgetFilter, lifestyleFilter, filterMinScore, sortBy]);

    const loadMatches = useCallback(
        async (showLoading = false) => {
            try {
                if (showLoading) setLoading(true);

                const [response, reqRes] = await Promise.all([
                    api.get("/matches/"),
                    api.get("/requests/").catch(() => null),
                ]);

                if (response?.data) {
                    setAllMatches(response.data.matches || []);
                    setProfileIncomplete(Boolean(response.data.profile_incomplete));
                    setMissingFields(response.data.missing_fields || []);
                }

                if (reqRes && reqRes.data) {
                    const sent = {};
                    (reqRes.data.sent_requests || []).forEach((r) => {
                        sent[r.user_id] = r.status;
                    });
                    const received = {};
                    (reqRes.data.received_requests || []).forEach((r) => {
                        received[r.user_id] = r.status;
                    });
                    setSentStatus(sent);
                    setReceivedStatus(received);
                }
            } catch (error) {
                console.error(error.response?.data);
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        []
    );



    useEffect(() => {

        // Initial data load � async loader, safe in effect

        void (async () => {
            await loadMatches();
        })();

    }, [loadMatches]);


    const handleRefresh = async () => {

        setRefreshing(true);

        await loadMatches(true);

    };



    const sendRequest = async () => {

        if (!requestTarget) return;

        try {

            setSending(true);

            await api.post(`/requests/${requestTarget.user_id}`);

            setSentStatus((prev) => ({
                ...prev,
                [requestTarget.user_id]: "pending",
            }));

            toast.success(

                `Request sent to ${requestTarget.name}! Check the Requests tab to track it.`

            );
            window.dispatchEvent(new Event("coroomies:refresh-counts"));

            setRequestTarget(null);

            setDetailMatch(null);

        } catch (error) {

            toast.error(errorMessage(error, "Could not send request"));

        } finally {

            setSending(false);

        }

    };



    const renderRequestAction = (match) => {
        const rel = getRelation(match.user_id);

        if (rel === "connected") {
            return (
                <Button
                    size="sm"
                    variant="success"
                    className="w-full min-h-[40px] text-xs font-semibold justify-center"
                    onClick={() => {
                        localStorage.setItem("chat_peer", String(match.user_id));
                        setPage("chat");
                    }}
                >
                    <MessageCircleIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>Message</span>
                </Button>
            );
        }
        if (rel === "pending") {
            return (
                <Button size="sm" variant="secondary" className="w-full min-h-[40px] text-xs font-semibold justify-center text-slate-500" disabled>
                    <ClockIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>Pending</span>
                </Button>
            );
        }
        if (rel === "declined") {
            return (
                <Button size="sm" variant="secondary" className="w-full min-h-[40px] text-xs font-semibold justify-center text-slate-400" disabled title="Your request was declined">
                    <span>Request declined</span>
                </Button>
            );
        }
        if (rel === "incoming") {
            return (
                <Button
                    size="sm"
                    variant="success"
                    className="w-full min-h-[40px] text-xs font-semibold justify-center"
                    onClick={onOpenRequests}
                    title={`${match.name} sent you a request — respond in the Requests tab`}
                >
                    <UserRoundPlusIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>Respond</span>
                </Button>
            );
        }
        return (
            <Button
                size="sm"
                className="w-full min-h-[40px] text-xs font-semibold justify-center"
                onClick={() => setRequestTarget(match)}
            >
                <UserRoundPlusIcon className="h-3.5 w-3.5 shrink-0" />
                <span>Connect</span>
            </Button>
        );
    };



    if (loading && !refreshing) {

        return (

            <div className="flex justify-center py-24">

                <Spinner size="lg" />

            </div>

        );

    }



    return (

        <>

            {/* Profile Completion Guidance Banner */}
            {profileIncomplete && (
                <div className="mb-6 rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50 to-orange-50 dark:border-amber-900/50 dark:from-amber-950/30 dark:to-orange-950/20 p-4 sm:p-5 shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
                                <InfoIcon className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                                    Complete your profile to unlock compatible flatmate recommendations
                                </h3>
                                <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                                    We match roommates based on mutually preferred gender, verified age, and routine compatibility.
                                </p>
                                {missingFields.length > 0 && (
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <span className="text-[11px] font-semibold text-amber-800/80 dark:text-amber-300/80">Missing:</span>
                                        {missingFields.map((f, i) => (
                                            <span key={i} className="inline-flex items-center gap-1 rounded-md bg-white/90 dark:bg-slate-800/90 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800/60 shadow-2xs">
                                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                                {f}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <Button
                            size="sm"
                            onClick={() => setPage && setPage("profile")}
                            className="shrink-0 self-start sm:self-auto bg-amber-600 hover:bg-amber-700 text-white border-transparent shadow-xs"
                        >
                            <span>Complete Profile</span>
                            <ArrowRightIcon className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Filter Controls Card */}
            <Card className="mb-6 p-4 sm:p-5">
                <div className="space-y-3.5">
                    {/* Primary Bar: Search, Sort, Toggle Filters, Refresh */}
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                        <div className="w-full lg:flex-1">
                            <Input
                                label="Search flatmates"
                                placeholder="Search by name, location, occupation, college..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2.5 sm:flex sm:items-end sm:gap-3 lg:shrink-0">
                            <div className="w-full sm:w-40">
                                <Select
                                    label="Sort by"
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                >
                                    <option value="compatibility">Compatibility</option>
                                    <option value="name">Name (A–Z)</option>
                                    <option value="age_asc">Age (Youngest first)</option>
                                </Select>
                            </div>
                            <Button
                                variant={showAdvancedFilters || hasActiveFilters ? "brand" : "secondary"}
                                size="sm"
                                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                                className="min-h-[42px] justify-center"
                            >
                                <SlidersHorizontalIcon className="h-4 w-4" />
                                <span>Filters</span>
                                {hasActiveFilters && (
                                    <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-white dark:bg-brand-400" />
                                )}
                            </Button>
                        </div>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleRefresh}
                            loading={refreshing}
                            className="w-full lg:w-auto shrink-0 min-h-[42px] justify-center"
                        >
                            <RefreshCwIcon className="h-4 w-4" />
                            <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
                        </Button>
                    </div>

                    {/* Advanced Filters Drawer */}
                    {showAdvancedFilters && (
                        <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-4 pt-4">
                            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                                {/* Gender Filter */}
                                <Select
                                    label="Gender"
                                    value={genderFilter}
                                    onChange={(e) => setGenderFilter(e.target.value)}
                                >
                                    <option value="all">All Eligible Genders</option>
                                    <option value="female">Female only</option>
                                    <option value="male">Male only</option>
                                </Select>

                                {/* Location Filter */}
                                <Input
                                    label="Location"
                                    placeholder="e.g. Bangalore, Mumbai"
                                    value={locationFilter}
                                    onChange={(e) => setLocationFilter(e.target.value)}
                                />

                                {/* Age Range */}
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                                        Age Range
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            placeholder="Min (18)"
                                            value={minAgeFilter}
                                            onChange={(e) => setMinAgeFilter(e.target.value)}
                                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                                        />
                                        <span className="text-slate-400 text-xs">to</span>
                                        <input
                                            type="number"
                                            placeholder="Max (35)"
                                            value={maxAgeFilter}
                                            onChange={(e) => setMaxAgeFilter(e.target.value)}
                                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                </div>

                                {/* Lifestyle Highlights */}
                                <Select
                                    label="Lifestyle Highlights"
                                    value={lifestyleFilter}
                                    onChange={(e) => setLifestyleFilter(e.target.value)}
                                >
                                    <option value="all">All Lifestyles</option>
                                    <option value="non_smoker">Non-smoker only</option>
                                    <option value="vegetarian">Vegetarian / Vegan</option>
                                    <option value="non_drinker">Non-drinker only</option>
                                    <option value="early_bird">Early bird rhythm</option>
                                </Select>
                            </div>

                            {/* Row 2: Budget & Min Score Slider */}
                            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                                <div>
                                    <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                                        Budget Range (₹/month)
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            placeholder="Min ₹"
                                            value={minBudgetFilter}
                                            onChange={(e) => setMinBudgetFilter(e.target.value)}
                                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                                        />
                                        <span className="text-slate-400 text-xs">to</span>
                                        <input
                                            type="number"
                                            placeholder="Max ₹"
                                            value={maxBudgetFilter}
                                            onChange={(e) => setMaxBudgetFilter(e.target.value)}
                                            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                            Min Compatibility Score:
                                        </label>
                                        <span className="text-xs font-bold text-brand-600 dark:text-brand-400">{filterMinScore}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        step="10"
                                        value={filterMinScore}
                                        onChange={(e) => setFilterMinScore(Number(e.target.value))}
                                        className="w-full accent-brand-500 h-8"
                                    />
                                </div>
                            </div>

                            {/* Reset button */}
                            {hasActiveFilters && (
                                <div className="flex justify-end pt-1">
                                    <button
                                        type="button"
                                        onClick={handleResetFilters}
                                        className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                                    >
                                        Clear all filters
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Card>

            {matches.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<UsersRoundIcon className="h-6 w-6" />}
                        title={
                            filterMinScore > 0 || hasActiveFilters
                                ? "No matches matching your filters"
                                : "No matches found"
                        }
                        description={
                            filterMinScore > 0 || hasActiveFilters
                                ? "Try adjusting or clearing your filters to see more flatmates."
                                : "Complete your profile preferences to start finding compatible roommates."
                        }
                    >
                        {hasActiveFilters ? (
                            <Button variant="secondary" onClick={handleResetFilters}>
                                Clear filters
                            </Button>
                        ) : (
                            <Button onClick={() => setPage("profile")}>
                                <UserRoundIcon className="h-4 w-4" />
                                Complete my profile
                            </Button>
                        )}
                    </EmptyState>
                </Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {matches.map((match) => (
                        <Card
                            key={match.user_id}
                            className="flex flex-col justify-between p-4 sm:p-5 overflow-hidden transition-all duration-200 hover:shadow-md"
                        >
                            <div className="space-y-3.5">
                                {/* Header: Avatar, Name, Age & Gender Badges, Academic/Occupation Info */}
                                <div className="flex items-start gap-3 min-w-0">
                                    <Avatar name={match.name} size="lg" className="rounded-full shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                            <h3 className="truncate text-base font-bold text-slate-900 dark:text-slate-100">
                                                {match.name}
                                            </h3>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {match.age && (
                                                    <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-700/80 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                                                        {match.age} yrs
                                                    </span>
                                                )}
                                                {match.gender && match.gender !== "prefer_not_to_say" && (
                                                    <span className="inline-flex items-center rounded-md bg-brand-50 dark:bg-brand-950/50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700 dark:text-brand-300 border border-brand-200/60 dark:border-brand-800/60">
                                                        {match.gender.charAt(0).toUpperCase() + match.gender.slice(1)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {match.occupation ? (
                                            <p className="truncate text-xs font-medium text-brand-600 dark:text-brand-400 mt-0.5">
                                                {match.occupation}
                                                {(match.degree || match.college) ? ` · ${[match.degree, match.college].filter(Boolean).join(" · ")}` : ""}
                                            </p>
                                        ) : (match.college || match.degree) ? (
                                            <p className="truncate text-xs font-medium text-brand-600 dark:text-brand-400 mt-0.5">
                                                {[match.degree, match.stream, match.college].filter(Boolean).join(" · ")}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                                Flatmate candidate
                                            </p>
                                        )}

                                        {/* Location & Budget Pills */}
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                            {match.location && (
                                                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 truncate max-w-[140px]">
                                                    <MapPinIcon className="h-3 w-3 text-slate-400 shrink-0" />
                                                    <span className="truncate">{match.location}</span>
                                                </span>
                                            )}
                                            {(match.budget_min !== null || match.budget_max !== null) && (
                                                <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                                                    <WalletIcon className="h-3 w-3 shrink-0" />
                                                    <span>
                                                        {match.budget_min && match.budget_max
                                                            ? `₹${match.budget_min.toLocaleString()} – ₹${match.budget_max.toLocaleString()}`
                                                            : (match.budget_min ? `From ₹${match.budget_min.toLocaleString()}` : `Up to ₹${match.budget_max.toLocaleString()}`)}
                                                    </span>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Match score & Compatibility section */}
                                <div className="rounded-xl border border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/40 p-3 flex items-center gap-3 min-w-0">
                                    <div className="shrink-0">
                                        <ScoreRing score={match.compatibility} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                            {compatibilityLabel(match.compatibility)}
                                        </p>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                            {(match.reasons || [])
                                                .slice(0, 3)
                                                .map((reason, i) => (
                                                    <Badge
                                                        key={i}
                                                        variant={reason.match ? "success" : "warning"}
                                                        dot
                                                        size="sm"
                                                        className="text-[10px] px-1.5 py-0.5 shrink-0"
                                                    >
                                                        {reason.label}
                                                    </Badge>
                                                ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Action buttons: Responsive stack on mobile, 2-column grid on sm+ */}
                            <div className="mt-4 flex flex-col sm:grid sm:grid-cols-2 gap-2 border-t border-slate-100 dark:border-slate-700/80 pt-3 min-w-0">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="w-full min-w-0 min-h-[40px] text-xs font-semibold justify-center"
                                    onClick={() => setDetailMatch(match)}
                                >
                                    View profile
                                </Button>
                                <div className="w-full min-w-0">
                                    {renderRequestAction(match)}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}



            {detailMatch && (

                <MatchDetail

                    match={detailMatch}

                    relState={getRelation(detailMatch.user_id)}

                    onClose={() => setDetailMatch(null)}

                    onSendRequest={(m) => {

                        setDetailMatch(null);

                        setRequestTarget(m);

                    }}

                    onOpenRequests={() => {
                        setDetailMatch(null);
                        if (onOpenRequests) onOpenRequests();
                    }}

                    onMessage={() => {
                        const target = detailMatch;
                        setDetailMatch(null);
                        if (target) {
                            localStorage.setItem("chat_peer", String(target.user_id));
                            setPage("chat");
                        }
                    }}

                />

            )}



            <ConfirmDialog

                open={!!requestTarget}

                title="Send roommate request"

                message={

                    requestTarget

                        ? `Send a request to ${requestTarget.name}? They'll get a notification and can accept or reject it.`

                        : ""

                }

                confirmLabel="Send request"

                variant="success"

                loading={sending}

                onConfirm={sendRequest}

                onCancel={() => setRequestTarget(null)}

            />

        </>

    );

}





function StableMatchPanel() {

    const [data, setData] = useState(null);

    const [loading, setLoading] = useState(true);

    const [preferences, setPreferences] = useState([]);

    const [savingPrefs, setSavingPrefs] = useState(false);

    const toast = useToast();



    const loadStable = useCallback(async () => {

        try {

            const response = await api.get("/matches/stable");

            setData(response.data);

        } catch (error) {

            console.error(error.response?.data);

            toast.error("Could not compute stable matching");

        } finally {

            setLoading(false);

        }

    }, [toast]);



    const loadPrefs = useCallback(async () => {

        try {

            const response = await api.get("/matches/preferences");

            setPreferences(response.data.preferences || []);

        } catch (error) {

            console.error(error.response?.data);

        }

    }, []);



    useEffect(() => {

        void (async () => {
            await Promise.all([loadStable(), loadPrefs()]);
        })();

    }, [loadStable, loadPrefs]);



    const removePref = (userId) => {

        setPreferences((prev) => prev.filter((p) => p.user_id !== userId));

    };



    const movePref = (index, dir) => {

        setPreferences((prev) => {

            const next = [...prev];

            const target = index + dir;

            if (target < 0 || target >= next.length) return prev;

            [next[index], next[target]] = [next[target], next[index]];

            return next;

        });

    };



    const savePrefs = async () => {

        try {

            setSavingPrefs(true);

            await api.put("/matches/preferences", {

                preferred_user_ids: preferences.map((p) => p.user_id),

            });

            toast.success("Preference ranking saved");

        } catch (error) {

            toast.error(errorMessage(error, "Could not save preferences"));

        } finally {

            setSavingPrefs(false);

        }

    };



    if (loading) {

        return (

            <div className="flex justify-center py-16">

                <Spinner size="lg" />

            </div>

        );

    }



    return (

        <>

            <div className="mb-5 flex items-center justify-between">

                <div>

                    <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-500">

                        <SparklesIcon className="h-4 w-4 text-brand-500" />

                        One-to-one compatible pairing

                    </p>

                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">

                        Mutually compatible roommate pairs with better-pair detection.

                    </p>

                </div>

                <Button variant="secondary" size="sm" onClick={() => loadStable()}>

                    <RefreshCwIcon className="h-4 w-4" />

                    Recompute

                </Button>

            </div>



            {data?.my_match ? (

                <Card className="mb-5 border-emerald-100 bg-gradient-to-br from-brand-50 to-accent-50 p-5">

                    <div className="flex items-center gap-4">

                        <Avatar name={data.my_match.partner_name} size="lg" />

                        <div className="min-w-0 flex-1">

                            <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">

                                Your stable partner

                            </p>

                            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">

                                {data.my_match.partner_name}

                            </h3>

                            <p className="text-sm text-slate-500 dark:text-slate-500">

                                Compatibility {data.my_match.compatibility}%

                            </p>

                        </div>

                        <Badge variant="success" dot>Matched</Badge>

                    </div>

                </Card>

            ) : (

                <Card className="mb-5 p-5">

                    <EmptyState

                        compact

                        icon={<UsersRoundIcon className="h-6 w-6" />}

                        title="You're not currently matched"

                        description="You may be unmatched or without a completed profile."

                    />

                </Card>

            )}



            <div className="grid gap-5 lg:grid-cols-2">

                {/* Preference ranking */}

                <Card className="p-5">

                    <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">

                        Your preference ranking

                    </h2>

                    <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">

                        Order the candidates you'd most like to room with (best first).

                    </p>



                    {preferences.length === 0 ? (

                        <p className="rounded-lg bg-slate-50 dark:bg-slate-900 p-4 text-sm text-slate-500 dark:text-slate-500">

                            No preferences saved yet. Rank candidates from the People tab by adding them here.

                        </p>

                    ) : (

                        <div className="space-y-2">

                            {preferences.map((p, index) => (

                                <div

                                    key={p.user_id}

                                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3"

                                >

                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-500 dark:text-slate-500">

                                        {index + 1}

                                    </div>

                                    <Avatar name={p.name} size="md" />

                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">

                                        {p.name}

                                    </span>

                                    <div className="flex items-center gap-1">

                                        <button

                                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-700 disabled:opacity-30"

                                            disabled={index === 0}

                                            onClick={() => movePref(index, -1)}
                                            title="Move up"
                                            aria-label="Move up"

                                        >

                                            <ChevronUpIcon className="h-4 w-4" />

                                        </button>

                                        <button

                                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-700 disabled:opacity-30"

                                            disabled={index === preferences.length - 1}

                                            onClick={() => movePref(index, 1)}
                                            title="Move down"
                                            aria-label="Move down"

                                        >

                                            <ChevronDownIcon className="h-4 w-4" />

                                        </button>

                                        <button

                                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/20 dark:bg-rose-900/20 hover:text-rose-500 dark:text-rose-400"

                                            onClick={() => removePref(p.user_id)}

                                        >

                                            <XIcon className="h-4 w-4" />

                                        </button>

                                    </div>

                                </div>

                            ))}

                        </div>

                    )}



                    <Button

                        className="mt-4"

                        loading={savingPrefs}

                        onClick={savePrefs}

                    >

                        <CheckCircleIcon className="h-4 w-4" />

                        Save ranking

                    </Button>

                </Card>



                {/* Stable pairs */}

                <div className="space-y-5">

                    <Card className="p-5">

                        <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">

                            Stable pairs

                        </h2>

                        {!data?.pairs || data.pairs.length === 0 ? (

                            <p className="text-sm text-slate-400 dark:text-slate-500">

                                Not enough participants with profiles yet.

                            </p>

                        ) : (

                            <div className="space-y-2">

                                {data.pairs.map((pair, i) => (

                                    <div

                                        key={i}

                                        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3"

                                    >

                                        <Avatar name={pair.user_a_name} size="sm" />

                                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">

                                            {pair.user_a_name}

                                        </span>

                                        <span className="text-slate-300">+</span>

                                        <Avatar name={pair.user_b_name} size="sm" />

                                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">

                                            {pair.user_b_name}

                                        </span>

                                        <Badge variant="brand">{pair.compatibility}%</Badge>

                                    </div>

                                ))}

                            </div>

                        )}

                    </Card>



                    <Card className="p-5">

                        <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">

                            Blocking pairs

                        </h2>

                        {!data?.blocking_pairs || data.blocking_pairs.length === 0 ? (

                            <p className="text-sm text-slate-400 dark:text-slate-500">

                                No blocking pairs detected — the matching is stable.

                            </p>

                        ) : (

                            <div className="space-y-2">

                                {data.blocking_pairs.map((bp, i) => (

                                    <div

                                        key={i}

                                        className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3"

                                    >

                                        <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">

                                            <span>{bp.user_a_name}</span>
                                            <ArrowLeftRightIcon className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                            <span>{bp.user_b_name}</span>

                                        </p>

                                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-500">

                                            Both prefer each other over their current partners.

                                        </p>

                                    </div>

                                ))}

                            </div>

                        )}

                    </Card>

                </div>

            </div>

        </>

    );

}



function TeamUpPanel({ setPage }) {


    const [posts, setPosts] = useState([]);

    const [myPost, setMyPost] = useState(null);

    const [loading, setLoading] = useState(true);

    const [showForm, setShowForm] = useState(false);

    const [saving, setSaving] = useState(false);

    const [requestingId, setRequestingId] = useState(null);

    // user_id -> status of a request I sent them
    const [sentStatus, setSentStatus] = useState({});

    // user_id -> status of a request THEY sent me
    const [receivedStatus, setReceivedStatus] = useState({});

    const [form, setForm] = useState({

        headline: "",

        description: "",

        area: "",

        budget_min: "",

        budget_max: "",

    });

    const toast = useToast();



    const load = useCallback(async (showLoading = false) => {

        try {

            if (showLoading) setLoading(true);

            const [postsRes, mineRes, reqRes] = await Promise.all([

                api.get("/team-ups/"),

                api.get("/team-ups/mine"),

                api.get("/requests/").catch(() => null),

            ]);

            setPosts(postsRes.data.team_ups || []);

            setMyPost(mineRes.data.team_up || null);

            if (reqRes && reqRes.data) {
                const sent = {};
                (reqRes.data.sent_requests || []).forEach((r) => {
                    sent[r.user_id] = r.status;
                });
                const received = {};
                (reqRes.data.received_requests || []).forEach((r) => {
                    received[r.user_id] = r.status;
                });
                setSentStatus(sent);
                setReceivedStatus(received);
            }

        } catch (error) {

            console.error(error.response?.data);

            toast.error("Could not load team-up posts");

        } finally {

            setLoading(false);

        }

    }, [toast]);



    useEffect(() => {

        void (async () => {
            await load();
        })();

    }, [load]);



    const submit = async () => {

        const next = {};

        if (!form.headline.trim()) next.headline = "Headline is required";

        if (!form.description.trim()) next.description = "Description is required";

        if (!form.area.trim()) next.area = "Area is required";

        if (form.budget_min !== "" && Number(form.budget_min) < 0)

            next.budget_min = "Enter a valid budget";

        if (form.budget_max !== "" && Number(form.budget_max) < 0)

            next.budget_max = "Enter a valid budget";

        if (

            Object.keys(next).length > 0 ||

            form.budget_min !== "" &&

            form.budget_max !== "" &&

            Number(form.budget_max) < Number(form.budget_min)

        ) {

            if (!next.budget_max && form.budget_min !== "" && form.budget_max !== "" &&

                Number(form.budget_max) < Number(form.budget_min)) {

                next.budget_max = "Max must be ≥ min";

            }

            if (Object.keys(next).length > 0) {

                toast.error(Object.values(next)[0]);

                return;

            }

        }



        try {

            setSaving(true);

            await api.post("/team-ups/", {

                headline: form.headline.trim(),

                description: form.description.trim(),

                area: form.area.trim(),

                budget_min: form.budget_min === "" ? null : Number(form.budget_min),

                budget_max: form.budget_max === "" ? null : Number(form.budget_max),

            });

            toast.success("Team-up posted! Students can now find you.");

            setShowForm(false);

            setForm({ headline: "", description: "", area: "", budget_min: "", budget_max: "" });

            await load();

        } catch (error) {

            toast.error(errorMessage(error, "Could not post"));

        } finally {

            setSaving(false);

        }

    };



    const deleteMyPost = async () => {

        try {

            await api.delete(`/team-ups/${myPost.id}`);

            toast.success("Team-up post deleted");

            setMyPost(null);

            await load();

        } catch (error) {

            toast.error(errorMessage(error, "Could not delete post"));

        }

    };



    const sendRequest = async (post) => {

        try {

            setRequestingId(post.user_id);

            await api.post(`/requests/${post.user_id}`);

            setSentStatus((prev) => ({
                ...prev,
                [post.user_id]: "pending",
            }));

            toast.success(`Request sent to ${post.user_name}!`);
            window.dispatchEvent(new Event("coroomies:refresh-counts"));

        } catch (error) {

            toast.error(errorMessage(error, "Could not send request"));

        } finally {

            setRequestingId(null);

        }

    };





    if (loading) {

        return (

            <div className="flex justify-center py-16">

                <Spinner size="lg" />

            </div>

        );

    }



    return (

        <>

            <div className="mb-5 flex items-center justify-between">

                <div>

                    <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-500">

                        <UsersRoundIcon className="h-4 w-4 text-brand-500" />

                        Team up — no place yet? Post yourself

                    </p>

                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">

                        Share your budget and preferred area; people with a spot (or also teaming up) can reach out.

                    </p>

                </div>

                {!myPost && !showForm && (

                    <Button onClick={() => setShowForm(true)}>

                        <PlusIcon className="h-4 w-4" />

                        Post yourself

                    </Button>

                )}

            </div>



            {showForm && !myPost && (

                <Card className="mb-6 p-5">

                    <div className="mb-4 flex items-center justify-between">

                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">

                            Post yourself as a teammate

                        </h2>

                        <button

                            onClick={() => setShowForm(false)}

                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-700"

                            aria-label="Close"

                        >

                            <XIcon className="h-4 w-4" />

                        </button>

                    </div>

                    <div className="space-y-3">

                        <Input

                            label="Headline"

                            placeholder="e.g. Looking to team up for a 2BHK near work"

                            value={form.headline}

                            onChange={(e) => setForm({ ...form, headline: e.target.value })}

                        />

                        <Textarea

                            label="About you"

                            rows={3}

                            placeholder="Describe your lifestyle, study routine and what you're looking for..."

                            value={form.description}

                            onChange={(e) => setForm({ ...form, description: e.target.value })}

                        />

                        <Input

                            label="Preferred area(s)"

                            placeholder="e.g. Koramangala / Indiranagar, Bangalore"

                            value={form.area}

                            onChange={(e) => setForm({ ...form, area: e.target.value })}

                        />

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

                            <Input

                                label="Min budget (₹/mo)"

                                type="number"

                                min="0"

                                placeholder="8000"

                                value={form.budget_min}

                                onChange={(e) => setForm({ ...form, budget_min: e.target.value })}

                            />

                            <Input

                                label="Max budget (₹/mo)"

                                type="number"

                                min="0"

                                placeholder="15000"

                                value={form.budget_max}

                                onChange={(e) => setForm({ ...form, budget_max: e.target.value })}

                            />

                        </div>

                        <div className="flex gap-3">

                            <Button onClick={submit} loading={saving}>

                                Post

                            </Button>

                            <Button variant="secondary" onClick={() => setShowForm(false)}>

                                Cancel

                            </Button>

                        </div>

                    </div>

                </Card>

            )}



            {myPost && (

                <Card className="mb-6 border-brand-100 bg-gradient-to-br from-brand-50 to-violet-50 p-5">

                    <div className="flex items-start justify-between gap-3">

                        <div className="min-w-0">

                            <p className="text-xs font-medium uppercase tracking-wide text-brand-600 dark:text-brand-400">

                                Your team-up post

                            </p>

                            <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-slate-100">{myPost.headline}</h3>

                            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-500">

                                <MapPinIcon className="h-4 w-4" />

                                {myPost.area}

                                {myPost.budget_min !== null && (

                                    <span className="ml-1 text-slate-400 dark:text-slate-500">

                                        · {formatCurrency(myPost.budget_min)}

                                        {myPost.budget_max !== null

                                            ? `–${formatCurrency(myPost.budget_max)}`

                                            : "+"}

                                    </span>

                                )}

                            </p>

                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{myPost.description}</p>

                        </div>

                        <Button variant="dangerOutline" size="sm" onClick={deleteMyPost}>

                            <Trash2Icon className="h-3.5 w-3.5" />

                            Delete

                        </Button>

                    </div>

                </Card>

            )}



            {posts.length === 0 ? (

                <Card>

                    <EmptyState

                        icon={<UsersRoundIcon className="h-6 w-6" />}

                        title="No teammates yet"

                        description="Be the first to post yourself, or check back soon."

                    >

                        {!myPost && (

                            <Button onClick={() => setShowForm(true)}>

                                <PlusIcon className="h-4 w-4" />

                                Post yourself

                            </Button>

                        )}

                    </EmptyState>

                </Card>

            ) : (

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

                    {posts.map((post) => (

                        <Card key={post.id} className="flex flex-col p-5">

                            <div className="flex items-start justify-between gap-3">

                                <Avatar name={post.user_name} size="md" />

                                <div className="text-right">

                                    {post.compatibility !== null && (

                                        <Badge variant="brand" dot>

                                            {post.compatibility}% fit

                                        </Badge>

                                    )}

                                </div>

                            </div>

                            <h3 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">

                                {post.headline}

                            </h3>

                            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-500">

                                <MapPinIcon className="h-4 w-4 shrink-0" />

                                <span className="truncate">{post.area}</span>

                            </p>

                            <p className="mt-2 line-clamp-2 text-sm text-slate-400 dark:text-slate-500">

                                {post.description}

                            </p>

                            {post.budget_min !== null && (

                                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">

                                    <WalletIcon className="h-3.5 w-3.5" />

                                    {formatCurrency(post.budget_min)}

                                    {post.budget_max !== null

                                        ? `–${formatCurrency(post.budget_max)}`

                                        : "+"}

                                    {" "}/mo budget

                                </p>

                            )}

                            <div className="mt-4 flex gap-2 border-t border-slate-100 dark:border-slate-700 pt-4">

                                {(sentStatus[post.user_id] === "accepted" || receivedStatus[post.user_id] === "accepted") ? (

                                    <Button
                                        size="sm"
                                        variant="success"
                                        onClick={() => {
                                            localStorage.setItem("chat_peer", String(post.user_id));
                                            setPage("chat");
                                        }}
                                    >
                                        <MessageCircleIcon className="h-3.5 w-3.5" />
                                        Message
                                    </Button>

                                ) : sentStatus[post.user_id] === "pending" ? (

                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        className="flex-1"
                                        disabled
                                    >
                                        <ClockIcon className="h-3.5 w-3.5" />
                                        Pending
                                    </Button>

                                ) : (
                                    <Button

                                        size="sm"

                                        className="flex-1"

                                        loading={requestingId === post.user_id}

                                        onClick={() => sendRequest(post)}

                                    >

                                        <UserRoundPlusIcon className="h-3.5 w-3.5" />

                                        Connect

                                    </Button>

                                )}

                            </div>

                        </Card>

                    ))}

                </div>

            )}

        </>

    );

}



function Matches({ setPage }) {
    const [tab, setTab] = useState(() => {
        const stored = localStorage.getItem("matches_tab");
        const sub = localStorage.getItem("requests_subtab");
        if (stored) {
            localStorage.removeItem("matches_tab");
            if (stored === "requests") {
                if (sub === "sent") {
                    localStorage.removeItem("requests_subtab");
                    return "sent";
                }
                localStorage.removeItem("requests_subtab");
                return "received";
            }
            return stored;
        }
        return "candidates";
    });

    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        let active = true;
        api.get("/requests/")
            .then((res) => {
                if (active) {
                    setPendingCount(res.data?.pending_count || 0);
                }
            })
            .catch(() => null);

        const onRefresh = () => {
            api.get("/requests/")
                .then((res) => {
                    if (active) {
                        setPendingCount(res.data?.pending_count || 0);
                    }
                })
                .catch(() => null);
        };
        window.addEventListener("coroomies:refresh-counts", onRefresh);
        return () => {
            active = false;
            window.removeEventListener("coroomies:refresh-counts", onRefresh);
        };
    }, []);

    return (
        <div className="w-full max-w-5xl mx-auto">
            <PageHeader
                title="Find Flatmates"
                subtitle="Discover compatible roommates based on lifestyle habits, budget, preferences, and mutual connection requests."
            />

            {/* Flatmate discovery tabs */}
            <div className="mb-6 flex gap-1.5 overflow-x-auto no-scrollbar touch-scroll scroll-smooth rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 shadow-sm">
                <button
                    className={`shrink-0 sm:flex-1 whitespace-nowrap rounded-lg px-3 py-2 min-h-[42px] text-xs font-medium transition-colors sm:px-3.5 sm:text-sm ${
                        tab === "candidates"
                            ? "bg-gradient-to-r from-brand-600 to-violet-500 text-white shadow-sm"
                            : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900"
                    }`}
                    onClick={() => setTab("candidates")}
                >
                    <UsersRoundIcon className="mr-1.5 inline h-4 w-4" />
                    Discover Flatmates
                </button>
                <button
                    className={`shrink-0 sm:flex-1 whitespace-nowrap rounded-lg px-3 py-2 min-h-[42px] text-xs font-medium transition-colors sm:px-3.5 sm:text-sm ${
                        tab === "stable"
                            ? "bg-gradient-to-r from-brand-600 to-violet-500 text-white shadow-sm"
                            : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900"
                    }`}
                    onClick={() => setTab("stable")}
                >
                    <SparklesIcon className="mr-1.5 inline h-4 w-4" />
                    Best Matches
                </button>
                <button
                    className={`shrink-0 sm:flex-1 whitespace-nowrap rounded-lg px-3 py-2 min-h-[42px] text-xs font-medium transition-colors sm:px-3.5 sm:text-sm ${
                        tab === "received"
                            ? "bg-gradient-to-r from-brand-600 to-violet-500 text-white shadow-sm"
                            : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900"
                    }`}
                    onClick={() => setTab("received")}
                >
                    <UserRoundPlusIcon className="mr-1.5 inline h-4 w-4" />
                    Received Requests
                    {pendingCount > 0 && (
                        <span
                            className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                tab === "received"
                                    ? "bg-white/25 text-white"
                                    : "bg-rose-500 text-white"
                            }`}
                        >
                            {pendingCount}
                        </span>
                    )}
                </button>
                <button
                    className={`shrink-0 sm:flex-1 whitespace-nowrap rounded-lg px-3 py-2 min-h-[42px] text-xs font-medium transition-colors sm:px-3.5 sm:text-sm ${
                        tab === "sent"
                            ? "bg-gradient-to-r from-brand-600 to-violet-500 text-white shadow-sm"
                            : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900"
                    }`}
                    onClick={() => setTab("sent")}
                >
                    <ClockIcon className="mr-1.5 inline h-4 w-4" />
                    Sent Requests
                </button>
                <button
                    className={`shrink-0 sm:flex-1 whitespace-nowrap rounded-lg px-3 py-2 min-h-[42px] text-xs font-medium transition-colors sm:px-3.5 sm:text-sm ${
                        tab === "teamup"
                            ? "bg-gradient-to-r from-brand-600 to-violet-500 text-white shadow-sm"
                            : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900"
                    }`}
                    onClick={() => setTab("teamup")}
                >
                    <UsersIcon className="mr-1.5 inline h-4 w-4" />
                    Team Up
                </button>
            </div>

            {tab === "candidates" && (
                <CandidatesPanel setPage={setPage} onOpenRequests={() => setTab("received")} />
            )}
            {tab === "stable" && <StableMatchPanel />}
            {(tab === "received" || tab === "sent" || tab === "requests") && (
                <RequestsPanel
                    setPage={setPage}
                    activeSubtab={tab === "sent" ? "sent" : "received"}
                    onSubtabChange={(newSubtab) => setTab(newSubtab)}
                />
            )}
            {tab === "teamup" && <TeamUpPanel setPage={setPage} />}
        </div>
    );
}

export default Matches;


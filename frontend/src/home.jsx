import { useEffect, useState } from "react";
import api from "./api";
import Card from "./components/ui/Card";
import Avatar from "./components/ui/Avatar";
import Button from "./components/ui/Button";
import EmptyState from "./components/ui/EmptyState";
import StatCard from "./components/ui/StatCard";
import { useToast } from "./components/Toast";
import {
  UsersRoundIcon,
  UserRoundPlusIcon,
  HouseIcon,
  MessageCircleIcon,
  ReceiptIndianRupeeIcon,
  SparklesIcon,
  ArrowRightIcon,
  CopyIcon,
  CheckIcon,
  GraduationCapIcon,
  InfoIcon,
} from "./components/Icons";
import { formatCurrency, formatRelativeTime, greeting, errorMessage } from "./utils/format";
import { compatibilityColor } from "./utils/compatibility";

function Skeleton({ className = "" }) {
  return <div className={`skeleton rounded-xl ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, action, onAction }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-brand-600 dark:text-brand-400">{icon}</span>
        <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
      </div>
      {action && (
        <button
          onClick={onAction}
          className="flex items-center gap-1 text-xs sm:text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
        >
          {action}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function Home({ setPage }) {
    const [data, setData] = useState({
        matches: [],
        profileIncomplete: false,
        completionPercentage: 100,
        missingFields: [],
        requests: null,
        monthlyTotal: 0,
        conversations: [],
        notifications: [],
        groups: [],
    });
    const [loading, setLoading] = useState(true);
    const [actingId, setActingId] = useState(null);
    const [connectingId, setConnectingId] = useState(null);
    const [copiedCode, setCopiedCode] = useState(false);
    const toast = useToast();

    useEffect(() => {
        let active = true;

        const loadData = async () => {
            const [matchRes, requestRes, expenseRes, chatRes, notifRes, groupRes] =
                await Promise.allSettled([
                    api.get("/matches/"),
                    api.get("/requests/"),
                    api.get("/expenses/monthly-total"),
                    api.get("/messages/"),
                    api.get("/notifications/"),
                    api.get("/groups/"),
                ]);

            if (!active) return;

            const ok = (r, pick) => (r.status === "fulfilled" ? pick(r.value.data) : null);
            const matchData = matchRes.status === "fulfilled" ? matchRes.value.data : null;

            setData({
                matches: matchData?.matches || [],
                profileIncomplete: Boolean(matchData?.profile_incomplete),
                completionPercentage: matchData?.completion_percentage ?? 100,
                missingFields: matchData?.missing_fields || [],
                requests: ok(requestRes, (d) => d) || null,
                monthlyTotal: ok(expenseRes, (d) => d.monthly_total) || 0,
                conversations: ok(chatRes, (d) => d.conversations) || [],
                notifications: ok(notifRes, (d) => d.notifications) || [],
                groups: ok(groupRes, (d) => d.groups) || [],
            });

            setLoading(false);
        };

        void loadData();

        const handleProfileUpdated = () => {
            void loadData();
        };
        window.addEventListener("coroomies:profile-updated", handleProfileUpdated);

        return () => {
            active = false;
            window.removeEventListener("coroomies:profile-updated", handleProfileUpdated);
        };
    }, []);

    const refreshRequests = async () => {
        try {
            const res = await api.get("/requests/");
            setData((d) => ({ ...d, requests: res.data || null }));
        } catch (error) {
            console.error(error);
        }
    };

    const handleConnect = async (target) => {
        if (!target?.user_id) return;
        setConnectingId(target.user_id);
        try {
            await api.post(`/requests/${target.user_id}`);
            toast.success(`Roommate request sent to ${target.name}!`);
            await refreshRequests();
        } catch (error) {
            toast.error(errorMessage(error, "Could not send connection request"));
        } finally {
            setConnectingId(null);
        }
    };

    const respondToRequest = async (requestId, action) => {
        setActingId(requestId);
        try {
            await api.put(`/requests/${requestId}/${action}`);
            toast.success(
                action === "accept"
                    ? "Roommate request accepted!"
                    : "Roommate request declined"
            );
            await refreshRequests();
        } catch (error) {
            toast.error(
                errorMessage(
                    error,
                    action === "accept"
                        ? "Could not accept request"
                        : "Could not decline request"
                )
            );
        } finally {
            setActingId(null);
        }
    };

    const userName = localStorage.getItem("user_name") || "";
    const firstName = userName.split(" ")[0] || "Roommate";

    const topMatches = (data.matches || []).slice(0, 3);
    const pendingCount = data.requests?.pending_count || 0;
    const pendingRequests = (data.requests?.received_requests || []).filter(
        (r) => r.status === "pending"
    );
    const sentRequests = data.requests?.sent_requests || [];
    const receivedRequests = data.requests?.received_requests || [];

    const getMatchState = (targetUserId) => {
        const isConnected =
            sentRequests.some((r) => r.user_id === targetUserId && r.status === "accepted") ||
            receivedRequests.some((r) => r.user_id === targetUserId && r.status === "accepted");
        if (isConnected) return "connected";

        const isSent = sentRequests.some((r) => r.user_id === targetUserId && r.status === "pending");
        if (isSent) return "sent";

        const isReceived = receivedRequests.some((r) => r.user_id === targetUserId && r.status === "pending");
        if (isReceived) return "received";

        return "none";
    };

    const livingGroup =
        (data.groups || []).find((g) => g.status === "active") || (data.groups || [])[0] || null;
    const unreadMessages = (data.conversations || []).reduce(
        (sum, conv) => sum + (conv.unread_count || 0),
        0
    );

    if (loading) {
        return <LoadingSkeleton />;
    }

    return (
        <div className="space-y-6">
            {/* Consumer Hero Header */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                                <SparklesIcon className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                                {greeting()}
                            </span>
                            {!data.profileIncomplete ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    Match ready
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                    Profile {data.completionPercentage}% complete
                                </span>
                            )}
                        </div>
                        <h1 className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                            Welcome back, {firstName}
                        </h1>
                        <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                            Discover compatible flatmates, manage shared living, and track expenses.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <Button
                            variant="primary"
                            onClick={() => {
                                localStorage.setItem("matches_tab", "candidates");
                                setPage("matches");
                            }}
                            className="text-xs sm:text-sm"
                        >
                            <UsersRoundIcon className="h-4 w-4" />
                            <span>Find Flatmates</span>
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => setPage("groups")}
                            className="text-xs sm:text-sm"
                        >
                            <HouseIcon className="h-4 w-4" />
                            <span>Living Groups</span>
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => setPage("expenses")}
                            className="text-xs sm:text-sm"
                        >
                            <ReceiptIndianRupeeIcon className="h-4 w-4" />
                            <span>Expenses</span>
                        </Button>
                    </div>
                </div>

                {/* Compact Profile Incomplete Guidance */}
                {data.profileIncomplete && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                            <InfoIcon className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <div className="text-xs">
                                <span className="font-semibold text-slate-900 dark:text-slate-100">
                                    Complete your profile details to unlock AI flatmate matching.
                                </span>
                                {data.missingFields.length > 0 && (
                                    <span className="text-slate-500 dark:text-slate-400 ml-1">
                                        Missing: {data.missingFields.slice(0, 3).join(", ")}
                                        {data.missingFields.length > 3 && ` +${data.missingFields.length - 3} more`}
                                    </span>
                                )}
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setPage("profile")}
                            className="shrink-0 self-start sm:self-auto text-xs"
                        >
                            Complete Profile
                            <ArrowRightIcon className="h-3 w-3" />
                        </Button>
                    </div>
                )}
            </div>

            {/* 4 Stat Overview Cards */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <StatCard
                    label="Flatmates"
                    value={data.matches.length}
                    icon={<UsersRoundIcon className="h-4.5 w-4.5" />}
                    accent={data.profileIncomplete ? "amber" : "brand"}
                    hint={
                        data.profileIncomplete
                            ? `${data.completionPercentage}% profile completed`
                            : data.matches.length === 1
                            ? "1 compatible match"
                            : `${data.matches.length} compatible matches`
                    }
                    title="View compatible flatmates"
                    onClick={() => {
                        if (data.profileIncomplete) {
                            setPage("profile");
                        } else {
                            localStorage.setItem("matches_tab", "candidates");
                            setPage("matches");
                        }
                    }}
                />
                <StatCard
                    label="Pending requests"
                    value={pendingCount}
                    icon={<UserRoundPlusIcon className="h-4.5 w-4.5" />}
                    accent="accent"
                    hint={
                        pendingCount === 1
                            ? "1 awaiting response"
                            : pendingCount > 1
                            ? `${pendingCount} awaiting response`
                            : "No pending requests"
                    }
                    title="Review incoming roommate requests"
                    onClick={() => {
                        localStorage.setItem("matches_tab", "received");
                        setPage("matches");
                    }}
                />
                <StatCard
                    label="Spent this month"
                    value={formatCurrency(data.monthlyTotal)}
                    icon={<ReceiptIndianRupeeIcon className="h-4.5 w-4.5" />}
                    accent="amber"
                    hint="Personal expenses"
                    title="Track personal expenses and monthly budget"
                    onClick={() => setPage("expenses")}
                />
                <StatCard
                    label="Unread chats"
                    value={unreadMessages}
                    icon={<MessageCircleIcon className="h-4.5 w-4.5" />}
                    accent="violet"
                    hint={
                        unreadMessages === 1
                            ? "1 unread message"
                            : unreadMessages > 1
                            ? `${unreadMessages} unread messages`
                            : "All caught up"
                    }
                    title="Open chat messages"
                    onClick={() => setPage("chat")}
                />
            </div>

            {/* Top Roommate Recommendations (Hinge / Airbnb Style Discovery Cards) */}
            <div>
                <SectionHeader
                    icon={<SparklesIcon className="h-4.5 w-4.5" />}
                    title="Top Compatible Flatmates"
                    action="Explore all matches"
                    onAction={() => {
                        localStorage.setItem("matches_tab", "candidates");
                        setPage("matches");
                    }}
                />

                {topMatches.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {topMatches.map((match) => {
                            const state = getMatchState(match.user_id);
                            const matchedTraits = Array.isArray(match.reasons)
                                ? match.reasons
                                      .filter((r) => r && r.match === true)
                                      .map((r) => r.label || r.field)
                                      .filter(Boolean)
                                : [];

                            return (
                                <Card
                                    key={match.user_id}
                                    hoverable
                                    className="p-5 flex flex-col justify-between transition-all"
                                >
                                    <div>
                                        {/* Card Header: Avatar, Name, Compatibility */}
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <Avatar
                                                    name={match.name}
                                                    src={match.avatar_url}
                                                    size="lg"
                                                    className="shrink-0"
                                                />
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                                                            {match.name}
                                                        </h3>
                                                        {match.age && (
                                                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                                                · {match.age}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                        {match.location || "Location not set"}
                                                    </p>
                                                </div>
                                            </div>

                                            <span
                                                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold text-white shrink-0 shadow-2xs"
                                                style={{ background: compatibilityColor(match.compatibility) }}
                                            >
                                                {match.compatibility}%
                                            </span>
                                        </div>

                                        {/* Academic / Career Info */}
                                        {(match.occupation || match.degree || match.college) && (
                                            <div className="mb-3 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                                                <GraduationCapIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                                <span className="truncate">
                                                    {[match.occupation, match.degree, match.college]
                                                        .filter(Boolean)
                                                        .join(" · ")}
                                                </span>
                                            </div>
                                        )}

                                        {/* Budget Info */}
                                        {(match.budget_min !== null || match.budget_max !== null) && (
                                            <div className="mb-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                <span>Budget: </span>
                                                <span className="text-emerald-600 dark:text-emerald-400">
                                                    {match.budget_min && match.budget_max
                                                        ? `₹${match.budget_min.toLocaleString()} – ₹${match.budget_max.toLocaleString()}`
                                                        : match.budget_min
                                                        ? `From ₹${match.budget_min.toLocaleString()}`
                                                        : `Up to ₹${match.budget_max.toLocaleString()}`}
                                                </span>
                                                <span className="text-slate-400 dark:text-slate-500 font-normal"> /mo</span>
                                            </div>
                                        )}

                                        {/* Matched Lifestyle Traits */}
                                        {matchedTraits.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mb-4">
                                                {matchedTraits.slice(0, 3).map((trait, idx) => (
                                                    <span
                                                        key={idx}
                                                        className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                                    >
                                                        <CheckIcon className="h-2.5 w-2.5 text-brand-600 dark:text-brand-400 shrink-0" />
                                                        <span>{trait}</span>
                                                    </span>
                                                ))}
                                                {matchedTraits.length > 3 && (
                                                    <span className="text-[11px] text-slate-400 dark:text-slate-500 self-center">
                                                        +{matchedTraits.length - 3}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Action button */}
                                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                                        {state === "connected" ? (
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                fullWidth
                                                onClick={() => {
                                                    localStorage.setItem("chat_peer", String(match.user_id));
                                                    setPage("chat");
                                                }}
                                            >
                                                <MessageCircleIcon className="h-3.5 w-3.5" />
                                                <span>Message</span>
                                            </Button>
                                        ) : state === "sent" ? (
                                            <Button size="sm" variant="secondary" fullWidth disabled>
                                                <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                                                <span>Request sent</span>
                                            </Button>
                                        ) : state === "received" ? (
                                            <Button
                                                size="sm"
                                                variant="primary"
                                                fullWidth
                                                onClick={() => {
                                                    localStorage.setItem("matches_tab", "received");
                                                    setPage("matches");
                                                }}
                                            >
                                                <span>Respond to request</span>
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="primary"
                                                fullWidth
                                                loading={connectingId === match.user_id}
                                                onClick={() => handleConnect(match)}
                                            >
                                                <UserRoundPlusIcon className="h-3.5 w-3.5" />
                                                <span>Connect</span>
                                            </Button>
                                        )}
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                ) : (
                    <Card className="p-8 text-center">
                        <EmptyState
                            compact
                            icon={<UsersRoundIcon className="h-7 w-7 text-brand-500" />}
                            title={data.profileIncomplete ? "Unlock compatible flatmate matches" : "No matches right now"}
                            description={
                                data.profileIncomplete
                                    ? "Complete your lifestyle, budget, and roommate preferences to see mutual compatibility scores."
                                    : "Check back soon as more flatmates join your area and criteria."
                            }
                        >
                            <Button
                                variant="primary"
                                onClick={() => setPage(data.profileIncomplete ? "profile" : "matches")}
                            >
                                {data.profileIncomplete ? "Complete My Profile" : "Find Flatmates"}
                            </Button>
                        </EmptyState>
                    </Card>
                )}
            </div>

            {/* Bottom 2-Column Grid: Living Groups + Messages & Requests */}
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                {/* Left: Living Group Snapshot */}
                <Card className="p-5 sm:p-6">
                    <SectionHeader
                        icon={<HouseIcon className="h-4.5 w-4.5" />}
                        title={data.groups.length > 1 ? `Living Groups (${data.groups.length})` : "Living Group"}
                        action={data.groups.length > 0 ? "Manage" : undefined}
                        onAction={() => setPage("groups")}
                    />

                    {livingGroup ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3.5">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                                    <HouseIcon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                                        {livingGroup.name}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {livingGroup.member_count} {livingGroup.member_count === 1 ? "member" : "members"}
                                        {livingGroup.open_slots > 0 && ` · ${livingGroup.open_slots} open spot(s)`}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                        localStorage.setItem("groups_id", String(livingGroup.group_id));
                                        setPage("groups");
                                    }}
                                >
                                    Open
                                </Button>
                            </div>

                            {livingGroup.invite_code && (
                                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                            Group Invite Code
                                        </p>
                                        <p className="font-mono text-sm font-bold tracking-wider text-brand-700 dark:text-brand-300">
                                            {livingGroup.invite_code}
                                        </p>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                            const copy = navigator.clipboard?.writeText(livingGroup.invite_code);
                                            if (!copy) return;
                                            copy.then(() => {
                                                setCopiedCode(true);
                                                toast.success("Invite code copied!");
                                                setTimeout(() => setCopiedCode(false), 2000);
                                            }).catch(() => {});
                                        }}
                                    >
                                        {copiedCode ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                                        <span>{copiedCode ? "Copied" : "Copy"}</span>
                                    </Button>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-2 pt-2">
                                <button
                                    onClick={() => setPage("household")}
                                    className="flex items-center gap-2 rounded-xl border border-slate-200/70 p-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/60 transition-colors"
                                >
                                    <CheckIcon className="h-4 w-4 text-emerald-500 shrink-0" />
                                    <span>Household Chores</span>
                                </button>
                                <button
                                    onClick={() => setPage("household")}
                                    className="flex items-center gap-2 rounded-xl border border-slate-200/70 p-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/60 transition-colors"
                                >
                                    <SparklesIcon className="h-4 w-4 text-violet-500 shrink-0" />
                                    <span>Flat Rules</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                                You haven't joined a living group yet. Create or join one to manage shared flat expenses and chores.
                            </p>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setPage("groups")}
                            >
                                <HouseIcon className="h-3.5 w-3.5" />
                                <span>Create or Join Group</span>
                            </Button>
                        </div>
                    )}
                </Card>

                {/* Right: Messages & Pending Requests */}
                <div className="space-y-4">
                    {/* Pending Requests if any */}
                    {pendingRequests.length > 0 && (
                        <Card className="p-5">
                            <SectionHeader
                                icon={<UserRoundPlusIcon className="h-4.5 w-4.5 text-brand-600 dark:text-brand-400" />}
                                title={`Roommate Requests (${pendingRequests.length})`}
                                action="View all"
                                onAction={() => {
                                    localStorage.setItem("matches_tab", "received");
                                    setPage("matches");
                                }}
                            />
                            <div className="space-y-2">
                                {pendingRequests.slice(0, 2).map((req) => (
                                    <div
                                        key={req.request_id}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 p-3 dark:border-slate-800"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <Avatar name={req.user_name} size="sm" />
                                            <div className="min-w-0">
                                                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                                                    {req.user_name}
                                                </p>
                                                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                                                    Sent you a flatmate request
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5 shrink-0">
                                            <Button
                                                size="sm"
                                                variant="primary"
                                                loading={actingId === req.request_id}
                                                onClick={() => respondToRequest(req.request_id, "accept")}
                                                className="px-2.5 py-1 text-xs"
                                            >
                                                Accept
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                disabled={actingId === req.request_id}
                                                onClick={() => respondToRequest(req.request_id, "reject")}
                                                className="px-2 py-1 text-xs"
                                            >
                                                Decline
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Recent Conversations */}
                    <Card className="p-5">
                        <SectionHeader
                            icon={<MessageCircleIcon className="h-4.5 w-4.5" />}
                            title="Recent Messages"
                            action="All chats"
                            onAction={() => setPage("chat")}
                        />
                        {data.conversations.length > 0 ? (
                            <div className="space-y-1.5">
                                {data.conversations.slice(0, 3).map((conv) => (
                                    <button
                                        key={conv.user_id}
                                        onClick={() => {
                                            localStorage.setItem("chat_peer", String(conv.user_id));
                                            setPage("chat");
                                        }}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                    >
                                        <Avatar name={conv.name} size="sm" className="shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-1">
                                                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                                                    {conv.name}
                                                </p>
                                                {conv.last_message_at && (
                                                    <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                                                        {formatRelativeTime(conv.last_message_at)}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                {conv.last_message || "Say hello!"}
                                            </p>
                                        </div>
                                        {conv.unread_count > 0 && (
                                            <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                                                {conv.unread_count}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center">
                                No messages yet. Connect with a flatmate to start chatting.
                            </p>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default Home;

import { useEffect, useState } from "react";
import api from "./api";
import Card from "./components/ui/Card";
import Avatar from "./components/ui/Avatar";
import Button from "./components/ui/Button";
import Badge from "./components/ui/Badge";
import EmptyState from "./components/ui/EmptyState";
import StatCard from "./components/ui/StatCard";
import { useToast } from "./components/Toast";
import {
  UsersRoundIcon,
  UserRoundPlusIcon,
  HouseIcon,
  MessageCircleIcon,
  ReceiptIndianRupeeIcon,
  BellIcon,
  SparklesIcon,
  ArrowRightIcon,
  CopyIcon,
  CheckIcon,
  CloseIcon,
  ChevronRightIcon,
  GraduationCapIcon,
} from "./components/Icons";
import { formatCurrency, formatRelativeTime, greeting, errorMessage } from "./utils/format";
import { compatibilityColor } from "./utils/compatibility";

function Skeleton({ className = "" }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, action, onAction }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-brand-500">{icon}</span>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
      </div>
      {action && (
        <button
          onClick={onAction}
          className="flex items-center gap-1 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
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
        requests: null,
        monthlyTotal: 0,
        conversations: [],
        notifications: [],
        groups: [],
    });
    const [loading, setLoading] = useState(true);
    const [actingId, setActingId] = useState(null);
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

            setData({
                matches: ok(matchRes, (d) => d.matches) || [],
                requests: ok(requestRes, (d) => d) || null,
                monthlyTotal: ok(expenseRes, (d) => d.monthly_total) || 0,
                conversations: ok(chatRes, (d) => d.conversations) || [],
                notifications: ok(notifRes, (d) => d.notifications) || [],
                groups: ok(groupRes, (d) => d.groups) || [],
            });

            const failed = [matchRes, requestRes, expenseRes, chatRes, notifRes, groupRes].find(
                (r) => r.status === "rejected"
            );
            if (failed) {
                console.error("Some dashboard data failed to load:", failed.reason);
                toast.error("Some data couldn't load. Showing what we have.");
            }
            setLoading(false);
        };

        loadData();

        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const [connecting, setConnecting] = useState(false);

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
        setConnecting(true);
        try {
            await api.post(`/requests/${target.user_id}`);
            toast.success(`Roommate request sent to ${target.name}!`);
            await refreshRequests();
        } catch (error) {
            toast.error(errorMessage(error, "Could not send connection request"));
        } finally {
            setConnecting(false);
        }
    };

    const respondToRequest = async (requestId, action) => {
        setActingId(requestId);
        try {
            await api.put(`/requests/${requestId}/${action}`);
            toast.success(
                action === "accept"
                    ? "Roommate request accepted!"
                    : "Roommate request rejected"
            );
            await refreshRequests();
        } catch (error) {
            toast.error(
                errorMessage(
                    error,
                    action === "accept"
                        ? "Could not accept request"
                        : "Could not reject request"
                )
            );
        } finally {
            setActingId(null);
        }
    };

    const userName = localStorage.getItem("user_name") || "";
    const firstName = userName.split(" ")[0] || "Roommate";

    const bestMatch = data.matches[0] || null;
    const matchedReasons = Array.isArray(bestMatch?.reasons)
        ? bestMatch.reasons
              .filter((r) => r && (r.match === true || typeof r === "string"))
              .map((r) => (typeof r === "string" ? r : (r.label || r.field || "")))
              .filter(Boolean)
        : [];
    const pendingCount = data.requests?.pending_count || 0;
    const pendingRequests = (data.requests?.received_requests || []).filter(
        (r) => r.status === "pending"
    );
    const sentToBestMatch = (data.requests?.sent_requests || []).find(
        (r) => r.user_id === bestMatch?.user_id && r.status === "pending"
    );
    const receivedFromBestMatch = (data.requests?.received_requests || []).find(
        (r) => r.user_id === bestMatch?.user_id && r.status === "pending"
    );
    const isConnectedWithBestMatch =
        (data.requests?.sent_requests || []).some(
            (r) => r.user_id === bestMatch?.user_id && r.status === "accepted"
        ) ||
        (data.requests?.received_requests || []).some(
            (r) => r.user_id === bestMatch?.user_id && r.status === "accepted"
        );
    const livingGroup =
        (data.groups || []).find((g) => g.status === "active") || (data.groups || [])[0] || null;
    const unreadMessages = (data.conversations || []).reduce(
        (sum, conv) => sum + (conv.unread_count || 0),
        0
    );
    const unreadNotifications = (data.notifications || []).filter(
        (n) => !n.is_read
    ).length;

    if (loading) {
        return <LoadingSkeleton />;
    }

    return (
        <div className="space-y-6">
            {/* Welcome banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-violet-600 p-4 sm:p-5 lg:p-6 text-white shadow-glow">
                <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10 blur-xl" />
                <div className="pointer-events-none absolute -bottom-16 right-20 h-40 w-40 rounded-full bg-accent-400/20 blur-xl" />

                <div className="relative z-10 flex flex-col justify-between gap-4 sm:gap-5">
                    <div>
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white/95 backdrop-blur-sm">
                            <SparklesIcon className="h-3.5 w-3.5 text-brand-200" />
                            <span>{greeting()}</span>
                        </div>
                        <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-white">
                            Welcome back, {firstName}
                        </h1>
                        <p className="mt-1 max-w-xl text-xs sm:text-sm text-brand-100/90 leading-relaxed">
                            Here's what's happening with your flatmates, living groups, and expenses today.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5">
                        {/* Primary action */}
                        <Button
                            variant="secondary"
                            onClick={() => {
                                localStorage.setItem("matches_tab", "candidates");
                                setPage("matches");
                            }}
                            className="bg-white text-brand-700 hover:bg-brand-50 border-white/40 shadow-sm font-semibold min-h-[42px] px-3.5 py-2 text-xs sm:text-sm"
                        >
                            <UsersRoundIcon className="h-4 w-4 text-brand-600 shrink-0" />
                            <span className="truncate">Find flatmates</span>
                        </Button>

                        {/* Secondary action 1 */}
                        <button
                            type="button"
                            onClick={() => setPage("groups")}
                            className="inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg border border-white/25 bg-white/10 px-3.5 py-2 min-h-[42px] text-xs sm:text-sm font-medium text-white backdrop-blur-sm transition-all duration-150 hover:bg-white/20 hover:border-white/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                            <HouseIcon className="h-4 w-4 text-brand-200 shrink-0" />
                            <span className="truncate">Living groups</span>
                        </button>

                        {/* Secondary action 2 */}
                        <button
                            type="button"
                            onClick={() => setPage("expenses")}
                            className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg border border-white/25 bg-white/10 px-3.5 py-2 min-h-[42px] text-xs sm:text-sm font-medium text-white backdrop-blur-sm transition-all duration-150 hover:bg-white/20 hover:border-white/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        >
                            <ReceiptIndianRupeeIcon className="h-4 w-4 text-brand-200 shrink-0" />
                            <span className="truncate">Add expense</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <StatCard
                    label="Flatmates"
                    value={data.matches.length}
                    icon={<UsersRoundIcon className="h-4.5 w-4.5" />}
                    accent="brand"
                    hint={
                        data.matches.length === 1
                            ? "1 compatible match"
                            : `${data.matches.length} compatible matches`
                    }
                    title="View compatible flatmates"
                    onClick={() => {
                        localStorage.setItem("matches_tab", "candidates");
                        setPage("matches");
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

            {/* Main grid */}
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
                {/* Left column */}
                <div className="space-y-4 sm:space-y-6 lg:col-span-2 min-w-0">
                    {/* Best match */}
                    <Card className="p-4 sm:p-6 overflow-hidden">
                        <SectionHeader
                            icon={<SparklesIcon className="h-4.5 w-4.5 text-brand-500" />}
                            title="Best match"
                            action="View all"
                            onAction={() => {
                                localStorage.setItem("matches_tab", "candidates");
                                setPage("matches");
                            }}
                        />

                        {bestMatch ? (
                            <div className="space-y-3.5 sm:space-y-4 min-w-0">
                                {/* Header: Avatar, Name, Match Badge, Academic Info */}
                                <div className="flex items-start gap-3 min-w-0">
                                    <Avatar name={bestMatch.name} size="lg" className="rounded-full shrink-0" />

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <h3 className="truncate text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                                                {bestMatch.name}
                                            </h3>
                                            <span
                                                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold text-white shrink-0 shadow-xs"
                                                style={{
                                                    background: compatibilityColor(
                                                        bestMatch.compatibility
                                                    ),
                                                }}
                                            >
                                                {bestMatch.compatibility}% match
                                            </span>
                                        </div>

                                        {(bestMatch.college || bestMatch.degree) ? (
                                            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                                <GraduationCapIcon className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                                                <span className="truncate">
                                                    {[bestMatch.degree, bestMatch.college]
                                                        .filter(Boolean)
                                                        .join(" · ")}
                                                </span>
                                            </div>
                                        ) : (
                                            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                                                Flatmate candidate
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Compatibility Progress Bar */}
                                <div className="w-full space-y-1">
                                    <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                                        <span>Compatibility</span>
                                        <span style={{ color: compatibilityColor(bestMatch.compatibility) }}>
                                            {bestMatch.compatibility}%
                                        </span>
                                    </div>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{
                                                width: `${bestMatch.compatibility}%`,
                                                background: compatibilityColor(
                                                    bestMatch.compatibility
                                                ),
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Matched traits pills */}
                                {matchedReasons.length > 0 && (
                                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                                            Matching lifestyle & preferences
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {matchedReasons.slice(0, 4).map((label, idx) => (
                                                <span
                                                    key={idx}
                                                    className="inline-flex items-center gap-1 rounded-md bg-white dark:bg-slate-700/80 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-600/80"
                                                >
                                                    <CheckIcon className="h-3 w-3 text-brand-500 shrink-0" />
                                                    <span>{label}</span>
                                                </span>
                                            ))}
                                            {matchedReasons.length > 4 && (
                                                <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                                                    +{matchedReasons.length - 4} more
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Action buttons: Clean stack on mobile, horizontal row on tablet/desktop */}
                                <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            localStorage.setItem("matches_tab", "candidates");
                                            setPage("matches");
                                        }}
                                        className="w-full sm:w-auto min-h-[42px] justify-center"
                                    >
                                        View profile
                                    </Button>

                                    {isConnectedWithBestMatch ? (
                                        <Button
                                            onClick={() => setPage("chat")}
                                            className="w-full sm:w-auto min-h-[42px] justify-center"
                                        >
                                            <MessageCircleIcon className="h-4 w-4 shrink-0" />
                                            <span>Message</span>
                                        </Button>
                                    ) : sentToBestMatch ? (
                                        <Button
                                            variant="secondary"
                                            disabled
                                            className="w-full sm:w-auto min-h-[42px] justify-center text-slate-500"
                                        >
                                            <CheckIcon className="h-4 w-4 shrink-0 text-emerald-500" />
                                            <span>Request sent</span>
                                        </Button>
                                    ) : receivedFromBestMatch ? (
                                        <Button
                                            size="sm"
                                            loading={actingId === receivedFromBestMatch.request_id}
                                            onClick={() =>
                                                respondToRequest(
                                                    receivedFromBestMatch.request_id,
                                                    "accept"
                                                )
                                            }
                                            className="w-full sm:w-auto min-h-[42px] justify-center"
                                        >
                                            <CheckIcon className="h-4 w-4 shrink-0" />
                                            <span>Accept request</span>
                                        </Button>
                                    ) : (
                                        <Button
                                            loading={connecting}
                                            onClick={() => handleConnect(bestMatch)}
                                            className="w-full sm:w-auto min-h-[42px] justify-center"
                                        >
                                            <UserRoundPlusIcon className="h-4 w-4 shrink-0" />
                                            <span>Connect</span>
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <EmptyState
                                compact
                                icon={<UsersRoundIcon className="h-6 w-6" />}
                                title="No matches yet"
                                description="Complete your profile preferences to discover compatible roommates."
                            >
                                <Button onClick={() => setPage("profile")}>
                                    Set up preferences
                                </Button>
                            </EmptyState>
                        )}
                    </Card>

                    {/* Recent conversations */}
                    <Card className="p-4 sm:p-6 overflow-hidden">
                        <SectionHeader
                            icon={<MessageCircleIcon className="h-4.5 w-4.5" />}
                            title="Recent conversations"
                            action="Open messages"
                            onAction={() => setPage("chat")}
                        />

                        {data.conversations.length === 0 ? (
                            <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
                                No conversations yet. Start chatting with a
                                match!
                            </p>
                        ) : (
                            <div className="space-y-1.5">
                                {data.conversations.slice(0, 3).map((conv) => (
                                    <button
                                        key={conv.user_id}
                                        onClick={() => {
                                            localStorage.setItem("chat_peer", String(conv.user_id));
                                            setPage("chat");
                                        }}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/60 min-h-[52px] min-w-0"
                                    >
                                        <Avatar name={conv.name} size="md" className="shrink-0" />
                                        <div className="min-w-0 flex-1 overflow-hidden">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                    {conv.name}
                                                </p>
                                                {conv.last_message_at && (
                                                    <span className="text-[11px] text-slate-400 dark:text-slate-500 shrink-0">
                                                        {formatRelativeTime(conv.last_message_at)}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="truncate text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-full">
                                                {conv.last_message ||
                                                    "Say hello!"}
                                            </p>
                                        </div>
                                        {conv.unread_count > 0 && (
                                            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold text-white">
                                                {conv.unread_count}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Right column */}
                <div className="space-y-6 min-w-0">
                    {/* Your living group */}
                    <Card className="p-4 sm:p-6 overflow-hidden">
                        <SectionHeader
                            icon={<HouseIcon className="h-4.5 w-4.5" />}
                            title={data.groups.length > 1 ? `Living Groups (${data.groups.length})` : "Your living group"}
                            action={data.groups.length > 0 ? "View all" : undefined}
                            onAction={() => setPage("groups")}
                        />

                        {data.groups.length > 1 ? (
                            <div className="space-y-2">
                                {data.groups.map((grp) => (
                                    <div
                                        key={grp.group_id}
                                        onClick={() => {
                                            localStorage.setItem("groups_id", String(grp.group_id));
                                            setPage("groups");
                                        }}
                                        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 transition-colors hover:bg-brand-50/60 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-brand-950/30 min-w-0"
                                    >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <Avatar name={grp.name} size="md" className="shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                    {grp.name}
                                                </p>
                                                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                                                    <span>{grp.member_count} {grp.member_count === 1 ? "member" : "members"}</span>
                                                    {grp.role === "admin" && (
                                                        <span className="inline-flex items-center rounded-md bg-brand-50 dark:bg-brand-950/50 px-1.5 py-0.5 text-[10px] font-bold text-brand-600 dark:text-brand-400 border border-brand-200/60 dark:border-brand-800/60">
                                                            Admin
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <ChevronRightIcon className="h-4 w-4 text-slate-400 shrink-0" />
                                    </div>
                                ))}
                            </div>
                        ) : livingGroup ? (
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-violet-500 text-white">
                                        <HouseIcon className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                            {livingGroup.name}
                                        </p>
                                        <p className="text-xs text-slate-400 dark:text-slate-500">
                                            {livingGroup.member_count}{" "}
                                            {livingGroup.member_count === 1
                                                ? "member"
                                                : "members"}
                                            {livingGroup.open_slots > 0 &&
                                                ` · ${livingGroup.open_slots} open`}
                                        </p>
                                    </div>
                                </div>

                                {livingGroup.invite_code && (
                                    <div className="flex items-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                                Invite code
                                            </p>
                                            <p className="font-mono text-base font-bold tracking-widest text-brand-700 dark:text-brand-300">
                                                {livingGroup.invite_code}
                                            </p>
                                        </div>
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => {
                                                const copy = navigator.clipboard?.writeText(
                                                    livingGroup.invite_code
                                                );
                                                if (!copy) return;
                                                copy
                                                    .then(() => {
                                                        setCopiedCode(true);
                                                        setTimeout(
                                                            () =>
                                                                setCopiedCode(
                                                                    false
                                                                ),
                                                            1500
                                                        );
                                                    })
                                                    .catch(() => {});
                                            }}
                                        >
                                            {copiedCode ? (
                                                <CheckIcon className="h-3.5 w-3.5" />
                                            ) : (
                                                <CopyIcon className="h-3.5 w-3.5" />
                                            )}
                                            {copiedCode ? "Copied" : "Copy"}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <EmptyState
                                compact
                                icon={<HouseIcon className="h-6 w-6" />}
                                title="No living group yet"
                                description="Create a group to split expenses, manage your household, and invite roommates."
                            >
                                <Button onClick={() => setPage("groups")}>
                                    Create a group
                                </Button>
                            </EmptyState>
                        )}
                    </Card>

                    {/* Pending requests */}
                    <Card className="p-4 sm:p-6">
                        <SectionHeader
                            icon={<UserRoundPlusIcon className="h-4.5 w-4.5 text-sky-500" />}
                            title="Requests"
                            action={pendingRequests.length > 0 ? "View all" : undefined}
                            onAction={() => {
                                localStorage.setItem("matches_tab", "requests");
                                setPage("matches");
                            }}
                        />
                        {pendingCount > 0 && (
                            <Badge variant="warning" dot className="mb-4">
                                {pendingCount} pending
                            </Badge>
                        )}

                        {pendingCount > 0 ? (
                            <div className="space-y-3">
                                {pendingRequests.slice(0, 3).map((req) => (
                                    <div
                                        key={req.request_id}
                                        className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
                                    >
                                        <Avatar
                                            name={req.user_name}
                                            size="sm"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                {req.user_name}
                                            </p>
                                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                                wants to connect
                                            </p>
                                        </div>
                                        <div className="flex gap-1.5">
                                            <Button
                                                size="sm"
                                                className="px-2.5"
                                                loading={actingId === req.request_id}
                                                aria-label={`Accept request from ${req.user_name}`}
                                                onClick={() =>
                                                    respondToRequest(
                                                        req.request_id,
                                                        "accept"
                                                    )
                                                }
                                            >
                                                <CheckIcon className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="px-2.5"
                                                disabled={actingId === req.request_id}
                                                aria-label={`Reject request from ${req.user_name}`}
                                                onClick={() =>
                                                    respondToRequest(
                                                        req.request_id,
                                                        "reject"
                                                    )
                                                }
                                            >
                                                <CloseIcon className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                {pendingRequests.length > 3 && (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="w-full"
                                        onClick={() => {
                                            localStorage.setItem("matches_tab", "received");
                                            setPage("matches");
                                        }}
                                    >
                                        Review all requests
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-400 dark:text-slate-500">
                                No pending roommate requests.
                            </p>
                        )}
                    </Card>

                    {/* Recent notifications */}
                    <Card className="p-4 sm:p-6">
                        <SectionHeader
                            icon={<BellIcon className="h-4.5 w-4.5 text-amber-500" />}
                            title="Activity"
                            action={undefined}
                        />
                        {unreadNotifications > 0 && (
                            <Badge variant="brand" dot className="mb-4">
                                {unreadNotifications} new
                            </Badge>
                        )}

                        {data.notifications.length === 0 ? (
                            <p className="text-sm text-slate-400 dark:text-slate-500">
                                No activity yet.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {data.notifications.slice(0, 3).map((n) => (
                                    <button
                                        key={n.id}
                                        onClick={() => setPage("notifications")}
                                        className={`w-full text-left rounded-xl border p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                                            n.is_read
                                                ? "border-slate-100 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40"
                                                : "border-brand-200/80 bg-brand-50/40 dark:border-brand-800/60 dark:bg-brand-950/20"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                                                {n.title}
                                            </p>
                                            {!n.is_read && (
                                                <span className="h-2 w-2 rounded-full bg-brand-500 shrink-0" />
                                            )}
                                        </div>
                                        <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                            {n.message}
                                        </p>
                                    </button>
                                ))}
                                <button
                                    onClick={() => setPage("notifications")}
                                    className="flex w-full items-center justify-center gap-1 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                                >
                                    View all activity
                                    <ArrowRightIcon className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default Home;
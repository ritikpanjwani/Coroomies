import { useCallback, useEffect, useState } from "react";
import api from "./api";
import Card from "./components/ui/Card";
import Button from "./components/ui/Button";
import Badge from "./components/ui/Badge";
import EmptyState from "./components/ui/EmptyState";
import Spinner from "./components/ui/Spinner";
import PageHeader from "./components/ui/PageHeader";
import { useToast } from "./components/Toast";
import { formatRelativeTime } from "./utils/format";
import {
    BellIcon,
    UserRoundPlusIcon,
    UsersRoundIcon,
    CheckCircleIcon,
    MessageCircleIcon,
    ReceiptIndianRupeeIcon,
    HouseIcon,
    Trash2Icon,
    ArrowRightIcon,
    RefreshCwIcon,
} from "./components/Icons";

function NotificationIcon({ type = "", title = "" }) {
    const t = `${type} ${title}`.toLowerCase();
    let icon = <BellIcon className="h-4.5 w-4.5" />;
    let bg = "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";

    if (t.includes("request_accepted") || t.includes("accepted")) {
        icon = <CheckCircleIcon className="h-4.5 w-4.5" />;
        bg = "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400";
    } else if (t.includes("request")) {
        icon = <UserRoundPlusIcon className="h-4.5 w-4.5" />;
        bg = "bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400";
    } else if (t.includes("match") || t.includes("compatib")) {
        icon = <UsersRoundIcon className="h-4.5 w-4.5" />;
        bg = "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400";
    } else if (t.includes("message") || t.includes("chat")) {
        icon = <MessageCircleIcon className="h-4.5 w-4.5" />;
        bg = "bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400";
    } else if (t.includes("expense") || t.includes("payment") || t.includes("settle")) {
        icon = <ReceiptIndianRupeeIcon className="h-4.5 w-4.5" />;
        bg = "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400";
    } else if (t.includes("group")) {
        icon = <HouseIcon className="h-4.5 w-4.5" />;
        bg = "bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400";
    }

    return (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${bg}`}>
            {icon}
        </div>
    );
}

function getActionLabel(notification) {
    const type = notification.notification_type || "";
    const title = (notification.title || "").toLowerCase();
    if (type === "roommate_request" || title.includes("roommate request")) return "View Request";
    if (type === "request_accepted" || type === "new_message" || title.includes("message")) return "Open Chat";
    if (type === "request_rejected") return "View Requests";
    if (type.startsWith("group_")) return "View Group";
    if (type.includes("expense") || type.includes("payment")) return "View Expenses";
    return "Open";
}

function Notifications({ setPage }) {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const toast = useToast();

    const loadNotifications = useCallback(async (showLoading = false) => {
        try {
            if (showLoading) setLoading(true);
            const response = await api.get("/notifications/?limit=100");
            setNotifications(response.data.notifications || []);
        } catch {
            // Silently handle notification load error
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadNotifications();
    }, [loadNotifications]);

    const markRead = async (id, e) => {
        if (e) e.stopPropagation();
        try {
            setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
            );
            await api.put(`/notifications/${id}/read`);
            window.dispatchEvent(new Event("coroomies:refresh-counts"));
        } catch {
            // Fail silently on markRead network error
        }
    };

    const markAllRead = async () => {
        try {
            setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
            await api.put("/notifications/read-all");
            toast.success("All notifications marked as read");
            window.dispatchEvent(new Event("coroomies:refresh-counts"));
        } catch {
            toast.error("Could not mark notifications as read");
        }
    };

    const clearReadNotifications = async () => {
        try {
            setNotifications((prev) => prev.filter((n) => !n.is_read));
            const res = await api.delete("/notifications/clear-all");
            toast.success(`Cleared ${res.data.deleted_count || 0} read notification(s)`);
            window.dispatchEvent(new Event("coroomies:refresh-counts"));
        } catch {
            toast.error("Could not clear read notifications");
        }
    };

    const deleteNotification = async (e, id) => {
        e.stopPropagation();
        try {
            setNotifications((prev) => prev.filter((n) => n.id !== id));
            await api.delete(`/notifications/${id}`);
            toast.success("Notification deleted");
            window.dispatchEvent(new Event("coroomies:refresh-counts"));
        } catch {
            toast.error("Could not delete notification");
        }
    };

    const handleNotificationClick = (n) => {
        if (!n.is_read) {
            markRead(n.id);
        }
        const type = n.notification_type || "";
        const title = (n.title || "").toLowerCase();

        if (type === "roommate_request") {
            localStorage.setItem("matches_tab", "received");
            if (setPage) setPage("matches");
        } else if (type === "request_accepted") {
            if (n.sender_id) {
                localStorage.setItem("chat_peer", String(n.sender_id));
                window.dispatchEvent(new CustomEvent("coroomies:open-chat", { detail: { peerId: Number(n.sender_id) } }));
            }
            if (setPage) setPage("chat");
        } else if (type === "request_rejected") {
            localStorage.setItem("matches_tab", "sent");
            if (setPage) setPage("matches");
        } else if (type === "new_message") {
            if (n.sender_id) {
                localStorage.setItem("chat_peer", String(n.sender_id));
                window.dispatchEvent(new CustomEvent("coroomies:open-chat", { detail: { peerId: Number(n.sender_id) } }));
            }
            if (setPage) setPage("chat");
        } else if (type.startsWith("group_")) {
            if (n.reference_id) {
                localStorage.setItem("groups_id", String(n.reference_id));
            }
            if (setPage) setPage("groups");
        } else if (
            type.includes("expense") ||
            type.includes("payment") ||
            type.includes("settle")
        ) {
            if (n.reference_id) {
                localStorage.setItem("groups_id", String(n.reference_id));
                localStorage.setItem("groups_tab", "expenses");
                if (setPage) setPage("groups");
            } else if (setPage) {
                setPage("expenses");
            }
        } else if (title.includes("request")) {
            localStorage.setItem("matches_tab", "requests");
            if (setPage) setPage("matches");
        } else if (title.includes("message") || title.includes("chat")) {
            if (n.sender_id) {
                localStorage.setItem("chat_peer", String(n.sender_id));
            }
            if (setPage) setPage("chat");
        }
    };

    const unreadCount = notifications.filter((n) => !n.is_read).length;
    const readCount = notifications.length - unreadCount;

    const filteredNotifications = notifications.filter((n) => {
        if (filter === "unread") return !n.is_read;
        if (filter === "requests") {
            const t = `${n.notification_type} ${n.title}`.toLowerCase();
            return t.includes("request");
        }
        if (filter === "messages") {
            const t = `${n.notification_type} ${n.title}`.toLowerCase();
            return t.includes("message") || t.includes("chat");
        }
        if (filter === "groups") {
            const t = `${n.notification_type} ${n.title}`.toLowerCase();
            return t.includes("group") || t.includes("expense") || t.includes("payment");
        }
        return true;
    });

    if (loading) {
        return (
            <div className="w-full max-w-3xl mx-auto">
                <PageHeader title="Notifications" />
                <div className="flex justify-center py-24">
                    <Spinner size="lg" />
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-3xl mx-auto space-y-4">
            <PageHeader
                title="Notifications"
                subtitle="Stay updated on connection requests, messages, living groups, and split expenses."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {unreadCount > 0 && (
                            <Button variant="secondary" size="sm" onClick={markAllRead}>
                                <CheckCircleIcon className="h-4 w-4" />
                                Mark all read
                            </Button>
                        )}
                        {readCount > 0 && (
                            <Button variant="ghost" size="sm" onClick={clearReadNotifications} title="Clear read notifications">
                                <Trash2Icon className="h-4 w-4" />
                                Clear read
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => loadNotifications(true)} title="Refresh">
                            <RefreshCwIcon className="h-4 w-4" />
                        </Button>
                    </div>
                }
            />

            {/* Filter tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-scroll scroll-smooth rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 shadow-xs">
                {[
                    { key: "all", label: "All", count: notifications.length },
                    { key: "unread", label: "Unread", count: unreadCount, badgeColor: "bg-brand-500 text-white" },
                    { key: "requests", label: "Requests" },
                    { key: "messages", label: "Messages" },
                    { key: "groups", label: "Groups & Expenses" },
                ].map(({ key, label, count, badgeColor }) => {
                    const active = filter === key;
                    return (
                        <button
                            key={key}
                            onClick={() => setFilter(key)}
                            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 min-h-[40px] text-xs font-medium transition-all ${
                                active
                                    ? "bg-brand-600 text-white shadow-xs dark:bg-brand-500"
                                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            }`}
                        >
                            <span>{label}</span>
                            {typeof count === "number" && count > 0 && (
                                <span
                                    className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                                        active
                                            ? "bg-white/20 text-white"
                                            : badgeColor || "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                    }`}
                                >
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Notification list */}
            {filteredNotifications.length === 0 ? (
                <Card>
                    <EmptyState
                        icon={<BellIcon className="h-6 w-6" />}
                        title={
                            filter === "unread"
                                ? "No unread notifications"
                                : filter === "all"
                                ? "No notifications yet"
                                : `No ${filter} notifications`
                        }
                        description={
                            filter === "unread"
                                ? "You're all caught up! Check back later for new roommate updates."
                                : "When someone sends you a request, message, or group activity, it will show up here."
                        }
                        action={
                            setPage && (
                                <Button variant="secondary" onClick={() => setPage("matches")}>
                                    Find Flatmates
                                </Button>
                            )
                        }
                    />
                </Card>
            ) : (
                <div className="space-y-2.5">
                    {filteredNotifications.map((notification) => {
                        const actionLabel = getActionLabel(notification);
                        return (
                            <Card
                                key={notification.id}
                                onClick={() => handleNotificationClick(notification)}
                                className={`group relative flex cursor-pointer flex-col gap-3 p-3.5 transition-all duration-150 sm:flex-row sm:items-center sm:gap-4 sm:p-4 hover:shadow-md ${
                                    notification.is_read
                                        ? "opacity-75 bg-white/70 dark:bg-slate-900/60"
                                        : "ring-1 ring-brand-200 dark:ring-brand-800/60 bg-brand-50/15 dark:bg-brand-950/20"
                                }`}
                            >
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                    <NotificationIcon
                                        type={notification.notification_type}
                                        title={notification.title}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                {notification.title}
                                            </p>
                                            {!notification.is_read && (
                                                <Badge variant="brand" dot size="sm">
                                                    New
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 break-words">
                                            {notification.message}
                                        </p>
                                        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
                                            {notification.sender_name && (
                                                <span className="font-medium text-slate-500 dark:text-slate-400">
                                                    From: {notification.sender_name}
                                                </span>
                                            )}
                                            {notification.created_at && (
                                                <span>
                                                    {formatRelativeTime(notification.created_at)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-1.5 self-end sm:self-center shrink-0 pt-1 sm:pt-0">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleNotificationClick(notification);
                                        }}
                                        className="inline-flex items-center gap-1 rounded-lg bg-brand-50 dark:bg-brand-950/60 px-2.5 py-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors"
                                    >
                                        <span>{actionLabel}</span>
                                        <ArrowRightIcon className="h-3 w-3" />
                                    </button>

                                    {!notification.is_read && (
                                        <button
                                            type="button"
                                            onClick={(e) => markRead(notification.id, e)}
                                            className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                                            title="Mark as read"
                                        >
                                            <CheckCircleIcon className="h-3.5 w-3.5" />
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={(e) => deleteNotification(e, notification.id)}
                                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors"
                                        title="Delete notification"
                                    >
                                        <Trash2Icon className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default Notifications;

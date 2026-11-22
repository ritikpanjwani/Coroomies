import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";

import Spinner from "./components/ui/Spinner";
import ErrorBoundary from "./components/ui/ErrorBoundary";

const Home = lazy(() => import("./home"));
const Profile = lazy(() => import("./Profile"));
const Matches = lazy(() => import("./Matches"));
const Expenses = lazy(() => import("./Expenses"));
const Chat = lazy(() => import("./chat"));
const Notifications = lazy(() => import("./Notifications"));
const Groups = lazy(() => import("./Groups"));
const Household = lazy(() => import("./Household"));
const Assistant = lazy(() => import("./Assistant"));
const Settings = lazy(() => import("./Settings"));
const Rooms = lazy(() => import("./Rooms"));

import { logout } from "./auth";
import api, { API_BASE } from "./api";
import {
  LayoutDashboardIcon,
  UserRoundIcon,
  UsersRoundIcon,
  HouseIcon,
  MessageCircleIcon,
  ReceiptIndianRupeeIcon,
  CheckCircleIcon,
  BuildingIcon,
  SparklesIcon,
  UserRoundPlusIcon,
  BellIcon,
  LogoutIcon,
  MenuIcon,
  CloseIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
  PanelIcon,
  ChevronLeftIcon,
  PencilIcon,
  ArrowRightIcon,
} from "./components/Icons";
import Avatar from "./components/ui/Avatar";
import { formatRelativeTime } from "./utils/format";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { key: "home", label: "Dashboard", icon: <LayoutDashboardIcon className="h-[18px] w-[18px]" /> },
      { key: "profile", label: "My Profile", icon: <UserRoundIcon className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    label: "Flatmates",
    items: [
      { key: "matches", label: "Find Flatmates", icon: <UsersRoundIcon className="h-[18px] w-[18px]" /> },
      { key: "chat", label: "Messages", icon: <MessageCircleIcon className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    label: "Living",
    items: [
      { key: "expenses", label: "Expenses", icon: <ReceiptIndianRupeeIcon className="h-[18px] w-[18px]" /> },
      { key: "rooms", label: "Rooms & Vacancies", icon: <BuildingIcon className="h-[18px] w-[18px]" /> },
      { key: "groups", label: "Living Groups", icon: <HouseIcon className="h-[18px] w-[18px]" /> },
      { key: "household", label: "Household", icon: <CheckCircleIcon className="h-[18px] w-[18px]" /> },
      { key: "assistant", label: "Conflict Assistant", icon: <SparklesIcon className="h-[18px] w-[18px]" /> },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function LogoMark({ className = "" }) {
  return (
    <div
      className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-violet-500 text-white shadow-glow ${className}`}
    >
      <HouseIcon className="h-5 w-5" />
    </div>
  );
}

function Logo({ onDark = false, compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      {!compact && (
        <span
          className={`text-lg font-bold tracking-tight ${
            onDark ? "text-white" : "text-slate-900"
          }`}
        >
          CoRoomies
        </span>
      )}
    </div>
  );
}

function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    return document.documentElement.classList.contains("dark");
  });

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  }, []);

  return { isDark, toggle };
}

function DropdownNotificationIcon({ type = "", title = "" }) {
  const t = `${type} ${title}`.toLowerCase();
  if (t.includes("request_accepted") || t.includes("accepted")) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
        <CheckCircleIcon className="h-4 w-4" />
      </div>
    );
  }
  if (t.includes("request")) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
        <UserRoundPlusIcon className="h-4 w-4" />
      </div>
    );
  }
  if (t.includes("message") || t.includes("chat")) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400">
        <MessageCircleIcon className="h-4 w-4" />
      </div>
    );
  }
  if (t.includes("expense") || t.includes("payment") || t.includes("settle")) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
        <ReceiptIndianRupeeIcon className="h-4 w-4" />
      </div>
    );
  }
  if (t.includes("group")) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
        <HouseIcon className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      <BellIcon className="h-4 w-4" />
    </div>
  );
}

function Dashboard() {
    const [page, setPage] = useState(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            const joinCode = params.get("join") || params.get("code") || params.get("invite");
            if (joinCode) {
                localStorage.setItem("coroomies_join_code", joinCode.trim().toUpperCase());
                return "groups";
            }
            if (localStorage.getItem("coroomies_join_code")) {
                return "groups";
            }
        } catch {
            // Ignore URL parsing errors
        }
        return "home";
    });
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(
        () => localStorage.getItem("sidebar_collapsed") === "1"
    );
    const [notifOpen, setNotifOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const { isDark, toggle: toggleTheme } = useTheme();

    const [counts, setCounts] = useState({
        notifications: 0,
        messages: 0,
        requests: 0,
    });
    const [recentNotifications, setRecentNotifications] = useState([]);
    const notifRef = useRef(null);
    const userMenuRef = useRef(null);

    const userName = localStorage.getItem("user_name") || "Roommate";
    const userUsername = localStorage.getItem("user_username") || "";
    const activeItem =
        ALL_NAV_ITEMS.find((item) => item.key === page) ||
        (page === "notifications" ? { label: "Notifications" } : undefined) ||
        (page === "settings" ? { label: "Settings" } : undefined);
    const isActivePage = (key) => page === key;

    const loadCounts = useCallback(async () => {
        try {
            // When already on the chat page, chat.jsx polls /messages/ directly; skip redundant fetch
            const isChatPage = page === "chat";
            const [notifRes, chatRes, reqRes] = await Promise.all([
                api.get("/notifications/?limit=10"),
                isChatPage ? Promise.resolve({ data: { conversations: [] } }) : api.get("/messages/"),
                api.get("/requests/"),
            ]);
            const notifications = notifRes.data.notifications || [];
            const conversations = chatRes.data.conversations || [];
            const unreadNotifCount =
                typeof notifRes.data.unread_count === "number"
                    ? notifRes.data.unread_count
                    : notifications.filter((n) => !n.is_read).length;

            setCounts((prev) => ({
                notifications: unreadNotifCount,
                messages: isChatPage
                    ? prev.messages
                    : conversations.reduce(
                        (sum, c) => sum + (c.unread_count || 0),
                        0
                    ),
                requests: reqRes.data.pending_count || 0,
            }));
            setRecentNotifications(notifications.slice(0, 8));
        } catch (error) {
            console.error(error.response?.data);
        }
    }, [page]);

    useEffect(() => {
        // Initial load
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadCounts();

        // Active visibility polling with clean timer
        const interval = setInterval(() => {
            if (document.visibilityState === "visible") {
                loadCounts();
            }
        }, 6000);

        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                loadCounts();
            }
        };

        const onCustomRefresh = () => {
            loadCounts();
        };

        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("focus", onVisibilityChange);
        window.addEventListener("coroomies:refresh-counts", onCustomRefresh);

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.removeEventListener("focus", onVisibilityChange);
            window.removeEventListener("coroomies:refresh-counts", onCustomRefresh);
        };
    }, [loadCounts]);

    useEffect(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            const joinCode = params.get("join") || params.get("code");
            if (joinCode) {
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } catch {
            // Ignore URL parsing errors
        }
    }, []);

    // Lock body scroll while the mobile drawer is open
    useEffect(() => {
        document.body.style.overflow = sidebarOpen ? "hidden" : "";
        return () => {
            document.body.style.overflow = "";
        };
    }, [sidebarOpen]);

    useEffect(() => {
        const onClickOutside = (event) => {
            if (notifRef.current && !notifRef.current.contains(event.target)) {
                setNotifOpen(false);
            }
            if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
                setUserMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    const handleLogout = async () => {
        try {
            await api.post("/auth/logout");
        } catch {
            logout();
        }
        logout();
        window.location.reload();
    };

    const navigate = (key) => {
        setPage(key);
        setSidebarOpen(false);
        setMoreOpen(false);
        setNotifOpen(false);
        setUserMenuOpen(false);
        window.scrollTo({ top: 0, behavior: "instant" });
    };

    const toggleCollapsed = () => {
        setCollapsed((prev) => {
            localStorage.setItem("sidebar_collapsed", prev ? "0" : "1");
            return !prev;
        });
    };

    const handleBellClick = async () => {
        const next = !notifOpen;
        setNotifOpen(next);
        if (next) {
            try {
                const res = await api.get("/notifications/?limit=10");
                const list = res.data.notifications || [];
                setRecentNotifications(list);
                if (typeof res.data.unread_count === "number") {
                    setCounts((prev) => ({ ...prev, notifications: res.data.unread_count }));
                }
            } catch (error) {
                console.error(error.response?.data);
            }
        }
    };

    const markAllReadDropdown = async () => {
        try {
            setRecentNotifications((prev) =>
                prev.map((item) => ({ ...item, is_read: true }))
            );
            setCounts((prev) => ({ ...prev, notifications: 0 }));
            await api.put("/notifications/read-all");
            await loadCounts();
        } catch (error) {
            console.error(error.response?.data);
        }
    };

    const handleNotificationClick = async (n) => {
        // Optimistically mark as read
        if (!n.is_read) {
            setRecentNotifications((prev) =>
                prev.map((item) => (item.id === n.id ? { ...item, is_read: true } : item))
            );
            setCounts((prev) => ({
                ...prev,
                notifications: Math.max(0, prev.notifications - 1),
            }));
            api.put(`/notifications/${n.id}/read`).catch(() => null);
        }
        setNotifOpen(false);

        // Smart routing to appropriate workflow
        const type = n.notification_type || "";
        const title = (n.title || "").toLowerCase();

        if (type === "roommate_request") {
            localStorage.setItem("matches_tab", "received");
            navigate("matches");
        } else if (type === "request_accepted") {
            if (n.sender_id) {
                localStorage.setItem("chat_peer", String(n.sender_id));
                window.dispatchEvent(new CustomEvent("coroomies:open-chat", { detail: { peerId: Number(n.sender_id) } }));
            }
            navigate("chat");
        } else if (type === "request_rejected") {
            localStorage.setItem("matches_tab", "sent");
            navigate("matches");
        } else if (type === "new_message") {
            if (n.sender_id) {
                localStorage.setItem("chat_peer", String(n.sender_id));
                window.dispatchEvent(new CustomEvent("coroomies:open-chat", { detail: { peerId: Number(n.sender_id) } }));
            }
            navigate("chat");
        } else if (type.startsWith("group_")) {
            if (n.reference_id) {
                localStorage.setItem("groups_id", String(n.reference_id));
            }
            navigate("groups");
        } else if (
            type.includes("expense") ||
            type.includes("payment") ||
            type.includes("settle")
        ) {
            if (n.reference_id) {
                localStorage.setItem("groups_id", String(n.reference_id));
                localStorage.setItem("groups_tab", "expenses");
                navigate("groups");
            } else {
                navigate("expenses");
            }
        } else if (title.includes("request")) {
            localStorage.setItem("matches_tab", "requests");
            navigate("matches");
        } else if (title.includes("message") || title.includes("chat")) {
            if (n.sender_id) {
                localStorage.setItem("chat_peer", String(n.sender_id));
            }
            navigate("chat");
        } else {
            navigate("notifications");
        }
    };

    const navButtonClass = (active) =>
        `group relative flex w-full items-center rounded-lg transition-all duration-150 ${
            collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
        } ${
            active
                ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200 font-semibold"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
        }`;

    const navActiveBar = (active) =>
        active ? (
            <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-brand-500 to-violet-500" />
        ) : null;

    const sidebarContent = (
        <>
            <div
                className={`flex h-16 items-center ${collapsed ? "justify-center" : "justify-between"} px-3`}
            >
                <Logo compact={collapsed} />
                <button
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 ${
                        collapsed ? "hidden" : ""
                    }`}
                    onClick={() => setSidebarOpen(false)}
                    aria-label="Close menu"
                >
                    <CloseIcon className="h-5 w-5" />
                </button>
            </div>

            <nav
                className={`mt-2 flex-1 space-y-4 overflow-y-auto pb-4 ${
                    collapsed ? "px-2" : "px-3"
                }`}
                aria-label="Primary navigation"
            >
                {NAV_GROUPS.map((group) => (
                    <div key={group.label}>
                        {!collapsed && (
                            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                {group.label}
                            </p>
                        )}
                        <div className="space-y-1">
                            {group.items.map((item) => {
                                const active = isActivePage(item.key);
                                const badge =
                                    item.key === "matches"
                                        ? counts.requests
                                        : item.key === "chat"
                                        ? counts.messages
                                        : 0;
                                return (
                                    <button
                                        key={item.key}
                                        onClick={() => navigate(item.key)}
                                        title={collapsed ? item.label : undefined}
                                        aria-current={active ? "page" : undefined}
                                        className={navButtonClass(active)}
                                    >
                                        {navActiveBar(active)}
                                        <span className="relative shrink-0">
                                            {item.icon}
                                            {badge > 0 && !collapsed && (
                                                <span
                                                    className={`absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                                                        active
                                                            ? "bg-brand-600 text-white"
                                                            : "bg-rose-500 text-white"
                                                    }`}
                                                >
                                                    {badge > 9 ? "10+" : badge}
                                                </span>
                                            )}
                                            {badge > 0 && collapsed && (
                                                <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />
                                            )}
                                        </span>
                                        {!collapsed && (
                                            <span className="flex-1 truncate text-left">
                                                {item.label}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}

                <div
                    className={`${collapsed ? "flex justify-center" : ""} border-t border-slate-100 pt-3 dark:border-slate-800`}
                >
                    <button
                        onClick={() => navigate("settings")}
                        title={collapsed ? "Settings" : undefined}
                        aria-current={isActivePage("settings") ? "page" : undefined}
                        className={navButtonClass(isActivePage("settings"))}
                    >
                        {navActiveBar(isActivePage("settings"))}
                        <SettingsIcon className="h-[18px] w-[18px]" />
                        {!collapsed && <span className="flex-1 truncate text-left">Settings</span>}
                    </button>
                </div>
            </nav>

            <div
                className={`border-t border-slate-100 p-3 dark:border-slate-800 ${
                    collapsed ? "flex justify-center" : ""
                }`}
            >
                <button
                    onClick={toggleCollapsed}
                    className={`hidden items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 lg:flex ${
                        collapsed ? "justify-center px-0" : "w-full"
                    }`}
                    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {collapsed ? (
                        <PanelIcon className="h-[18px] w-[18px]" />
                    ) : (
                        <>
                            <ChevronLeftIcon className="h-4 w-4" />
                            Collapse
                        </>
                    )}
                </button>
            </div>
        </>
    );

    return (
        <div className="min-h-screen w-full overflow-x-hidden bg-slate-50 dark:bg-slate-900 flex flex-col">
            {/* Desktop sidebar */}
            <aside
                className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200/80 bg-white transition-[width] duration-200 dark:border-slate-800 dark:bg-slate-950 lg:flex ${
                    collapsed ? "w-[76px]" : "w-64"
                }`}
            >
                {sidebarContent}
            </aside>

            {/* Main column */}
            <div className={`flex-1 w-full min-w-0 flex flex-col transition-[padding-left] duration-200 ${collapsed ? "lg:pl-[76px]" : "lg:pl-64"}`}>
                {/* Top bar */}
                <header className="sticky top-0 z-30 flex h-14 sm:h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 sm:px-6 lg:px-8 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
                    <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
                        <LogoMark className="h-8 w-8" />
                        <span className="truncate text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
                            CoRoomies
                        </span>
                    </div>

                    <div className="hidden lg:block">
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            {activeItem?.label || "Dashboard"}
                        </h2>
                    </div>

                    <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                        <button
                            onClick={toggleTheme}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
                            title={isDark ? "Light mode" : "Dark mode"}
                        >
                            {isDark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
                        </button>

                        <button
                            onClick={() => navigate("chat")}
                            className="relative hidden sm:flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                            aria-label="Messages"
                            title="Messages"
                        >
                            <MessageCircleIcon className="h-5 w-5" />
                            {counts.messages > 0 && (
                                <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
                                    {counts.messages > 9 ? "10+" : counts.messages}
                                </span>
                            )}
                        </button>

                        <div className="relative" ref={notifRef}>
                            <button
                                onClick={handleBellClick}
                                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                aria-label="Notifications"
                            >
                                <BellIcon className="h-5 w-5" />
                                {counts.notifications > 0 && (
                                    <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
                                        {counts.notifications}
                                    </span>
                                )}
                            </button>

                            {notifOpen && (
                                <div className="absolute right-0 top-11 z-50 w-84 max-w-[calc(100vw-1.5rem)] animate-slide-up overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
                                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700/80">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                Notifications
                                            </p>
                                            {counts.notifications > 0 && (
                                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500/10 px-1.5 text-[11px] font-semibold text-brand-600 dark:text-brand-300">
                                                    {counts.notifications}
                                                </span>
                                            )}
                                        </div>
                                        {counts.notifications > 0 && (
                                            <button
                                                onClick={markAllReadDropdown}
                                                className="text-xs font-medium text-brand-600 transition-colors hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
                                            >
                                                Mark all read
                                            </button>
                                        )}
                                    </div>
                                    <div className="max-h-80 overflow-y-auto">
                                        {recentNotifications.length === 0 ? (
                                            <div className="py-8 text-center">
                                                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500">
                                                    <BellIcon className="h-5 w-5" />
                                                </div>
                                                <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                                                    All caught up!
                                                </p>
                                                <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                                                    No new notifications.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-slate-100 dark:divide-slate-700/70">
                                                {recentNotifications.map((n) => (
                                                    <button
                                                        key={n.id}
                                                        onClick={() => handleNotificationClick(n)}
                                                        className={`group flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/60 ${
                                                            n.is_read ? "opacity-75" : "bg-brand-50/25 dark:bg-brand-950/20"
                                                        }`}
                                                    >
                                                        <DropdownNotificationIcon type={n.notification_type} title={n.title} />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center justify-between gap-1">
                                                                <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                                                                    {n.sender_name && !n.title.toLowerCase().includes(n.sender_name.toLowerCase())
                                                                        ? `${n.sender_name} • ${n.title}`
                                                                        : n.title}
                                                                </p>
                                                                {n.created_at && (
                                                                    <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                                                                        {formatRelativeTime(n.created_at)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                                                                {n.message}
                                                            </p>
                                                        </div>
                                                        {!n.is_read && (
                                                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500 ring-2 ring-white dark:ring-slate-800" />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => {
                                            setNotifOpen(false);
                                            navigate("notifications");
                                        }}
                                        className="flex w-full items-center justify-center gap-1 border-t border-slate-100 px-4 py-2.5 text-xs font-medium text-brand-600 transition-colors hover:bg-brand-50 dark:border-slate-700 dark:text-brand-300 dark:hover:bg-brand-500/10"
                                    >
                                        View all notifications
                                        <ArrowRightIcon className="h-3 w-3" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* User avatar dropdown */}
                        <div className="relative" ref={userMenuRef}>
                            <button
                                onClick={() => setUserMenuOpen((v) => !v)}
                                className="flex h-9 w-9 items-center justify-center rounded-full transition-all hover:ring-2 hover:ring-brand-200 dark:hover:ring-brand-500/40"
                                aria-label="Account menu"
                            >
                                <Avatar
                                    name={userName}
                                    src={localStorage.getItem("user_avatar") ? `${API_BASE}${localStorage.getItem("user_avatar")}` : ""}
                                    size="sm"
                                />
                            </button>

                            {userMenuOpen && (
                                <div className="absolute right-0 top-11 z-50 w-56 animate-slide-up space-y-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-popup dark:border-slate-700 dark:bg-slate-800">
                                    <div className="px-3 py-2">
                                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                            {userName}
                                        </p>
                                        {userUsername && (
                                            <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                                                @{userUsername}
                                            </p>
                                        )}
                                    </div>
                                    <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                                    <button
                                        onClick={() => navigate("profile")}
                                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                                    >
                                        <UserRoundIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                                        View Profile
                                    </button>
                                    <button
                                        onClick={() => navigate("profile")}
                                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                                    >
                                        <PencilIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                                        Edit Profile
                                    </button>
                                    <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                                    <button
                                        onClick={handleLogout}
                                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-rose-500 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                                    >
                                        <LogoutIcon className="h-4 w-4" />
                                        Log out
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                <main className="w-full flex-1 max-w-6xl mx-auto px-4 py-4 pb-36 sm:px-6 sm:py-6 sm:pb-24 lg:px-8 lg:py-8 lg:pb-8">
                    <div key={page} className="w-full min-w-0 animate-fade-in">
                        <ErrorBoundary>
                            <Suspense
                                fallback={
                                    <div className="flex justify-center py-16">
                                        <Spinner size="lg" />
                                    </div>
                                }
                            >
                                {page === "home" && <Home setPage={navigate} />}
                                {page === "profile" && <Profile setPage={navigate} />}
                                {page === "matches" && <Matches setPage={navigate} />}
                                {page === "expenses" && <Expenses />}
                                {page === "groups" && <Groups />}
                                {page === "household" && <Household />}
                                {page === "assistant" && <Assistant />}
                                {page === "chat" && <Chat />}
                                {page === "notifications" && <Notifications setPage={navigate} />}
                                {page === "settings" && <Settings />}
                                {page === "rooms" && <Rooms />}
                            </Suspense>
                        </ErrorBoundary>
                    </div>
                </main>
            </div>

            {/* Mobile bottom navigation */}
            <nav
                className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95 lg:hidden"
                style={{
                    paddingBottom: "max(0.65rem, env(safe-area-inset-bottom, 0.65rem))",
                    paddingTop: "0.35rem",
                }}
                aria-label="Primary mobile navigation"
            >
                <div className="flex items-stretch justify-around px-1.5">
                    {[
                        { key: "home", label: "Home", icon: LayoutDashboardIcon },
                        { key: "matches", label: "Flatmates", icon: UsersRoundIcon, badge: counts.requests },
                        { key: "chat", label: "Messages", icon: MessageCircleIcon, badge: counts.messages },
                        { key: "expenses", label: "Expenses", icon: ReceiptIndianRupeeIcon },
                    ].map(({ key, label, icon: Icon, badge }) => {
                        const active = page === key;
                        return (
                            <button
                                key={key}
                                onClick={() => navigate(key)}
                                aria-current={active ? "page" : undefined}
                                className={`relative flex min-h-[48px] min-w-[56px] flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition-colors ${
                                    active
                                        ? "text-brand-600 dark:text-brand-400 font-semibold"
                                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                                }`}
                            >
                                <span className="relative">
                                    <Icon className="h-5 w-5" />
                                    {badge > 0 && (
                                        <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-950">
                                            {badge > 9 ? "10+" : badge}
                                        </span>
                                    )}
                                </span>
                                <span>{label}</span>
                                {active && (
                                    <span className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-8 rounded-full bg-gradient-to-r from-brand-600 to-violet-500" />
                                )}
                            </button>
                        );
                    })}
                    <button
                        onClick={() => setMoreOpen(true)}
                        aria-expanded={moreOpen}
                        className={`relative flex min-h-[48px] min-w-[56px] flex-1 flex-col items-center justify-center gap-1 py-1.5 text-[11px] font-medium transition-colors ${
                            ["groups", "household", "assistant", "profile", "settings", "rooms"].includes(page)
                                ? "text-brand-600 dark:text-brand-400 font-semibold"
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                        }`}
                    >
                        <span className="relative">
                            <MenuIcon className="h-5 w-5" />
                        </span>
                        <span>More</span>
                        {["groups", "household", "assistant", "profile", "settings", "rooms"].includes(page) && (
                            <span className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-8 rounded-full bg-gradient-to-r from-brand-600 to-violet-500" />
                        )}
                    </button>
                </div>
            </nav>

            {/* Mobile "More" Sheet Modal */}
            {moreOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div
                        className="absolute inset-0 animate-fade-in bg-slate-950/60 backdrop-blur-sm"
                        onClick={() => setMoreOpen(false)}
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="More navigation options"
                        className="absolute inset-x-0 bottom-0 max-h-[85vh] animate-slide-up overflow-y-auto rounded-t-3xl border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl touch-scroll"
                        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))" }}
                    >
                        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                                    More Features
                                </h3>
                                <p className="text-xs text-slate-400 dark:text-slate-500">
                                    Shared living, household management & tools
                                </p>
                            </div>
                            <button
                                onClick={() => setMoreOpen(false)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                                aria-label="Close menu"
                            >
                                <CloseIcon className="h-4.5 w-4.5" />
                            </button>
                        </div>

                        <div className="space-y-2">
                            {/* Prominent Join Group Action Card */}
                            <button
                                onClick={() => {
                                    localStorage.setItem("coroomies_open_join", "1");
                                    navigate("groups");
                                }}
                                className="flex w-full items-center gap-3.5 rounded-2xl p-3 bg-gradient-to-r from-brand-50 to-violet-50 dark:from-brand-950/70 dark:to-violet-950/50 border border-brand-200/90 dark:border-brand-800/70 text-left transition-all hover:scale-[1.01] active:scale-[0.99] shadow-sm mb-3"
                            >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-violet-600 text-white shadow-sm">
                                    <HouseIcon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-brand-900 dark:text-brand-100 flex items-center gap-2">
                                        Join a Living Group
                                        <span className="rounded-full bg-brand-500/15 dark:bg-brand-500/25 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:text-brand-300">Invite Code</span>
                                    </p>
                                    <p className="text-xs text-brand-700/80 dark:text-brand-300/80 truncate">
                                        Enter an invite code or open a share link
                                    </p>
                                </div>
                                <ArrowRightIcon className="h-4 w-4 shrink-0 text-brand-500" />
                            </button>

                            {[
                                { key: "groups", label: "Living Groups", desc: "Manage members, group invite codes & split expenses", icon: HouseIcon, color: "bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300" },
                                { key: "household", label: "Household", desc: "Chores schedule, shared flat rules & reliability scores", icon: CheckCircleIcon, color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300" },
                                { key: "assistant", label: "Conflict Assistant", desc: "AI mediation & fair dispute resolution", icon: SparklesIcon, color: "bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300" },
                                { key: "profile", label: "My Profile", desc: "Lifestyle preferences, budget, habits & bio", icon: UserRoundIcon, color: "bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300" },
                                { key: "settings", label: "Settings", desc: "Account security, password & UPI ID", icon: SettingsIcon, color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
                                { key: "rooms", label: "Rooms & Vacancies", desc: "Publish listings and apply to living groups", icon: BuildingIcon, color: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300" },
                            ].map(({ key, label, desc, icon: ItemIcon, color }) => {
                                const active = page === key;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => navigate(key)}
                                        className={`flex w-full items-center gap-3.5 rounded-2xl p-3 text-left transition-all ${
                                            active
                                                ? "bg-brand-50/90 ring-1 ring-brand-300/80 dark:bg-brand-950/40 dark:ring-brand-700/60"
                                                : "hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-800/60"
                                        }`}
                                    >
                                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
                                            <ItemIcon className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-sm font-semibold ${active ? "text-brand-700 dark:text-brand-300" : "text-slate-900 dark:text-slate-100"}`}>
                                                {label}
                                            </p>
                                            <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                                                {desc}
                                            </p>
                                        </div>
                                        <ArrowRightIcon className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-600" />
                                    </button>
                                );
                            })}

                            <div className="my-2 border-t border-slate-100 dark:border-slate-800" />

                            <button
                                onClick={() => {
                                    setMoreOpen(false);
                                    handleLogout();
                                }}
                                className="flex w-full items-center gap-3.5 rounded-2xl p-3 text-left text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                            >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                                    <LogoutIcon className="h-5 w-5" />
                                </div>
                                <span className="text-sm font-semibold">Log out</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;
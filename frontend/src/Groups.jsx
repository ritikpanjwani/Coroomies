import { useCallback, useEffect, useRef, useState } from "react";
import api, { API_BASE } from "./api";
import Avatar from "./components/ui/Avatar";
import Badge from "./components/ui/Badge";
import Button from "./components/ui/Button";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import Modal from "./components/ui/Modal";
import Spinner from "./components/ui/Spinner";
import { Input, Textarea } from "./components/ui/Field";
import { useToast } from "./components/Toast";
import {
    ArrowLeftIcon,
    CameraIcon,
    CheckCircleIcon,
    CheckIcon,
    CopyIcon,
    ShieldCheckIcon,
    PencilIcon,
    PlusIcon,
    RefreshCwIcon,
    SendIcon,
    Trash2Icon,
    UserRoundIcon,
    UserRoundMinusIcon,
    UsersRoundIcon,
    HouseIcon,
    LogoutIcon,
    ChevronDownIcon,
    EllipsisVerticalIcon,
    Share2Icon,
    BellIcon,
    BellOffIcon,
    UserRoundPlusIcon,
    SettingsIcon,
    SearchIcon,
    ClockIcon,
    AlertIcon,
    XIcon,
} from "./components/Icons";
import { formatTime, formatDate, errorMessage, formatCurrency } from "./utils/format";
import {
    ExpenseBubble,
    ExpenseDetailModal,
    GroupExpensesPanel,
    SettleUpModal,
    SplitExpenseModal,
} from "./GroupExpenses";
import UpiPaymentModal from "./components/UpiPaymentModal";

const STATUS_LABELS = {
    active: "Member",
    pending: "Pending approval",
    left: "Left",
    removed: "Removed",
};

function StatusBadge({ status, role, className = "" }) {
    if (role === "admin") {
        return (
            <Badge variant="brand" dot className={className}>
                <ShieldCheckIcon className="h-3 w-3" /> Admin
            </Badge>
        );
    }
    const variant =
        status === "active"
            ? "success"
            : status === "pending"
            ? "warning"
            : "neutral";
    return (
        <Badge variant={variant} dot className={className}>
            {STATUS_LABELS[status] || status}
        </Badge>
    );
}

/* ---------------- Member Profile Modal ---------------- */
function MemberProfileModal({ open, onClose, groupId, member }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || !groupId || !member) {
            return;
        }
        let active = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        api.get(`/groups/${groupId}/members/${member.member_id}/profile`)
            .then((res) => {
                if (active) setProfile(res.data.profile);
            })
            .catch((err) => {
                console.error("Could not load member profile:", err);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [open, groupId, member]);

    if (!open) return null;

    return (
        <Modal open={open} onClose={onClose} title="Member Profile">
            {loading ? (
                <div className="flex justify-center py-12">
                    <Spinner size="lg" />
                </div>
            ) : !profile ? (
                <div className="py-8 text-center text-slate-500 dark:text-slate-400">
                    Could not load profile details.
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Header info */}
                    <div className="flex items-center gap-3.5 border-b border-slate-100 dark:border-slate-700/80 pb-4">
                        <Avatar
                            name={profile.name}
                            src={profile.avatar_url ? `${API_BASE}${profile.avatar_url}` : undefined}
                            size="lg"
                        />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="truncate text-base font-bold text-slate-900 dark:text-slate-100">
                                    {profile.name}
                                </h3>
                                {profile.role === "admin" && (
                                    <Badge variant="brand" className="shrink-0">
                                        <ShieldCheckIcon className="h-3 w-3" /> Admin
                                    </Badge>
                                )}
                            </div>
                            {profile.email && (
                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                    {profile.email}
                                </p>
                            )}
                            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                                Joined {profile.joined_at ? formatDate(profile.joined_at) : "recently"}
                            </p>
                        </div>
                    </div>

                    {/* Bio */}
                    {profile.bio && (
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                About
                            </p>
                            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700/60">
                                {profile.bio}
                            </p>
                        </div>
                    )}

                    {/* Lifestyle Preferences */}
                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Lifestyle & Roommate Habits
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/40 p-2.5">
                                <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Budget</span>
                                <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block">
                                    {profile.budget_min || profile.budget_max
                                        ? `${formatCurrency(profile.budget_min || 0)} - ${formatCurrency(profile.budget_max || 0)}`
                                        : "Flexible"}
                                </span>
                            </div>

                            <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/40 p-2.5">
                                <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Sleep Schedule</span>
                                <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block capitalize">
                                    {profile.sleep_schedule || "Flexible"}
                                </span>
                            </div>

                            <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/40 p-2.5">
                                <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Cleanliness</span>
                                <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block capitalize">
                                    {profile.cleanliness || "Moderate"}
                                </span>
                            </div>

                            <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/40 p-2.5">
                                <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Food Preference</span>
                                <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block capitalize">
                                    {profile.food_preference || "Any"}
                                </span>
                            </div>

                            <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/40 p-2.5">
                                <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Location</span>
                                <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block truncate">
                                    {profile.preferred_location || "Not specified"}
                                </span>
                            </div>

                            <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/40 p-2.5">
                                <span className="text-slate-400 dark:text-slate-500 block text-[10px] uppercase font-bold">Move-in</span>
                                <span className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 block">
                                    {profile.move_in_date ? formatDate(profile.move_in_date) : "Flexible"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <Button variant="secondary" fullWidth onClick={onClose}>
                            Close
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
}

/* ---------------- Group Notification Settings Modal ---------------- */
function GroupNotificationModal({ open, onClose, groupId, initialSettings, onSaved }) {
    const [settings, setSettings] = useState({
        is_muted: false,
        mute_messages: false,
        mute_expenses: false,
        mute_activity: false,
    });
    const [saving, setSaving] = useState(false);
    const toast = useToast();

    useEffect(() => {
        if (!open || !groupId) return;
        if (initialSettings) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSettings({
                is_muted: !!initialSettings.is_muted,
                mute_messages: !!initialSettings.mute_messages,
                mute_expenses: !!initialSettings.mute_expenses,
                mute_activity: !!initialSettings.mute_activity,
            });
        }
        api.get(`/groups/${groupId}/notifications`)
            .then((res) => {
                if (res.data?.settings) {
                    setSettings({
                        is_muted: !!res.data.settings.is_muted,
                        mute_messages: !!res.data.settings.mute_messages,
                        mute_expenses: !!res.data.settings.mute_expenses,
                        mute_activity: !!res.data.settings.mute_activity,
                    });
                }
            })
            .catch(() => null);
    }, [open, groupId, initialSettings]);

    const handleSave = async () => {
        try {
            setSaving(true);
            const res = await api.put(`/groups/${groupId}/notifications`, settings);
            toast.success("Notification preferences saved");
            if (onSaved) onSaved(res.data.settings);
            onClose();
        } catch (err) {
            toast.error(errorMessage(err, "Could not update notification settings"));
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <Modal open={open} onClose={onClose} title="Group Notifications">
            <div className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Customize your notifications for this living group. Settings only apply to your account.
                </p>

                {/* Master Mute */}
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-3.5">
                    <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${settings.is_muted ? "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400" : "bg-brand-100 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300"}`}>
                            {settings.is_muted ? <BellOffIcon className="h-5 w-5" /> : <BellIcon className="h-5 w-5" />}
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                Mute All Notifications
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                Silence all notifications from this group
                            </p>
                        </div>
                    </div>
                    <input
                        type="checkbox"
                        checked={settings.is_muted}
                        onChange={(e) =>
                            setSettings((prev) => ({ ...prev, is_muted: e.target.checked }))
                        }
                        className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                </div>

                {/* Granular options */}
                <div className={`space-y-2.5 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-3.5 transition-opacity ${settings.is_muted ? "opacity-50 pointer-events-none" : ""}`}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Granular Preferences
                    </p>

                    <label className="flex items-center justify-between py-1 cursor-pointer">
                        <div>
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                Mute Group Messages
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                Stop notifications when flatmates send chat messages
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            checked={settings.mute_messages}
                            onChange={(e) =>
                                setSettings((prev) => ({
                                    ...prev,
                                    mute_messages: e.target.checked,
                                }))
                            }
                            className="h-4.5 w-4.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                    </label>

                    <div className="border-t border-slate-100 dark:border-slate-700/60" />

                    <label className="flex items-center justify-between py-1 cursor-pointer">
                        <div>
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                Mute Expenses & Splits
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                Stop alerts for newly added shared expenses
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            checked={settings.mute_expenses}
                            onChange={(e) =>
                                setSettings((prev) => ({
                                    ...prev,
                                    mute_expenses: e.target.checked,
                                }))
                            }
                            className="h-4.5 w-4.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                    </label>

                    <div className="border-t border-slate-100 dark:border-slate-700/60" />

                    <label className="flex items-center justify-between py-1 cursor-pointer">
                        <div>
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                Mute Group Activity
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                Stop alerts when members join, leave, or roles change
                            </p>
                        </div>
                        <input
                            type="checkbox"
                            checked={settings.mute_activity}
                            onChange={(e) =>
                                setSettings((prev) => ({
                                    ...prev,
                                    mute_activity: e.target.checked,
                                }))
                            }
                            className="h-4.5 w-4.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                    </label>
                </div>

                <div className="flex gap-3 pt-2">
                    <Button variant="secondary" fullWidth onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button fullWidth onClick={handleSave} loading={saving}>
                        Save Preferences
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

/* ---------------- Add People Modal ---------------- */
function AddPeopleModal({ open, onClose, group, onInviteSent }) {
    const [tab, setTab] = useState("share"); // "share" | "connections"
    const [candidates, setCandidates] = useState([]);
    const [loadingCandidates, setLoadingCandidates] = useState(false);
    const [customIdentifier, setCustomIdentifier] = useState("");
    const [invitingId, setInvitingId] = useState(null);
    const [invitingCustom, setInvitingCustom] = useState(false);
    const [copiedCode, setCopiedCode] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const toast = useToast();

    const inviteLink = `${window.location.origin}/?join=${group?.invite_code || ""}`;

    useEffect(() => {
        if (!open || !group?.id) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoadingCandidates(true);
        api.get(`/groups/${group.id}/invite-candidates`)
            .then((res) => {
                setCandidates(res.data.candidates || []);
            })
            .catch(() => setCandidates([]))
            .finally(() => setLoadingCandidates(false));
    }, [open, group?.id]);

    const copyCode = async () => {
        if (!group?.invite_code) return;
        try {
            await navigator.clipboard.writeText(group.invite_code);
            setCopiedCode(true);
            toast.success("Invite code copied to clipboard!");
            setTimeout(() => setCopiedCode(false), 2000);
        } catch {
            toast.error("Could not copy code");
        }
    };

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(inviteLink);
            setCopiedLink(true);
            toast.success("Shareable link copied to clipboard!");
            setTimeout(() => setCopiedLink(false), 2000);
        } catch {
            toast.error("Could not copy link");
        }
    };

    const shareNative = async () => {
        if (!navigator.share) {
            copyLink();
            return;
        }
        try {
            await navigator.share({
                title: `${group?.name} on CoRoomies`,
                text: `Join our living group "${group?.name}" on CoRoomies! Use invite code: ${group?.invite_code}`,
                url: inviteLink,
            });
        } catch (err) {
            if (err.name !== "AbortError") {
                copyLink();
            }
        }
    };

    const inviteCandidate = async (candidate) => {
        try {
            setInvitingId(candidate.user_id);
            await api.post(`/groups/${group.id}/invite`, { user_id: candidate.user_id });
            toast.success(`Invitation sent to ${candidate.name}!`);
            setCandidates((prev) => prev.filter((c) => c.user_id !== candidate.user_id));
            if (onInviteSent) onInviteSent();
        } catch (err) {
            toast.error(errorMessage(err, "Could not send invitation"));
        } finally {
            setInvitingId(null);
        }
    };

    const inviteCustom = async () => {
        if (!customIdentifier.trim()) return;
        try {
            setInvitingCustom(true);
            const res = await api.post(`/groups/${group.id}/invite`, {
                identifier: customIdentifier.trim(),
            });
            toast.success(res.data.message || "Invitation sent!");
            setCustomIdentifier("");
            if (onInviteSent) onInviteSent();
        } catch (err) {
            toast.error(errorMessage(err, "Could not send invitation"));
        } finally {
            setInvitingCustom(false);
        }
    };

    if (!open) return null;

    return (
        <Modal open={open} onClose={onClose} title="Add People to Living Group">
            <div className="space-y-4">
                {/* Tabs */}
                <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                    <button
                        onClick={() => setTab("share")}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                            tab === "share"
                                ? "bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-300 shadow-sm"
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-800"
                        }`}
                    >
                        Share Code & Link
                    </button>
                    <button
                        onClick={() => setTab("connections")}
                        className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                            tab === "connections"
                                ? "bg-white dark:bg-slate-700 text-brand-700 dark:text-brand-300 shadow-sm"
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-800"
                        }`}
                    >
                        Invite Flatmates ({candidates.length})
                    </button>
                </div>

                {tab === "share" ? (
                    <div className="space-y-4 pt-1">
                        {/* Invite Code Card */}
                        <div className="rounded-2xl border border-brand-200/80 dark:border-brand-800/80 bg-gradient-to-br from-brand-50/60 to-violet-50/60 dark:from-brand-950/40 dark:to-violet-950/30 p-4 text-center">
                            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                                Group Invite Code
                            </p>
                            <div className="mt-2 flex items-center justify-center gap-3">
                                <span className="font-mono text-2xl font-black tracking-widest text-slate-900 dark:text-slate-100">
                                    {group?.invite_code || "--------"}
                                </span>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={copyCode}
                                    className="gap-1.5"
                                >
                                    {copiedCode ? <CheckIcon className="h-4 w-4 text-emerald-500" /> : <CopyIcon className="h-4 w-4" />}
                                    <span>{copiedCode ? "Copied!" : "Copy"}</span>
                                </Button>
                            </div>
                            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                                Flatmates can enter this code in CoRoomies to request to join.
                            </p>
                        </div>

                        {/* Shareable Link Box */}
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 block">
                                Shareable Invite Link
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={inviteLink}
                                    className="min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
                                />
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={copyLink}
                                    className="shrink-0 gap-1.5"
                                >
                                    {copiedLink ? <CheckIcon className="h-4 w-4 text-emerald-500" /> : <CopyIcon className="h-4 w-4" />}
                                    <span>{copiedLink ? "Copied" : "Copy"}</span>
                                </Button>
                            </div>
                        </div>

                        {/* Native Share button */}
                        <Button
                            fullWidth
                            onClick={shareNative}
                            className="gap-2"
                        >
                            <Share2Icon className="h-4 w-4" />
                            <span>Share Invite Link</span>
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4 pt-1">
                        {/* Direct invite by username or email */}
                        <div>
                            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 block">
                                Direct Invite by Username or Email
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Enter username or email"
                                    value={customIdentifier}
                                    onChange={(e) => setCustomIdentifier(e.target.value)}
                                    className="min-w-0 flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:border-brand-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                                />
                                <Button
                                    size="sm"
                                    onClick={inviteCustom}
                                    loading={invitingCustom}
                                    disabled={!customIdentifier.trim()}
                                >
                                    Invite
                                </Button>
                            </div>
                        </div>

                        {/* Connected Roommates eligible for invite */}
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                                Connected Flatmates
                            </p>
                            {loadingCandidates ? (
                                <div className="flex justify-center py-6">
                                    <Spinner size="md" />
                                </div>
                            ) : candidates.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700/80 p-4 text-center">
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        No connected flatmates available to invite right now.
                                    </p>
                                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                                        You can share the invite code or link above instead.
                                    </p>
                                </div>
                            ) : (
                                <div className="max-h-56 space-y-2 overflow-y-auto">
                                    {candidates.map((c) => (
                                        <div
                                            key={c.user_id}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-700/70 bg-slate-50/60 dark:bg-slate-800/50 p-2.5"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                <Avatar
                                                    name={c.name}
                                                    src={c.avatar_url ? `${API_BASE}${c.avatar_url}` : undefined}
                                                    size="sm"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                                                        {c.name}
                                                    </p>
                                                    <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                                                        {c.preferred_location ? `${c.preferred_location} · ` : ""}
                                                        {c.budget_max ? formatCurrency(c.budget_max) : "Flexible"}
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                className="shrink-0 text-xs px-2.5 py-1"
                                                onClick={() => inviteCandidate(c)}
                                                loading={invitingId === c.user_id}
                                            >
                                                Invite
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                    <Button variant="secondary" fullWidth onClick={onClose}>
                        Done
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

/* ---------------- Join Group Modal with Preview ---------------- */
function JoinGroupModal({ open, onClose, onJoined, initialCode = "" }) {
    const [code, setCode] = useState(initialCode);
    const [preview, setPreview] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [previewError, setPreviewError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const toast = useToast();

    useEffect(() => {
        if (initialCode) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setCode(initialCode.toUpperCase());
        }
    }, [initialCode]);

    useEffect(() => {
        const trimmed = code.trim().toUpperCase();
        if (trimmed.length < 4) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPreview(null);
            setPreviewError(null);
            return;
        }

        let active = true;
        const timer = setTimeout(async () => {
            try {
                setLoadingPreview(true);
                setPreviewError(null);
                const res = await api.get(`/groups/preview/${trimmed}`);
                if (active) setPreview(res.data);
            } catch (err) {
                if (active) {
                    setPreview(null);
                    setPreviewError(err.response?.data?.detail || "Invalid invite code");
                }
            } finally {
                if (active) setLoadingPreview(false);
            }
        }, 300);

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [code]);

    const handleSubmit = async () => {
        if (!code.trim()) return;
        try {
            setSubmitting(true);
            const res = await api.post("/groups/join", {
                invite_code: code.trim().toUpperCase(),
            });
            toast.success(res.data.message || "Join request submitted! Waiting for admin approval.");
            onClose();
            setCode("");
            setPreview(null);
            if (onJoined) onJoined();
        } catch (err) {
            toast.error(errorMessage(err, "Could not join group"));
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <Modal open={open} onClose={onClose} title="Join a Living Group">
            <div className="space-y-4">
                <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5 block">
                        Invite Code
                    </label>
                    <input
                        type="text"
                        placeholder="e.g. AB12CD34"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        autoFocus
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 font-mono text-center text-lg font-bold tracking-widest text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none uppercase"
                    />
                </div>

                {/* Preview State */}
                {loadingPreview && (
                    <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-500">
                        <Spinner size="sm" />
                        <span>Validating invite code...</span>
                    </div>
                )}

                {previewError && !loadingPreview && (
                    <div className="flex items-center gap-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/40">
                        <AlertIcon className="h-4 w-4 shrink-0" />
                        <span>{previewError}</span>
                    </div>
                )}

                {preview && !loadingPreview && (
                    <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 p-4 animate-fade-in">
                        <div className="flex items-center gap-3">
                            <Avatar
                                name={preview.name}
                                src={preview.avatar_url ? `${API_BASE}${preview.avatar_url}` : undefined}
                                size="md"
                            />
                            <div className="min-w-0 flex-1">
                                <h4 className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                                    {preview.name}
                                </h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Admin: <span className="font-medium text-slate-700 dark:text-slate-200">{preview.admin_name || "Group Admin"}</span>
                                </p>
                            </div>
                            <span className="shrink-0 rounded-full bg-brand-100 dark:bg-brand-900/60 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:text-brand-300">
                                {preview.member_count} {preview.member_count === 1 ? "member" : "members"}
                            </span>
                        </div>

                        {preview.description && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
                                {preview.description}
                            </p>
                        )}

                        {preview.my_status === "pending" && (
                            <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 p-2.5 text-xs text-amber-700 dark:text-amber-300 border border-amber-200/60">
                                <ClockIcon className="h-4 w-4 shrink-0" />
                                <span>You already have a pending join request for this group. Waiting for admin approval.</span>
                            </div>
                        )}

                        {preview.my_status === "active" && (
                            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 p-2.5 text-xs text-emerald-700 dark:text-emerald-300 border border-emerald-200/60">
                                <CheckCircleIcon className="h-4 w-4 shrink-0" />
                                <span>You are already an active member of this group.</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex gap-3 pt-2">
                    <Button variant="secondary" fullWidth onClick={onClose} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button
                        fullWidth
                        onClick={handleSubmit}
                        loading={submitting}
                        disabled={!code.trim() || !preview || !preview.can_join}
                    >
                        Request to Join
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

/* ---------------- Main Living Groups Screen ---------------- */
function Groups() {
    const [groups, setGroups] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState(() => {
        const stored = localStorage.getItem("groups_id");
        if (stored) {
            const id = Number(stored);
            return !Number.isNaN(id) && id > 0 ? id : null;
        }
        return null;
    });
    const [detail, setDetail] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [currentUserId, setCurrentUserId] = useState(() => {
        const cached = localStorage.getItem("user_id");
        return cached ? Number(cached) : null;
    });
    const [text, setText] = useState("");
    const [sendingMessage, setSendingMessage] = useState(false);
    const [mobileView, setMobileView] = useState(() => {
        const stored = localStorage.getItem("groups_id");
        if (stored) {
            localStorage.removeItem("groups_id");
            return "detail";
        }
        return "list";
    });

    // Modals
    const [createOpen, setCreateOpen] = useState(false);
    const [joinOpen, setJoinOpen] = useState(false);
    const [initialJoinCode, setInitialJoinCode] = useState("");
    const [addPeopleOpen, setAddPeopleOpen] = useState(false);
    const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
    const [profileModalTarget, setProfileModalTarget] = useState(null);
    const [groupMenuOpen, setGroupMenuOpen] = useState(false);
    const [memberMenuId, setMemberMenuId] = useState(null);

    // Group editing
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [creating, setCreating] = useState(false);
    const [editInfoOpen, setEditInfoOpen] = useState(false);
    const [groupInfo, setGroupInfo] = useState({ name: "", description: "" });
    const [savingGroupInfo, setSavingGroupInfo] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);

    // Action targets
    const [leaveTarget, setLeaveTarget] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(false);
    const [removeTarget, setRemoveTarget] = useState(null);
    const [transferTarget, setTransferTarget] = useState(null);
    const [demoteTarget, setDemoteTarget] = useState(null);
    const [acting, setActing] = useState(false);

    // Search filter for members
    const [memberSearch, setMemberSearch] = useState("");

    // Shared expenses
    const [sharedExpenses, setSharedExpenses] = useState([]);
    const [expBalances, setExpBalances] = useState(null);
    const [expMembers, setExpMembers] = useState([]);
    const [expSettlements, setExpSettlements] = useState([]);
    const [settleTargetMember, setSettleTargetMember] = useState(null);
    const [loadingExpenses, setLoadingExpenses] = useState(false);
    const [splitOpen, setSplitOpen] = useState(false);
    const [settleOpen, setSettleOpen] = useState(false);
    const [detailExpense, setDetailExpense] = useState(null);
    const payingShare = false;
    const [reminding, setReminding] = useState(false);
    const [creatingShared, setCreatingShared] = useState(false);
    const [deleteExpenseTarget, setDeleteExpenseTarget] = useState(null);
    const [deletingExpense, setDeletingExpense] = useState(false);
    const [upiModalState, setUpiModalState] = useState({
        open: false,
        expense: null,
        share: null,
        owedItem: null,
    });

    const avatarInputRef = useRef(null);
    const messagesRef = useRef(null);
    const groupMenuRef = useRef(null);
    const isNearBottomRef = useRef(true);
    const lastGroupIdRef = useRef(null);
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const toast = useToast();

    // Deep link or More-menu open join handling
    useEffect(() => {
        const code = localStorage.getItem("coroomies_join_code");
        const openJoin = localStorage.getItem("coroomies_open_join");
        if (code) {
            localStorage.removeItem("coroomies_join_code");
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setInitialJoinCode(code);
            setJoinOpen(true);
        } else if (openJoin) {
            localStorage.removeItem("coroomies_open_join");
            setJoinOpen(true);
        }
    }, []);

    // Close menus on outside click
    useEffect(() => {
        const handleOutsideClick = (e) => {
            if (groupMenuRef.current && !groupMenuRef.current.contains(e.target)) {
                setGroupMenuOpen(false);
            }
            if (memberMenuId !== null && !e.target.closest("[data-member-menu]")) {
                setMemberMenuId(null);
            }
        };
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [memberMenuId]);

    useEffect(() => {
        api.get("/auth/me")
            .then((res) => setCurrentUserId(res.data.user_id))
            .catch((error) => console.error("Failed to get user info:", error));
    }, []);

    const canEditGroup = detail?.my_status === "active";

    const loadGroups = useCallback(async () => {
        try {
            const response = await api.get("/groups/");
            const list = response.data.groups || [];
            setGroups(list);
            setSelectedGroupId((prev) => {
                if (prev && list.some((g) => g.group_id === prev)) {
                    return prev;
                }
                const firstActive = list.find((g) => g.status === "active") || list[0];
                return firstActive ? firstActive.group_id : null;
            });
        } catch (error) {
            console.error(error.response?.data);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadDetail = useCallback(
        async (groupId) => {
            try {
                const response = await api.get(`/groups/${groupId}`);
                setDetail(response.data.group);
            } catch (error) {
                toast.error(errorMessage(error, "Failed to load group"));
                setDetail(null);
                setSelectedGroupId(null);
            }
        },
        [toast]
    );

    const loadMessages = useCallback(async (groupId) => {
        try {
            setLoadingMessages(true);
            const response = await api.get(`/groups/${groupId}/messages`);
            setMessages(response.data.messages || []);
        } catch (error) {
            console.error(error.response?.data);
        } finally {
            setLoadingMessages(false);
        }
    }, []);

    const loadGroupExpenses = useCallback(async (groupId) => {
        if (!groupId) return;
        try {
            setLoadingExpenses(true);
            const [expRes, balRes, memRes, setRes] = await Promise.all([
                api.get("/shared-expenses/", { params: { group_id: groupId } }),
                api.get("/shared-expenses/balances", { params: { group_id: groupId } }),
                api.get("/shared-expenses/members", { params: { group_id: groupId } }),
                api.get("/shared-expenses/settlements", { params: { group_id: groupId } }).catch(() => ({ data: { settlements: [] } })),
            ]);
            setSharedExpenses(expRes.data.expenses || []);
            setExpBalances(balRes.data);
            setExpMembers(memRes.data.members || []);
            setExpSettlements(setRes.data.settlements || []);
        } catch (error) {
            console.error(error.response?.data);
        } finally {
            setLoadingExpenses(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadGroups();
        const interval = setInterval(loadGroups, 10000);
        return () => clearInterval(interval);
    }, [loadGroups]);

    useEffect(() => {
        if (!selectedGroupId) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadDetail(selectedGroupId);
    }, [selectedGroupId, loadDetail]);

    const selectGroup = async (groupId) => {
        setSelectedGroupId(groupId);
        setMobileView("detail");
        setDetailTab("chat");
        setDetail(null);
        setMessages([]);
        setSharedExpenses([]);
        setExpBalances(null);
        setExpMembers([]);
        setExpSettlements([]);
        try {
            const response = await api.get(`/groups/${groupId}`);
            setDetail(response.data.group);
            if (response.data.group.my_status === "active") {
                await Promise.all([
                    loadMessages(groupId),
                    loadGroupExpenses(groupId),
                ]);
            }
        } catch (error) {
            console.error(error);
            toast.error("Failed to load group details");
        }
    };

    const refreshActiveGroup = useCallback(async () => {
        if (!selectedGroupId || !detail || detail.my_status !== "active") return;
        try {
            const [msgRes, grpRes, expRes, balRes, memRes] = await Promise.all([
                api.get(`/groups/${selectedGroupId}/messages`),
                api.get(`/groups/${selectedGroupId}`),
                api.get("/shared-expenses/", { params: { group_id: selectedGroupId } }),
                api.get("/shared-expenses/balances", { params: { group_id: selectedGroupId } }),
                api.get("/shared-expenses/members", { params: { group_id: selectedGroupId } }),
            ]);
            setMessages(msgRes.data.messages || []);
            if (grpRes.data?.group) {
                setDetail(grpRes.data.group);
            }
            setSharedExpenses(expRes.data.expenses || []);
            setExpBalances(balRes.data);
            setExpMembers(memRes.data.members || []);
        } catch {
            // Ignore background polling errors
        }
    }, [selectedGroupId, detail]);

    useEffect(() => {
        if (!selectedGroupId || !detail || detail.my_status !== "active") return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        refreshActiveGroup();
        const interval = setInterval(refreshActiveGroup, 4000);
        return () => clearInterval(interval);
    }, [selectedGroupId, detail, refreshActiveGroup]);

    const handleMessagesScroll = () => {
        if (!messagesRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = messagesRef.current;
        const nearBottom = scrollHeight - scrollTop - clientHeight < 120;
        isNearBottomRef.current = nearBottom;
        setShowScrollBottom(!nearBottom);
    };

    const scrollToBottom = () => {
        if (messagesRef.current) {
            messagesRef.current.scrollTo({
                top: messagesRef.current.scrollHeight,
                behavior: "smooth",
            });
            isNearBottomRef.current = true;
            setShowScrollBottom(false);
        }
    };

    useEffect(() => {
        if (messagesRef.current) {
            const groupChanged = lastGroupIdRef.current !== selectedGroupId;
            lastGroupIdRef.current = selectedGroupId;
            if (groupChanged || isNearBottomRef.current) {
                messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
            }
        }
    }, [messages, selectedGroupId]);

    const createGroup = async () => {
        if (!name.trim()) {
            toast.error("Group name is required");
            return;
        }
        try {
            setCreating(true);
            const response = await api.post("/groups/", {
                name: name.trim(),
                description: description.trim() || null,
            });
            toast.success("Group created!");
            setCreateOpen(false);
            setName("");
            setDescription("");
            await loadGroups();
            setSelectedGroupId(response.data.group_id);
            setMobileView("detail");
            await loadDetail(response.data.group_id);
            setMessages([]);
        } catch (error) {
            toast.error(errorMessage(error, "Could not create group"));
        } finally {
            setCreating(false);
        }
    };

    const openEditGroupInfo = () => {
        setGroupInfo({
            name: detail?.name || "",
            description: detail?.description || "",
        });
        setEditInfoOpen(true);
    };

    const saveGroupInfo = async () => {
        if (!groupInfo.name.trim()) {
            toast.error("Group name cannot be empty");
            return;
        }
        try {
            setSavingGroupInfo(true);
            await api.put(`/groups/${selectedGroupId}`, {
                name: groupInfo.name.trim(),
                description: groupInfo.description.trim(),
            });
            toast.success("Group updated");
            setEditInfoOpen(false);
            await Promise.all([loadDetail(selectedGroupId), loadGroups()]);
        } catch (error) {
            toast.error(errorMessage(error, "Could not update the group"));
        } finally {
            setSavingGroupInfo(false);
        }
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";

        if (file.size > 5 * 1024 * 1024) {
            toast.error("File must be under 5 MB");
            return;
        }
        if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
            toast.error("Only JPG, PNG, GIF, and WebP images are allowed");
            return;
        }

        try {
            setUploadingAvatar(true);
            const formData = new FormData();
            formData.append("file", file);
            await api.post(`/groups/${selectedGroupId}/avatar`, formData, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            toast.success("Group photo updated");
            await Promise.all([loadDetail(selectedGroupId), loadGroups()]);
        } catch (error) {
            toast.error(errorMessage(error, "Could not upload group photo"));
        } finally {
            setUploadingAvatar(false);
        }
    };

    const removeAvatar = async () => {
        try {
            setUploadingAvatar(true);
            await api.delete(`/groups/${selectedGroupId}/avatar`);
            toast.success("Group photo removed");
            await Promise.all([loadDetail(selectedGroupId), loadGroups()]);
        } catch (error) {
            toast.error(errorMessage(error, "Could not remove group photo"));
        } finally {
            setUploadingAvatar(false);
        }
    };

    const leaveGroup = async () => {
        try {
            setActing(true);
            await api.post(`/groups/${selectedGroupId}/leave`);
            toast.success("You left the group");
            setLeaveTarget(false);
            setSelectedGroupId(null);
            setDetail(null);
            setMessages([]);
            setMobileView("list");
            await loadGroups();
        } catch (error) {
            toast.error(errorMessage(error, "Could not leave group"));
        } finally {
            setActing(false);
        }
    };

    const deleteGroup = async () => {
        try {
            setActing(true);
            await api.delete(`/groups/${selectedGroupId}`);
            toast.success("Group deleted");
            setDeleteTarget(false);
            setSelectedGroupId(null);
            setDetail(null);
            setMessages([]);
            setMobileView("list");
            await loadGroups();
        } catch (error) {
            toast.error(errorMessage(error, "Could not delete group"));
        } finally {
            setActing(false);
        }
    };

    const removeMember = async () => {
        try {
            setActing(true);
            await api.post(
                `/groups/${selectedGroupId}/members/${removeTarget.member_id}/remove`
            );
            toast.success(`${removeTarget.name} was removed`);
            setRemoveTarget(null);
            await Promise.all([
                loadDetail(selectedGroupId),
                loadGroups(),
                loadGroupExpenses(selectedGroupId),
            ]);
        } catch (error) {
            toast.error(errorMessage(error, "Could not remove member"));
        } finally {
            setActing(false);
        }
    };

    const promoteMemberToAdmin = async () => {
        try {
            setActing(true);
            await api.post(
                `/groups/${selectedGroupId}/transfer-admin?member_id=${transferTarget.member_id}`
            );
            toast.success(`${transferTarget.name} is now an admin`);
            setTransferTarget(null);
            await Promise.all([loadDetail(selectedGroupId), loadGroups()]);
        } catch (error) {
            toast.error(errorMessage(error, "Could not promote member"));
        } finally {
            setActing(false);
        }
    };

    const demoteAdminToMember = async () => {
        try {
            setActing(true);
            await api.post(
                `/groups/${selectedGroupId}/members/${demoteTarget.member_id}/demote-admin`
            );
            toast.success(`${demoteTarget.name} was demoted to regular member`);
            setDemoteTarget(null);
            await Promise.all([loadDetail(selectedGroupId), loadGroups()]);
        } catch (error) {
            toast.error(errorMessage(error, "Could not demote admin"));
        } finally {
            setActing(false);
        }
    };

    const approveMember = async (member) => {
        try {
            await api.post(
                `/groups/${selectedGroupId}/members/${member.member_id}/approve`
            );
            toast.success(`${member.name} approved`);
            await Promise.all([
                loadDetail(selectedGroupId),
                loadGroups(),
                loadGroupExpenses(selectedGroupId),
            ]);
        } catch (error) {
            toast.error(errorMessage(error, "Could not approve member"));
        }
    };

    const rejectMember = async (member) => {
        try {
            await api.post(
                `/groups/${selectedGroupId}/members/${member.member_id}/reject`
            );
            toast.success(`${member.name} declined`);
            await Promise.all([loadDetail(selectedGroupId), loadGroups()]);
        } catch (error) {
            toast.error(errorMessage(error, "Could not decline member"));
        }
    };

    const sendMessage = async () => {
        if (!text.trim() || sendingMessage) return;
        try {
            setSendingMessage(true);
            await api.post(`/groups/${selectedGroupId}/messages`, {
                content: text.trim(),
            });
            setText("");
            isNearBottomRef.current = true;
            setShowScrollBottom(false);
            await refreshActiveGroup();
            if (messagesRef.current) {
                setTimeout(() => {
                    if (messagesRef.current) {
                        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
                    }
                }, 60);
            }
        } catch (error) {
            toast.error(errorMessage(error, "Could not send message"));
        } finally {
            setSendingMessage(false);
        }
    };

    const openUpiModal = (expense, share = null, owedItem = null) => {
        const myId =
            currentUserId != null
                ? Number(currentUserId)
                : (localStorage.getItem("user_id")
                    ? Number(localStorage.getItem("user_id"))
                    : null);
        const targetShare =
            share ||
            expense?.shares?.find((s) => Number(s.user_id) === myId) ||
            null;
        setUpiModalState({
            open: true,
            expense: expense || null,
            share: targetShare,
            owedItem: owedItem || null,
        });
    };

    const payMyShare = (expense, share = null) => {
        openUpiModal(expense, share);
    };

    const handlePayOwed = (owedItem) => {
        if (!owedItem) return;
        const myId =
            currentUserId != null
                ? Number(currentUserId)
                : (localStorage.getItem("user_id")
                    ? Number(localStorage.getItem("user_id"))
                    : null);

        const matchingExpense = sharedExpenses.find(
            (e) =>
                Number(e.payer_id) === Number(owedItem.to_user_id) &&
                e.shares?.some(
                    (s) => Number(s.user_id) === myId && s.status !== "paid"
                )
        );
        const matchingShare = matchingExpense?.shares?.find(
            (s) => Number(s.user_id) === myId && s.status !== "paid"
        );

        openUpiModal(matchingExpense || null, matchingShare || null, owedItem);
    };

    const sendReminder = async (expense) => {
        try {
            setReminding(true);
            const res = await api.post(`/shared-expenses/${expense.id}/reminder`);
            toast.success(res.data.message || "Reminder sent!");
        } catch (err) {
            toast.error(errorMessage(err, "Could not send reminder"));
        } finally {
            setReminding(false);
        }
    };

    const createSharedExpense = async (payload) => {
        setCreatingShared(true);
        try {
            const response = await api.post("/shared-expenses/", payload);
            await loadGroupExpenses(payload.group_id);
            window.dispatchEvent(new Event("coroomies:refresh-counts"));
            return response.data;
        } finally {
            setCreatingShared(false);
        }
    };

    const deleteSharedExpense = async () => {
        if (!deleteExpenseTarget) return;
        try {
            setDeletingExpense(true);
            await api.delete(`/shared-expenses/${deleteExpenseTarget.id}`);
            toast.success("Expense deleted");
            setDetailExpense(null);
            setDeleteExpenseTarget(null);
            await loadGroupExpenses(selectedGroupId);
        } catch (err) {
            toast.error(errorMessage(err, "Could not delete expense"));
        } finally {
            setDeletingExpense(false);
        }
    };

    const isAdmin = detail?.my_role === "admin";
    const canChat = detail?.my_status === "active";
    const [detailTab, setDetailTab] = useState(() => {
        const stored = localStorage.getItem("groups_tab");
        if (stored) {
            localStorage.removeItem("groups_tab");
            return stored;
        }
        return "chat";
    });

    const pendingMembers =
        detail?.members?.filter((m) => m.status === "pending") || [];
    const activeMembers =
        detail?.members?.filter((m) => m.status === "active") || [];
    const filteredActiveMembers = activeMembers.filter((m) =>
        m.name?.toLowerCase().includes(memberSearch.toLowerCase().trim())
    );

    return (
        <div
            className={`flex overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 shadow-sm ${
                mobileView === "detail"
                    ? "app-panel h-[calc(100dvh-11rem)] sm:h-[calc(100vh-140px)] min-h-[380px] sm:min-h-[580px] max-h-[850px]"
                    : "h-auto sm:app-panel sm:h-[calc(100vh-140px)] sm:min-h-[580px] sm:max-h-[850px]"
            }`}
        >
            {/* Group List Column */}
            <div
                className={`w-full min-h-0 flex-col border-r border-slate-200 dark:border-slate-700/80 sm:flex sm:w-80 sm:shrink-0 ${
                    mobileView === "detail" ? "hidden" : "flex"
                }`}
            >
                <div className="border-b border-slate-100 dark:border-slate-700 p-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                            Living Groups
                        </h2>
                        <button
                            onClick={loadGroups}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-300"
                            title="Refresh"
                        >
                            <RefreshCwIcon className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button
                            size="sm"
                            className="w-full min-h-[40px] text-xs font-semibold justify-center"
                            onClick={() => setCreateOpen(true)}
                        >
                            <PlusIcon className="h-3.5 w-3.5 shrink-0" />
                            <span>New Group</span>
                        </Button>
                        <Button
                            size="sm"
                            variant="secondary"
                            className="w-full min-h-[40px] text-xs font-semibold justify-center"
                            onClick={() => {
                                setInitialJoinCode("");
                                setJoinOpen(true);
                            }}
                        >
                            <HouseIcon className="h-3.5 w-3.5 shrink-0" />
                            <span>Join Group</span>
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loading && groups.length === 0 ? (
                        <div className="flex justify-center py-10">
                            <Spinner />
                        </div>
                    ) : groups.length === 0 ? (
                        <div className="p-6 text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-300">
                                <HouseIcon className="h-6 w-6" />
                            </div>
                            <h4 className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
                                No groups yet
                            </h4>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Create a living group for your flat or join with an invite code.
                            </p>
                            <div className="mt-4 flex flex-col gap-2">
                                <Button
                                    size="sm"
                                    onClick={() => setCreateOpen(true)}
                                    className="w-full text-xs"
                                >
                                    <PlusIcon className="h-3.5 w-3.5" /> Create Group
                                </Button>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                        setInitialJoinCode("");
                                        setJoinOpen(true);
                                    }}
                                    className="w-full text-xs"
                                >
                                    <HouseIcon className="h-3.5 w-3.5" /> Join with Code
                                </Button>
                            </div>
                        </div>
                    ) : (
                        groups.map((group) => {
                            const isSelected = selectedGroupId === group.group_id;
                            return (
                                <button
                                    key={group.group_id}
                                    onClick={() => selectGroup(group.group_id)}
                                    className={`flex w-full items-center gap-3 border-l-4 px-4 py-3.5 text-left transition-all ${
                                        isSelected
                                            ? "border-brand-600 bg-brand-50/80 dark:bg-brand-950/40 shadow-sm"
                                            : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                    }`}
                                >
                                    <Avatar name={group.name} size="md" className="shrink-0" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p
                                                className={`truncate text-sm font-semibold ${
                                                    isSelected
                                                        ? "text-brand-900 dark:text-brand-100"
                                                        : "text-slate-800 dark:text-slate-200"
                                                }`}
                                            >
                                                {group.name}
                                            </p>
                                            <StatusBadge
                                                status={group.status}
                                                role={group.role}
                                            />
                                        </div>
                                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                                            <UsersRoundIcon className="h-3 w-3 shrink-0" />
                                            <span>
                                                {group.member_count}{" "}
                                                {group.member_count === 1 ? "member" : "members"}
                                            </span>
                                            {group.role === "admin" && (
                                                <span className="font-medium text-brand-600 dark:text-brand-400">
                                                    · Admin
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Group Detail / Workspace Column */}
            <div
                className={`flex-1 min-h-0 min-w-0 flex-col overflow-hidden sm:flex ${
                    mobileView === "detail" ? "flex" : "hidden"
                }`}
            >
                {!detail ? (
                    <div className="flex flex-1 flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/60 p-8 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-violet-500 text-white shadow-lg shadow-brand-500/25">
                            <HouseIcon className="h-8 w-8" />
                        </div>
                        <h3 className="mt-4 text-lg font-bold text-slate-800 dark:text-slate-200">
                            Living Group Workspace
                        </h3>
                        <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                            Select a group from the list, or create/join a group to manage shared flat expenses, chores, and group chat.
                        </p>
                        <div className="mt-4 flex gap-2">
                            <Button
                                size="sm"
                                
                                onClick={() => setCreateOpen(true)}
                            >
                                <PlusIcon className="h-4 w-4" /> Create Group
                            </Button>
                            <Button
                                size="sm"
                                variant="secondary"
                                
                                onClick={() => {
                                    setInitialJoinCode("");
                                    setJoinOpen(true);
                                }}
                            >
                                <HouseIcon className="h-4 w-4" /> Join Group
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
                        {/* Aligned Group Header */}
                        <div className="flex items-center gap-2.5 sm:gap-3 border-b border-slate-100 dark:border-slate-700/80 px-3.5 py-3 sm:px-5">
                            <button
                                onClick={() => {
                                    setMobileView("list");
                                    setSelectedGroupId(null);
                                    setDetail(null);
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-700 sm:hidden shrink-0"
                                aria-label="Back to groups"
                            >
                                <ArrowLeftIcon className="h-4.5 w-4.5" />
                            </button>

                            <div className="relative shrink-0">
                                <Avatar
                                    name={detail.name}
                                    size="md"
                                    src={detail.avatar_url ? `${API_BASE}${detail.avatar_url}` : undefined}
                                />
                                {canEditGroup && (
                                    <>
                                        <button
                                            onClick={() => avatarInputRef.current?.click()}
                                            disabled={uploadingAvatar}
                                            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm ring-2 ring-white transition-colors hover:bg-brand-600 disabled:opacity-60 dark:ring-slate-800"
                                            title={detail.avatar_url ? "Change group photo" : "Add group photo"}
                                        >
                                            <CameraIcon className="h-3 w-3" />
                                        </button>
                                        <input
                                            ref={avatarInputRef}
                                            type="file"
                                            accept="image/jpeg,image/png,image/gif,image/webp"
                                            className="hidden"
                                            onChange={handleAvatarChange}
                                        />
                                    </>
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 sm:gap-2">
                                    <h3 className="truncate text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                                        {detail.name}
                                    </h3>
                                    <StatusBadge
                                        status={detail.my_status}
                                        role={detail.my_role}
                                        className="shrink-0"
                                    />
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 truncate">
                                    <span>
                                        {activeMembers.length} {activeMembers.length === 1 ? "member" : "members"}
                                    </span>
                                    <span>•</span>
                                    <span className="font-mono text-[11px] text-brand-600 dark:text-brand-400 font-semibold truncate">
                                        Code: {detail.invite_code}
                                    </span>
                                </div>
                            </div>

                            {/* Header Actions */}
                            <div className="ml-auto flex items-center gap-1 sm:gap-2 shrink-0">
                                {canChat && (
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => setAddPeopleOpen(true)}
                                        className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5"
                                    >
                                        <UserRoundPlusIcon className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                                        <span>Add People</span>
                                    </Button>
                                )}

                                <button
                                    onClick={() => {
                                        refreshActiveGroup();
                                        loadGroups();
                                    }}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                                    title="Refresh"
                                    aria-label="Refresh group data"
                                >
                                    <RefreshCwIcon className="h-4 w-4" />
                                </button>

                                {/* Group Settings Dropdown */}
                                <div className="relative" ref={groupMenuRef}>
                                    <button
                                        onClick={() => setGroupMenuOpen((v) => !v)}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                                        title="Group Settings"
                                        aria-label="Group settings"
                                    >
                                        <SettingsIcon className="h-4.5 w-4.5" />
                                    </button>

                                    {groupMenuOpen && (
                                        <div className="absolute right-0 top-9.5 z-50 w-56 animate-slide-up rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 shadow-xl">
                                            {canChat && (
                                                <button
                                                    onClick={() => {
                                                        setGroupMenuOpen(false);
                                                        setAddPeopleOpen(true);
                                                    }}
                                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                                                >
                                                    <UserRoundPlusIcon className="h-4 w-4 text-brand-500" />
                                                    <span>Add People / Invite</span>
                                                </button>
                                            )}

                                            {canChat && (
                                                <button
                                                    onClick={() => {
                                                        setGroupMenuOpen(false);
                                                        setNotifSettingsOpen(true);
                                                    }}
                                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                                                >
                                                    <BellIcon className="h-4 w-4 text-slate-400" />
                                                    <span>Notification Settings</span>
                                                </button>
                                            )}

                                            {canEditGroup && (
                                                <button
                                                    onClick={() => {
                                                        setGroupMenuOpen(false);
                                                        openEditGroupInfo();
                                                    }}
                                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                                                >
                                                    <PencilIcon className="h-4 w-4 text-slate-400" />
                                                    <span>Edit Group Details</span>
                                                </button>
                                            )}

                                            {detail.avatar_url && canEditGroup && (
                                                <button
                                                    onClick={() => {
                                                        setGroupMenuOpen(false);
                                                        removeAvatar();
                                                    }}
                                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60"
                                                >
                                                    <Trash2Icon className="h-4 w-4 text-slate-400" />
                                                    <span>Remove Group Photo</span>
                                                </button>
                                            )}

                                            <div className="my-1 border-t border-slate-100 dark:border-slate-700" />

                                            {detail.my_status === "active" && (
                                                <button
                                                    onClick={() => {
                                                        setGroupMenuOpen(false);
                                                        setLeaveTarget(true);
                                                    }}
                                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                                >
                                                    <LogoutIcon className="h-4 w-4" />
                                                    <span>Leave Group</span>
                                                </button>
                                            )}

                                            {isAdmin && (
                                                <button
                                                    onClick={() => {
                                                        setGroupMenuOpen(false);
                                                        setDeleteTarget(true);
                                                    }}
                                                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                                >
                                                    <Trash2Icon className="h-4 w-4" />
                                                    <span>Delete Group</span>
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Pending banner */}
                        {detail.my_status === "pending" && (
                            <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 dark:bg-amber-900/20 px-5 py-3">
                                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
                                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                                    Your request is pending approval from the group admin. Once approved, you can chat and split expenses.
                                </p>
                            </div>
                        )}

                        {/* Workspace Tabs & Body */}
                        <div className="flex flex-1 min-h-0 flex-col overflow-hidden lg:flex-row">
                            {/* Navigation Tabs Bar */}
                            {canChat && (
                                <div className="flex gap-1 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-2 lg:hidden">
                                    {[
                                        { key: "chat", label: "Chat" },
                                        { key: "expenses", label: "Expenses" },
                                        { key: "members", label: `Members (${activeMembers.length})` },
                                    ].map((t) => (
                                        <button
                                            key={t.key}
                                            onClick={() => setDetailTab(t.key)}
                                            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors min-h-[44px] flex items-center justify-center ${
                                                detailTab === t.key
                                                    ? "bg-white dark:bg-slate-800 text-brand-700 dark:text-brand-300 shadow-sm ring-1 ring-slate-200/60 dark:ring-slate-700/60 font-bold"
                                                    : "text-slate-500 dark:text-slate-400"
                                            }`}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Members Sidebar Panel */}
                            <div
                                className={`flex w-full flex-col border-slate-200 dark:border-slate-700/80 lg:w-80 lg:border-r ${
                                    canChat
                                        ? detailTab === "members"
                                            ? "flex"
                                            : "hidden lg:flex"
                                        : "flex"
                                }`}
                            >
                                <div className="border-b border-slate-100 dark:border-slate-700 p-3.5">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                            Group Members ({activeMembers.length})
                                        </p>
                                        {isAdmin && (
                                            <span className="text-[11px] text-brand-600 dark:text-brand-400 font-semibold">
                                                {detail.admin_count || 1} {(detail.admin_count || 1) === 1 ? "Admin" : "Admins"}
                                            </span>
                                        )}
                                    </div>

                                    {/* Member Search Filter */}
                                    <div className="relative">
                                        <SearchIcon className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Search members..."
                                            value={memberSearch}
                                            onChange={(e) => setMemberSearch(e.target.value)}
                                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                                        />
                                        {memberSearch && (
                                            <button
                                                onClick={() => setMemberSearch("")}
                                                className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                                aria-label="Clear search"
                                            >
                                                <XIcon className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                                    {/* Pending Requests for Admins */}
                                    {pendingMembers.length > 0 && isAdmin && (
                                        <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 p-2.5">
                                            <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">
                                                Pending Join Requests ({pendingMembers.length})
                                            </p>
                                            {pendingMembers.map((member) => (
                                                <div
                                                    key={member.user_id}
                                                    className="mb-2 last:mb-0 rounded-xl border border-amber-100 dark:border-amber-900/40 bg-white dark:bg-slate-800 p-2.5 shadow-sm"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Avatar
                                                            name={member.name}
                                                            src={member.avatar_url ? `${API_BASE}${member.avatar_url}` : undefined}
                                                            size="sm"
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-200">
                                                                {member.name}
                                                            </p>
                                                            <button
                                                                onClick={() => setProfileModalTarget(member)}
                                                                className="text-[11px] text-brand-600 dark:text-brand-400 hover:underline"
                                                            >
                                                                View profile
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 flex gap-1.5">
                                                        <Button
                                                            size="sm"
                                                            variant="success"
                                                            className="flex-1 py-1 text-xs"
                                                            onClick={() => approveMember(member)}
                                                        >
                                                            <CheckCircleIcon className="h-3.5 w-3.5" />
                                                            Approve
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="dangerOutline"
                                                            className="flex-1 py-1 text-xs"
                                                            onClick={() => rejectMember(member)}
                                                        >
                                                            Decline
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Active Members List */}
                                    <div>
                                        <p className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                            Active Flatmates
                                        </p>
                                        {filteredActiveMembers.length === 0 ? (
                                            <p className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
                                                No members matching &lsquo;{memberSearch}&rsquo;
                                            </p>
                                        ) : (
                                            filteredActiveMembers.map((member) => {
                                                const isSelf = member.user_id === currentUserId;
                                                const isTargetAdmin = member.role === "admin";
                                                const isMenuOpen = memberMenuId === member.user_id;

                                                return (
                                                    <div
                                                        key={member.user_id}
                                                        className="group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50"
                                                    >
                                                        <Avatar
                                                            name={member.name}
                                                            src={member.avatar_url ? `${API_BASE}${member.avatar_url}` : undefined}
                                                            size="sm"
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-1.5">
                                                                <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                                                                    {member.name}
                                                                </p>
                                                                {isSelf && (
                                                                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                                                        (you)
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                                                Joined {formatDate(member.joined_at)}
                                                            </p>
                                                        </div>

                                                        {isTargetAdmin && (
                                                            <Badge variant="brand" className="shrink-0 text-[10px] py-0 px-1.5">
                                                                <ShieldCheckIcon className="h-2.5 w-2.5" /> Admin
                                                            </Badge>
                                                        )}

                                                        {/* 3-Dot Action Menu Button */}
                                                        <div className="relative shrink-0" data-member-menu>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setMemberMenuId(isMenuOpen ? null : member.user_id);
                                                                }}
                                                                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200/60 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200"
                                                                title="Member actions"
                                                            >
                                                                <EllipsisVerticalIcon className="h-3.5 w-3.5" />
                                                            </button>

                                                            {/* Dropdown Menu */}
                                                            {isMenuOpen && (
                                                                <div className="absolute right-0 top-8 z-40 w-48 animate-slide-up rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 shadow-lg">
                                                                    <button
                                                                        onClick={() => {
                                                                            setMemberMenuId(null);
                                                                            setProfileModalTarget(member);
                                                                        }}
                                                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                                                                    >
                                                                        <UserRoundIcon className="h-3.5 w-3.5 text-slate-400" />
                                                                        <span>View Profile</span>
                                                                    </button>

                                                                    {isAdmin && !isSelf && (
                                                                        <>
                                                                            <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                                                                            {!isTargetAdmin ? (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setMemberMenuId(null);
                                                                                        setTransferTarget(member);
                                                                                    }}
                                                                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                                                                                >
                                                                                    <ShieldCheckIcon className="h-3.5 w-3.5" />
                                                                                    <span>Make Admin</span>
                                                                                </button>
                                                                            ) : (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setMemberMenuId(null);
                                                                                        setDemoteTarget(member);
                                                                                    }}
                                                                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                                                                                >
                                                                                    <UserRoundIcon className="h-3.5 w-3.5 text-slate-400" />
                                                                                    <span>Demote to Member</span>
                                                                                </button>
                                                                            )}

                                                                            <button
                                                                                onClick={() => {
                                                                                    setMemberMenuId(null);
                                                                                    setRemoveTarget(member);
                                                                                }}
                                                                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                                                            >
                                                                                <UserRoundMinusIcon className="h-3.5 w-3.5" />
                                                                                <span>Remove Member</span>
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* Invite code box in sidebar */}
                                <div className="border-t border-slate-100 dark:border-slate-700/80 p-3 bg-slate-50/50 dark:bg-slate-800/40">
                                    <div className="flex items-center justify-between rounded-xl border border-brand-100 dark:border-brand-900/60 bg-brand-50/60 dark:bg-brand-950/40 p-2.5">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                                                Invite Code
                                            </p>
                                            <p className="font-mono text-sm font-bold tracking-widest text-brand-900 dark:text-brand-200">
                                                {detail.invite_code}
                                            </p>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => setAddPeopleOpen(true)}
                                            className="text-xs px-2.5 py-1"
                                        >
                                            <Share2Icon className="h-3.5 w-3.5" />
                                            <span>Share</span>
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Chat + Expenses Content Workspace */}
                            {canChat && (
                                <div className={`min-h-0 flex-1 flex-col overflow-hidden ${detailTab !== "members" ? "flex" : "hidden lg:flex"}`}>
                                    {/* Desktop Tab Selector */}
                                    <div className="hidden items-center border-b border-slate-100 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-900/80 px-4 py-2.5 lg:flex">
                                        <div className="flex items-center gap-1.5">
                                            {[
                                                { key: "chat", label: "Group Chat" },
                                                { key: "expenses", label: "Shared Expenses" },
                                            ].map((t) => (
                                                <button
                                                    key={t.key}
                                                    onClick={() => setDetailTab(t.key)}
                                                    className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
                                                        detailTab === t.key
                                                            ? "bg-white dark:bg-slate-800 text-brand-700 dark:text-brand-300 shadow-sm ring-1 ring-slate-200/60 dark:ring-slate-700/60"
                                                            : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                                                    }`}
                                                >
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {detailTab === "expenses" ? (
                                        <GroupExpensesPanel
                                            group={detail}
                                            myUserId={currentUserId}
                                            expenses={sharedExpenses}
                                            balances={expBalances}
                                            settlements={expSettlements}
                                            loading={loadingExpenses}
                                            onSplit={() => setSplitOpen(true)}
                                            onSettle={() => {
                                                setSettleTargetMember(null);
                                                setSettleOpen(true);
                                            }}
                                            onOpenSettleWith={(member) => {
                                                setSettleTargetMember(member);
                                                setSettleOpen(true);
                                            }}
                                            onExpenseClick={(expense) => setDetailExpense(expense)}
                                            onPayOwed={handlePayOwed}
                                            onRefresh={() => loadGroupExpenses(selectedGroupId)}
                                        />
                                    ) : (
                                        <>
                                            {/* Messages and Expense Cards Stream */}
                                            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                                                <div
                                                    ref={messagesRef}
                                                    onScroll={handleMessagesScroll}
                                                    className="flex-1 space-y-2 overflow-y-auto bg-slate-50/70 dark:bg-slate-900/60 p-3 sm:p-5 touch-scroll"
                                                >
                                                    {loadingMessages && messages.length === 0 ? (
                                                        <div className="flex justify-center py-10">
                                                            <Spinner />
                                                        </div>
                                                    ) : messages.length === 0 && sharedExpenses.length === 0 ? (
                                                        <div className="flex h-full flex-col items-center justify-center text-center py-12">
                                                            <ChatPlaceholder />
                                                            <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                                                Welcome to {detail.name}!
                                                            </p>
                                                            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 max-w-xs">
                                                                Send a message below or split an expense with your flatmates.
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        [
                                                            ...messages.map((m) => ({
                                                                kind: "message",
                                                                at: m.created_at,
                                                                data: m,
                                                            })),
                                                            ...sharedExpenses.map((e) => ({
                                                                kind: "expense",
                                                                at: e.created_at,
                                                                data: e,
                                                            })),
                                                        ]
                                                            .sort((a, b) => new Date(a.at) - new Date(b.at))
                                                            .map((item) => {
                                                                if (item.kind === "expense") {
                                                                    return (
                                                                        <div
                                                                            key={`exp-${item.data.id}`}
                                                                            className="py-1"
                                                                        >
                                                                            <ExpenseBubble
                                                                                expense={item.data}
                                                                                myUserId={currentUserId}
                                                                                paying={payingShare}
                                                                                onOpen={(expense) =>
                                                                                    setDetailExpense(expense)
                                                                                }
                                                                                onPay={payMyShare}
                                                                            />
                                                                        </div>
                                                                    );
                                                                }
                                                                const message = item.data;
                                                                const isOwn =
                                                                    message.sender_id === currentUserId;
                                                                return (
                                                                    <div
                                                                        key={message.id}
                                                                        className={`flex items-end gap-2 ${
                                                                            isOwn
                                                                                ? "justify-end"
                                                                                : "justify-start"
                                                                        }`}
                                                                    >
                                                                        {!isOwn && (
                                                                            <Avatar
                                                                                name={message.sender_name}
                                                                                src={message.sender_avatar ? `${API_BASE}${message.sender_avatar}` : undefined}
                                                                                size="sm"
                                                                            />
                                                                        )}
                                                                        <div
                                                                            className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 ${
                                                                                isOwn
                                                                                    ? "rounded-br-md bg-gradient-to-br from-brand-600 to-violet-500 text-white shadow-sm"
                                                                                    : "rounded-bl-md bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow-sm ring-1 ring-slate-200/60 dark:ring-slate-700/60"
                                                                            }`}
                                                                        >
                                                                            {!isOwn && (
                                                                                <p className="mb-0.5 text-[11px] font-bold text-brand-600 dark:text-brand-400">
                                                                                    {message.sender_name}
                                                                                </p>
                                                                            )}
                                                                            <p className="text-xs sm:text-sm leading-relaxed break-words whitespace-pre-wrap">
                                                                                {message.content}
                                                                            </p>
                                                                            <p
                                                                                className={`mt-1 text-right text-[10px] ${
                                                                                    isOwn
                                                                                        ? "text-brand-100"
                                                                                        : "text-slate-400 dark:text-slate-500"
                                                                                }`}
                                                                            >
                                                                                {formatTime(message.created_at)}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                    )}
                                                </div>

                                                {/* Floating scroll to bottom pill */}
                                                {showScrollBottom && (
                                                    <button
                                                        type="button"
                                                        onClick={scrollToBottom}
                                                        className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-slate-900/90 dark:bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur transition-all hover:scale-105 active:scale-95 z-20"
                                                    >
                                                        <ChevronDownIcon className="h-3.5 w-3.5" />
                                                        <span>Latest messages</span>
                                                    </button>
                                                )}
                                            </div>

                                            {/* Anchored Message Composer */}
                                            <div className="shrink-0 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 sm:p-3.5">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSplitOpen(true)}
                                                        className="shrink-0 rounded-full bg-brand-50 dark:bg-brand-950/60 px-3.5 py-2 text-xs font-bold text-brand-700 dark:text-brand-300 transition-colors hover:bg-brand-100 dark:hover:bg-brand-900/40 min-h-[40px] sm:min-h-[44px] flex items-center justify-center"
                                                        title="Split an expense with the group"
                                                    >
                                                        Split
                                                    </button>
                                                    <input
                                                        type="text"
                                                        value={text}
                                                        placeholder="Message your living group..."
                                                        onChange={(e) => setText(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (
                                                                e.key === "Enter" &&
                                                                !e.shiftKey &&
                                                                !sendingMessage
                                                            ) {
                                                                e.preventDefault();
                                                                sendMessage();
                                                            }
                                                        }}
                                                        disabled={sendingMessage}
                                                        className="min-w-0 flex-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-4 py-2 sm:py-2.5 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                                                    />
                                                    <Button
                                                        onClick={sendMessage}
                                                        disabled={!text.trim()}
                                                        loading={sendingMessage}
                                                        className="shrink-0 rounded-full px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm min-h-[40px] sm:min-h-[44px]"
                                                    >
                                                        <SendIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                                        <span className="hidden sm:inline">Send</span>
                                                    </Button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modals & Dialogs */}
            <Modal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Create a Living Group"
            >
                <div className="space-y-4">
                    <Input
                        label="Group Name"
                        placeholder="e.g. Sunrise Villa 4B"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        autoFocus
                    />
                    <Textarea
                        label="Description (optional)"
                        placeholder="e.g. Shared 3BHK flat near Metro Station..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                    />
                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="secondary"
                            fullWidth
                            onClick={() => setCreateOpen(false)}
                            disabled={creating}
                        >
                            Cancel
                        </Button>
                        <Button
                            fullWidth
                            onClick={createGroup}
                            loading={creating}
                            disabled={!name.trim()}
                        >
                            Create Group
                        </Button>
                    </div>
                </div>
            </Modal>

            <JoinGroupModal
                open={joinOpen}
                initialCode={initialJoinCode}
                onClose={() => {
                    setJoinOpen(false);
                    setInitialJoinCode("");
                }}
                onJoined={async () => {
                    await loadGroups();
                }}
            />

            <AddPeopleModal
                open={addPeopleOpen}
                group={detail}
                onClose={() => setAddPeopleOpen(false)}
                onInviteSent={async () => {
                    await Promise.all([loadDetail(selectedGroupId), loadGroups()]);
                }}
            />

            <GroupNotificationModal
                open={notifSettingsOpen}
                groupId={selectedGroupId}
                initialSettings={detail?.notification_settings}
                onClose={() => setNotifSettingsOpen(false)}
                onSaved={(newSettings) => {
                    setDetail((prev) => (prev ? { ...prev, notification_settings: newSettings } : prev));
                }}
            />

            <MemberProfileModal
                open={!!profileModalTarget}
                groupId={selectedGroupId}
                member={profileModalTarget}
                onClose={() => setProfileModalTarget(null)}
            />

            <Modal
                open={editInfoOpen}
                onClose={() => setEditInfoOpen(false)}
                title="Edit Group Details"
            >
                <div className="space-y-4">
                    <Input
                        label="Group Name"
                        value={groupInfo.name}
                        placeholder="e.g. Sunrise Villa 4B"
                        onChange={(e) =>
                            setGroupInfo((prev) => ({ ...prev, name: e.target.value }))
                        }
                    />
                    <Textarea
                        label="Description (optional)"
                        value={groupInfo.description}
                        placeholder="What is this living group about?"
                        onChange={(e) =>
                            setGroupInfo((prev) => ({
                                ...prev,
                                description: e.target.value,
                            }))
                        }
                    />
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setEditInfoOpen(false)}>
                            Cancel
                        </Button>
                        <Button loading={savingGroupInfo} onClick={saveGroupInfo}>
                            Save Changes
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Confirmations */}
            <ConfirmDialog
                open={leaveTarget}
                title="Leave Living Group?"
                message="You will stop receiving group messages and shared expense updates. If you are an administrator, ensure another active administrator remains."
                confirmLabel="Leave Group"
                variant="danger"
                loading={acting}
                onConfirm={leaveGroup}
                onCancel={() => setLeaveTarget(false)}
            />

            <ConfirmDialog
                open={deleteTarget}
                title="Delete Living Group?"
                message="This will permanently delete the group, revoke all memberships, and archive chat. This action cannot be undone."
                confirmLabel="Delete Group"
                variant="danger"
                loading={acting}
                onConfirm={deleteGroup}
                onCancel={() => setDeleteTarget(false)}
            />

            <ConfirmDialog
                open={!!removeTarget}
                title={`Remove ${removeTarget?.name}?`}
                message="Their access to the group will be revoked immediately. Historical expenses, payment records, and split calculations will remain preserved."
                confirmLabel="Remove Member"
                variant="danger"
                loading={acting}
                onConfirm={removeMember}
                onCancel={() => setRemoveTarget(null)}
            />

            <ConfirmDialog
                open={!!transferTarget}
                title={`Make ${transferTarget?.name} an Admin?`}
                message="They will gain administrative permissions to manage members, invitations, and group settings. You will remain an administrator too."
                confirmLabel="Make Admin"
                variant="primary"
                loading={acting}
                onConfirm={promoteMemberToAdmin}
                onCancel={() => setTransferTarget(null)}
            />

            <ConfirmDialog
                open={!!demoteTarget}
                title={`Demote ${demoteTarget?.name} to Member?`}
                message="They will lose administrative controls and become a regular group member. At least one administrator must remain active in the group."
                confirmLabel="Demote Admin"
                variant="danger"
                loading={acting}
                onConfirm={demoteAdminToMember}
                onCancel={() => setDemoteTarget(null)}
            />

            {/* Group Expense Modals */}
            {detail && detail.my_status === "active" && (
                <>
                    <SplitExpenseModal
                        open={splitOpen}
                        onClose={() => setSplitOpen(false)}
                        group={detail}
                        members={expMembers}
                        creating={creatingShared}
                        onCreate={createSharedExpense}
                    />
                    <SettleUpModal
                        open={settleOpen}
                        onClose={() => {
                            setSettleOpen(false);
                            setSettleTargetMember(null);
                        }}
                        group={detail}
                        members={expMembers}
                        balances={expBalances}
                        expenses={sharedExpenses}
                        initialMember={settleTargetMember}
                        myUserId={currentUserId}
                        onSettlementComplete={async () => {
                            await Promise.all([
                                loadGroupExpenses(selectedGroupId),
                                loadDetail(selectedGroupId),
                            ]);
                            window.dispatchEvent(new Event("coroomies:refresh-counts"));
                        }}
                    />
                    <ExpenseDetailModal
                        expense={detailExpense}
                        myUserId={currentUserId}
                        paying={payingShare}
                        reminding={reminding}
                        onClose={() => setDetailExpense(null)}
                        onPay={payMyShare}
                        onOpenUpi={openUpiModal}
                        onRemind={sendReminder}
                        onDelete={(expense) => setDeleteExpenseTarget(expense)}
                        onRefresh={async () => {
                            await Promise.all([
                                loadGroupExpenses(selectedGroupId),
                                loadDetail(selectedGroupId),
                            ]);
                            window.dispatchEvent(new Event("coroomies:refresh-counts"));
                        }}
                    />
                    <UpiPaymentModal
                        open={upiModalState.open}
                        expense={upiModalState.expense}
                        share={upiModalState.share}
                        owedItem={upiModalState.owedItem}
                        groupId={selectedGroupId}
                        groupName={detail?.name}
                        myUserId={currentUserId}
                        onClose={() =>
                            setUpiModalState({
                                open: false,
                                expense: null,
                                share: null,
                                owedItem: null,
                            })
                        }
                        onStatusUpdated={async () => {
                            await Promise.all([
                                loadGroupExpenses(selectedGroupId),
                                loadDetail(selectedGroupId),
                            ]);
                            if (detailExpense) {
                                try {
                                    const res = await api.get(
                                        `/shared-expenses/${detailExpense.id}`
                                    );
                                    setDetailExpense(res.data);
                                } catch (e) {
                                    console.error("Could not refresh expense detail", e);
                                }
                            }
                        }}
                    />
                    <ConfirmDialog
                        open={!!deleteExpenseTarget}
                        title="Delete this expense?"
                        message={`'${deleteExpenseTarget?.description}' and all its shares will be permanently removed.`}
                        confirmLabel="Delete"
                        loading={deletingExpense}
                        onConfirm={deleteSharedExpense}
                        onCancel={() => setDeleteExpenseTarget(null)}
                    />
                </>
            )}
        </div>
    );
}

function ChatPlaceholder() {
    return (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-50 to-violet-50 text-brand-500 ring-1 ring-brand-100 dark:ring-brand-800">
            <SendIcon className="h-6 w-6" />
        </div>
    );
}

export default Groups;

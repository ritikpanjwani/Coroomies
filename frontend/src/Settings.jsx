import { useEffect, useState, useCallback } from "react";
import api from "./api";
import Card from "./components/ui/Card";
import Button from "./components/ui/Button";
import PageHeader from "./components/ui/PageHeader";
import Modal from "./components/ui/Modal";
import Avatar from "./components/ui/Avatar";
import Badge from "./components/ui/Badge";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import EmptyState from "./components/ui/EmptyState";
import Spinner from "./components/ui/Spinner";
import { Input } from "./components/ui/Field";
import { useToast } from "./components/Toast";
import { ShieldCheckIcon, PaletteIcon, UserRoundIcon, WalletIcon, BanIcon, RefreshCwIcon } from "./components/Icons";
import { logout, saveToken } from "./auth";
import { errorMessage, formatDate } from "./utils/format";
import { validatePasswordStrength } from "./utils/validation";

const TABS = [
    { key: "security", label: "Security", icon: ShieldCheckIcon },
    { key: "privacy", label: "Privacy & Safety", icon: BanIcon },
    { key: "appearance", label: "Appearance", icon: PaletteIcon },
    { key: "payment", label: "UPI & Payments", icon: WalletIcon },
    { key: "account", label: "Account", icon: UserRoundIcon },
];

function Settings() {
    const toast = useToast();
    const [tab, setTab] = useState("security");

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmNewPassword, setConfirmNewPassword] = useState("");
    const [changingPassword, setChangingPassword] = useState(false);

    const [appearanceSettings, setAppearanceSettings] = useState({
        theme: localStorage.getItem("theme") || "light",
    });

    const [showDeactivateModal, setShowDeactivateModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [upiId, setUpiId] = useState("");
    const [savingUpi, setSavingUpi] = useState(false);

    // Blocked users management (Privacy & Safety)
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [loadingBlocked, setLoadingBlocked] = useState(false);
    const [blockedError, setBlockedError] = useState(null);
    const [unblockTarget, setUnblockTarget] = useState(null);
    const [unblocking, setUnblocking] = useState(false);

    const loadBlockedUsers = useCallback(async () => {
        try {
            setLoadingBlocked(true);
            setBlockedError(null);
            const res = await api.get("/settings/blocked-users");
            setBlockedUsers(res.data?.blocked_users || []);
        } catch (err) {
            setBlockedError(errorMessage(err, "Could not load blocked users"));
        } finally {
            setLoadingBlocked(false);
        }
    }, []);

    useEffect(() => {
        if (tab !== "privacy") return;
        let active = true;
        api.get("/settings/blocked-users")
            .then((res) => {
                if (active) {
                    setBlockedUsers(res.data?.blocked_users || []);
                    setBlockedError(null);
                }
            })
            .catch((err) => {
                if (active) {
                    setBlockedError(errorMessage(err, "Could not load blocked users"));
                }
            })
            .finally(() => {
                if (active) setLoadingBlocked(false);
            });
        return () => {
            active = false;
        };
    }, [tab]);

    const handleUnblock = async () => {
        if (!unblockTarget) return;
        try {
            setUnblocking(true);
            await api.post(`/messages/${unblockTarget.user_id}/unblock`);
            toast.success(`Unblocked ${unblockTarget.name}`);
            setBlockedUsers((prev) => prev.filter((u) => u.user_id !== unblockTarget.user_id));
            setUnblockTarget(null);
            window.dispatchEvent(new CustomEvent("coroomies:refresh-counts"));
        } catch (err) {
            toast.error(errorMessage(err, "Failed to unblock user"));
        } finally {
            setUnblocking(false);
        }
    };

    useEffect(() => {
        api.get("/settings/")
            .then((res) => {
                setUpiId(res.data?.upi_id || "");
            })
            .catch(() => {});
    }, []);

    const handleSaveUpi = async () => {
        try {
            setSavingUpi(true);
            const res = await api.put("/settings/account", {
                upi_id: upiId.trim() || null,
            });
            setUpiId(res.data?.upi_id || "");
            if (res.data?.upi_id) {
                localStorage.setItem("user_upi_id", res.data.upi_id);
            } else {
                localStorage.removeItem("user_upi_id");
            }
            toast.success("UPI ID saved successfully");
        } catch (error) {
            toast.error(errorMessage(error, "Could not update UPI ID"));
        } finally {
            setSavingUpi(false);
        }
    };

    const applyTheme = (theme) => {
        setAppearanceSettings({ theme });
        const root = document.documentElement;
        if (theme === "dark") {
            root.classList.add("dark");
        } else {
            root.classList.remove("dark");
        }
        localStorage.setItem("theme", theme);
    };

    const handleChangePassword = async () => {
        if (!currentPassword) {
            toast.error("Please enter your current password");
            return;
        }
        if (!newPassword) {
            toast.error("Please enter a new password");
            return;
        }
        const pwdError = validatePasswordStrength(newPassword);
        if (pwdError) {
            toast.error(pwdError);
            return;
        }
        if (newPassword !== confirmNewPassword) {
            toast.error("New passwords do not match");
            return;
        }
        if (newPassword === currentPassword) {
            toast.error("New password must be different from current password");
            return;
        }

        try {
            setChangingPassword(true);
            const response = await api.put("/settings/password", {
                current_password: currentPassword,
                new_password: newPassword,
            });
            if (response.data?.access_token) {
                saveToken(response.data.access_token);
            }
            setCurrentPassword("");
            setNewPassword("");
            setConfirmNewPassword("");
            toast.success("Password updated successfully");
        } catch (error) {
            toast.error(errorMessage(error, "Could not change password"));
        } finally {
            setChangingPassword(false);
        }
    };

    const handleDeleteAccount = async () => {
        try {
            setDeleting(true);
            await api.delete("/settings/account");
            logout();
            toast.success("Account deleted. Goodbye!");
            setTimeout(() => window.location.reload(), 1500);
        } catch (error) {
            setDeleting(false);
            toast.error(errorMessage(error, "Could not delete account"));
            setShowDeleteModal(false);
        }
    };

    return (
        <div className="w-full max-w-3xl mx-auto">
            <PageHeader
                title="Settings"
                subtitle="Manage your security, appearance, and account."
            />

            {/* Tabs */}
            <div className="mb-6 flex gap-1.5 overflow-x-auto no-scrollbar touch-scroll scroll-smooth rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-1 shadow-card">
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        className={`shrink-0 sm:flex-1 whitespace-nowrap rounded-lg px-3.5 py-2 min-h-[42px] text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
                            tab === key
                                ? "bg-gradient-to-r from-brand-600 to-violet-500 text-white shadow-sm"
                                : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900"
                        }`}
                        onClick={() => setTab(key)}
                    >
                        <Icon className="mr-1.5 inline h-4 w-4" />
                        {label}
                    </button>
                ))}
            </div>

            {tab === "security" && (
                <Card className="p-4 sm:p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <ShieldCheckIcon className="h-4.5 w-4.5 text-brand-500" />
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            Change password
                        </h2>
                    </div>
                    <div className="space-y-4">
                        <Input
                            label="Current password"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Enter current password"
                        />
                        <Input
                            label="New password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Min 8 characters"
                            hint="At least 8 characters with uppercase, lowercase, number, and special character"
                        />
                        <Input
                            label="Confirm new password"
                            type="password"
                            value={confirmNewPassword}
                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                            placeholder="Re-enter new password"
                        />
                        <div className="flex justify-end pt-2 [&>button]:w-full sm:[&>button]:w-auto">
                            <Button loading={changingPassword} onClick={handleChangePassword}>
                                Update password
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {tab === "privacy" && (
                <Card className="p-4 sm:p-6">
                    <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                            <BanIcon className="h-4.5 w-4.5 text-rose-500" />
                            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                                Blocked Users
                            </h2>
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={loadBlockedUsers}
                            disabled={loadingBlocked}
                            className="text-xs"
                        >
                            <RefreshCwIcon className={`h-3.5 w-3.5 mr-1 ${loadingBlocked ? "animate-spin" : ""}`} />
                            <span>Refresh</span>
                        </Button>
                    </div>
                    <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
                        Blocked users cannot send you connection requests, cannot message you in direct chats, and will not appear in flatmate recommendations.
                    </p>

                    {loadingBlocked ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <Spinner size="md" />
                            <p className="mt-3 text-xs text-slate-400">Loading blocked users...</p>
                        </div>
                    ) : blockedError ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
                            <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">{blockedError}</p>
                            <Button size="sm" variant="secondary" onClick={loadBlockedUsers} className="mt-3 text-xs">
                                Try again
                            </Button>
                        </div>
                    ) : blockedUsers.length === 0 ? (
                        <EmptyState
                            compact
                            icon={<BanIcon className="h-7 w-7 text-slate-300 dark:text-slate-600" />}
                            title="No blocked users"
                            description="You have not blocked any users. If you block someone from chat or profile, they will appear here so you can manage or unblock them anytime."
                        />
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 overflow-hidden">
                            {blockedUsers.map((user) => {
                                const academicInfo = [user.degree, user.stream, user.college].filter(Boolean).join(" · ");
                                return (
                                    <div
                                        key={user.user_id}
                                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 hover:bg-white dark:hover:bg-slate-800/60 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Avatar
                                                name={user.name}
                                                size="md"
                                                src={user.avatar_url ? (user.avatar_url.startsWith("http") ? user.avatar_url : `${api.defaults.baseURL || ""}${user.avatar_url}`) : undefined}
                                                className="shrink-0"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                                                        {user.name}
                                                    </span>
                                                    {user.username && (
                                                        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                                                            @{user.username}
                                                        </span>
                                                    )}
                                                    <Badge variant="danger" size="sm">
                                                        Blocked
                                                    </Badge>
                                                </div>
                                                {academicInfo && (
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                                        {academicInfo}
                                                    </p>
                                                )}
                                                {user.blocked_at && (
                                                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                                                        Blocked on {formatDate(user.blocked_at)}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="shrink-0 pt-1 sm:pt-0">
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => setUnblockTarget(user)}
                                                className="w-full sm:w-auto text-xs font-semibold justify-center"
                                            >
                                                Unblock
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            )}

            {tab === "appearance" && (
                <Card className="p-4 sm:p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <PaletteIcon className="h-4.5 w-4.5 text-brand-500" />
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            Theme
                        </h2>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {[
                            { key: "light", label: "Light", preview: "bg-white" },
                            { key: "dark", label: "Dark", preview: "bg-slate-800" },
                            { key: "system", label: "System", preview: "bg-gradient-to-r from-white to-slate-800" },
                        ].map((option) => (
                            <button
                                key={option.key}
                                onClick={() => applyTheme(option.key)}
                                className={`rounded-xl border-2 p-3 text-left transition-colors ${
                                    appearanceSettings.theme === option.key
                                        ? "border-brand-500 ring-2 ring-brand-500/20"
                                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                                }`}
                            >
                                <div
                                    className={`mb-2 h-10 w-full rounded-lg ${option.preview} ring-1 ring-slate-200 dark:ring-slate-700`}
                                />
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                    {option.label}
                                </p>
                            </button>
                        ))}
                    </div>
                </Card>
            )}

            {tab === "payment" && (
                <Card className="p-4 sm:p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <WalletIcon className="h-4.5 w-4.5 text-brand-500" />
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            UPI Payment Settings
                        </h2>
                    </div>
                    <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                        Configure your Virtual Payment Address (UPI ID) so roommates can pay their split expense shares directly to your bank account using Google Pay, PhonePe, Paytm, or any UPI app.
                    </p>
                    <div className="space-y-4 max-w-md">
                        <Input
                            id="settings-upi-id"
                            label="Your UPI ID / VPA"
                            value={upiId}
                            onChange={(e) => setUpiId(e.target.value)}
                            placeholder="e.g. username@oksbi or name@upi"
                            disabled={savingUpi}
                        />
                        <div className="rounded-lg bg-slate-50 dark:bg-slate-900/60 p-3 text-xs text-slate-500 dark:text-slate-400">
                            Format: username@handle (e.g. rahul@okaxis, priya@upi). Split payments sent via UPI Intent will credit directly to your linked bank account.
                        </div>
                        <div className="flex justify-end pt-2">
                            <Button loading={savingUpi} onClick={handleSaveUpi}>
                                Save UPI ID
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {tab === "account" && (
                <Card className="p-4 sm:p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <UserRoundIcon className="h-4.5 w-4.5 text-slate-500 dark:text-slate-400" />
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            Account Management
                        </h2>
                    </div>
                    <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                        Manage your account status.
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Button variant="secondary" onClick={() => setShowDeactivateModal(true)}>
                            Deactivate account
                        </Button>
                        <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
                            Delete account
                        </Button>
                    </div>
                </Card>
            )}

            {/* Delete Modal */}
            <Modal
                open={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                title="Delete your account"
            >
                <p className="text-sm text-slate-600 dark:text-slate-300">
                    Are you sure you want to delete your account? All your data including
                    profile, messages, expenses, and group memberships will be permanently
                    removed.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
                        Cancel
                    </Button>
                    <Button variant="danger" loading={deleting} onClick={handleDeleteAccount}>
                        Delete account
                    </Button>
                </div>
            </Modal>

            {/* Deactivate Modal */}
            <Modal
                open={showDeactivateModal}
                onClose={() => setShowDeactivateModal(false)}
                title="Deactivate your account"
            >
                <p className="text-sm text-slate-600 dark:text-slate-300">
                    Are you sure you want to deactivate your account? Your profile will be
                    hidden but all your data will be preserved. You can reactivate at any time.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={() => setShowDeactivateModal(false)}>
                        Cancel
                    </Button>
                    <Button variant="danger" onClick={() => window.location.reload()}>
                        Deactivate
                    </Button>
                </div>
            </Modal>

            {/* Unblock Confirmation Dialog */}
            <ConfirmDialog
                open={!!unblockTarget}
                title={`Unblock ${unblockTarget?.name || "User"}?`}
                message={`Are you sure you want to unblock ${unblockTarget?.name || "this user"}? They will be able to view your profile, send connection requests, and message you again. Note that unblocking does not automatically restore past requests or friendships.`}
                confirmLabel="Unblock User"
                cancelLabel="Cancel"
                variant="primary"
                loading={unblocking}
                onConfirm={handleUnblock}
                onCancel={() => setUnblockTarget(null)}
            />
        </div>
    );
}

export default Settings;

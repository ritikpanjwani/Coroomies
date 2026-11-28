import { useCallback, useEffect, useState } from "react";
import api from "./api";
import Avatar from "./components/ui/Avatar";
import Badge from "./components/ui/Badge";
import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import EmptyState from "./components/ui/EmptyState";
import Modal from "./components/ui/Modal";
import PageHeader from "./components/ui/PageHeader";
import { Field, Input, Select, Textarea } from "./components/ui/Field";
import Spinner from "./components/ui/Spinner";
import { useToast } from "./components/Toast";
import {
    AlertIcon,
    CheckCircleIcon,
    ClockIcon,
    PencilIcon,
    PlusIcon,
    RefreshCwIcon,
    ShieldCheckIcon,
    Trash2Icon,
    TrendUpIcon,
    UsersRoundIcon,
} from "./components/Icons";
import { formatCurrency, formatDate, errorMessage } from "./utils/format";

function GroupPicker({ groups, selectedGroupId, onChange }) {
    if (groups.length === 0) {
        return (
            <Card className="p-5">
                <EmptyState
                    compact
                    icon={<UsersRoundIcon className="h-6 w-6" />}
                    title="You're not in a living group yet"
                    description="Join or create a living group first — household duties, rules and reliability scores live inside your group."
                />
            </Card>
        );
    }

    return (
        <Card className="p-4">
            <Field label="Living group">
                <Select
                    value={selectedGroupId || ""}
                    onChange={(e) =>
                        onChange(e.target.value ? Number(e.target.value) : null)
                    }
                >
                    <option value="">Select a group</option>
                    {groups.map((group) => (
                        <option key={group.group_id} value={group.group_id}>
                            {group.name} ({group.member_count} members)
                        </option>
                    ))}
                </Select>
            </Field>
        </Card>
    );
}

const WEEKDAY_OPTIONS = [
    { value: "", label: "No specific day" },
    { value: "0", label: "Monday" },
    { value: "1", label: "Tuesday" },
    { value: "2", label: "Wednesday" },
    { value: "3", label: "Thursday" },
    { value: "4", label: "Friday" },
    { value: "5", label: "Saturday" },
    { value: "6", label: "Sunday" },
];

const WEEKDAY_SHORT = {
    0: "Monday",
    1: "Tuesday",
    2: "Wednesday",
    3: "Thursday",
    4: "Friday",
    5: "Saturday",
    6: "Sunday",
};

function formatScheduleText(sched) {
    if (sched.frequency === "weekly" && sched.day_of_week != null) {
        return `Every ${WEEKDAY_SHORT[sched.day_of_week]}`;
    }
    if (sched.frequency === "monthly" && sched.day_of_month != null) {
        const d = sched.day_of_month;
        const suffix = d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th";
        return `${d}${suffix} of month`;
    }
    return sched.frequency === "weekly" ? "Every week" : "Every month";
}

function ChoresPanel({
    group,
    members,
    chores,
    history,
    schedules,
    onComplete,
    onDelete,
    onAddSchedule,
    onUpdateSchedule,
    onDeleteSchedule,
    saving,
    myUserId,
    isAdmin,
}) {
    const [showScheduleForm, setShowScheduleForm] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [schedForm, setSchedForm] = useState({
        title: "",
        description: "",
        assigned_to: "",
        frequency: "weekly",
        day_of_week: "6",
        day_of_month: "",
        reminder_time: "",
    });
    const [schedErrors, setSchedErrors] = useState({});
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteScheduleTarget, setDeleteScheduleTarget] = useState(null);
    const [alarmDrafts, setAlarmDrafts] = useState({});
    const [section, setSection] = useState("recurring-duties");
    const toast = useToast();

    const resetSchedForm = () => {
        setSchedForm({
            title: "",
            description: "",
            assigned_to: "",
            frequency: "weekly",
            day_of_week: "6",
            day_of_month: "",
            reminder_time: "",
        });
        setEditingSchedule(null);
        setSchedErrors({});
    };

    const openCreateSchedule = () => {
        setEditingSchedule(null);
        resetSchedForm();
        setShowScheduleForm(true);
    };

    const openEditSchedule = (sched) => {
        setEditingSchedule(sched);
        setSchedForm({
            title: sched.title,
            description: sched.description || "",
            assigned_to: sched.assigned_to || "",
            frequency: sched.frequency,
            day_of_week: sched.day_of_week != null ? String(sched.day_of_week) : "",
            day_of_month: sched.day_of_month != null ? String(sched.day_of_month) : "",
            reminder_time: sched.reminder_time || "",
        });
        setSchedErrors({});
        setShowScheduleForm(true);
    };

    const canEditAlarm = (sched) => isAdmin || sched.assigned_to === myUserId;

    const handleScheduleSubmit = async () => {
        const next = {};
        if (!schedForm.title.trim()) next.title = "Add a title";
        if (!schedForm.frequency) next.frequency = "Choose a frequency";
        if (schedForm.frequency === "weekly" && !schedForm.day_of_week) next.day_of_week = "Pick a day";
        if (schedForm.frequency === "monthly" && !schedForm.day_of_month) next.day_of_month = "Pick a day of month";
        setSchedErrors(next);
        if (Object.keys(next).length > 0) return;

        try {
            const payload = {
                title: schedForm.title.trim(),
                description: schedForm.description.trim() || null,
                assigned_to:
                    isAdmin && schedForm.assigned_to
                        ? Number(schedForm.assigned_to)
                        : null,
                frequency: schedForm.frequency,
                day_of_week: schedForm.frequency === "weekly" ? Number(schedForm.day_of_week) : null,
                day_of_month: schedForm.frequency === "monthly" ? Number(schedForm.day_of_month) : null,
                reminder_time: schedForm.reminder_time || null,
            };
            if (editingSchedule) {
                await onUpdateSchedule(editingSchedule.id, payload);
                toast.success("Recurring task updated");
            } else {
                await onAddSchedule({ group_id: group.group_id, ...payload });
                toast.success("Recurring task created");
            }
            setShowScheduleForm(false);
            resetSchedForm();
        } catch (err) {
            toast.error(errorMessage(err, "Could not save recurring task"));
        }
    };

    const pending = chores.filter((c) => c.status === "pending");
    const completed = chores.filter((c) => c.status === "completed");

    return (
        <>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-500">
                        <UsersRoundIcon className="h-4 w-4 text-brand-500" />
                        Keep the household running in {group.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                        Assign household duties, set deadlines, and let recurring duties rotate automatically.
                    </p>
                </div>
                <Button onClick={() => (showScheduleForm ? (setShowScheduleForm(false), resetSchedForm()) : openCreateSchedule())}>
                    <PlusIcon className="h-4 w-4" />
                    {showScheduleForm ? "Close" : "New recurring duty"}
                </Button>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card className="p-4">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-500">Pending</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{pending.length}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-500">Completed</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{completed.length}</p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-500">Recurring</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                        {schedules.length}
                    </p>
                </Card>
                <Card className="p-4">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-500">Assigned to you</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                        {pending.filter((c) => c.assigned_to === myUserId).length}
                    </p>
                </Card>
            </div>

            {/* Section tabs */}
            <div className="mb-5 flex gap-1 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-100 dark:bg-slate-800/80 p-1 shadow-xs">
                {[
                    { key: "recurring-duties", label: "Recurring Duties" },
                    { key: "activity", label: "Activity" },
                ].map((t) => (
                    <button
                        key={t.key}
                        onClick={() => setSection(t.key)}
                        className={`flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:text-sm cursor-pointer ${
                            section === t.key
                                ? "bg-brand-600 text-white shadow-xs"
                                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-700/60"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {section === "recurring-duties" && (
            <>
            <Card className="mb-5 p-5">
                <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <RefreshCwIcon className="h-4.5 w-4.5 text-brand-500" />
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recurring duties</h2>
                    </div>
                    <Button size="sm" onClick={() => (showScheduleForm ? (setShowScheduleForm(false), resetSchedForm()) : openCreateSchedule())}>
                        <PlusIcon className="h-3.5 w-3.5" />
                        {showScheduleForm ? "Close" : "Add recurring duty"}
                    </Button>
                </div>
                <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
                    Repeating duties are auto-generated each week / month and assigned to the right person. Only admins can change the schedule — assigned members can set their own reminder alarm.
                </p>

                {showScheduleForm && (
                    <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                        <h3 className="mb-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {editingSchedule ? "Edit recurring task" : "New recurring duty"}
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                                label="Title"
                                placeholder="e.g. Clean kitchen"
                                value={schedForm.title}
                                error={schedErrors.title}
                                onChange={(e) => {
                                    setSchedForm({ ...schedForm, title: e.target.value });
                                    setSchedErrors({ ...schedErrors, title: "" });
                                }}
                            />
                            <Field
                                label="Assigned to"
                                hint={isAdmin ? undefined : "Only group admins can assign duties"}
                            >
                                <Select
                                    value={isAdmin ? schedForm.assigned_to : ""}
                                    disabled={!isAdmin}
                                    onChange={(e) => setSchedForm({ ...schedForm, assigned_to: e.target.value })}
                                >
                                    <option value="">Unassigned</option>
                                    {isAdmin &&
                                        members.map((m) => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                </Select>
                            </Field>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                            <Field label="Frequency">
                                <Select
                                    value={schedForm.frequency}
                                    error={schedErrors.frequency}
                                    onChange={(e) => setSchedForm({ ...schedForm, frequency: e.target.value })}
                                >
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                </Select>
                            </Field>
                            {schedForm.frequency === "weekly" && (
                                <Field label="Day of week">
                                    <Select
                                        value={schedForm.day_of_week}
                                        error={schedErrors.day_of_week}
                                        onChange={(e) => setSchedForm({ ...schedForm, day_of_week: e.target.value })}
                                    >
                                        {WEEKDAY_OPTIONS.filter((o) => o.value !== "").map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </Select>
                                </Field>
                            )}
                            {schedForm.frequency === "monthly" && (
                                <Input
                                    label="Day of month"
                                    type="number"
                                    min="1"
                                    max="31"
                                    placeholder="e.g. 1"
                                    value={schedForm.day_of_month}
                                    error={schedErrors.day_of_month}
                                    onChange={(e) => {
                                        setSchedForm({ ...schedForm, day_of_month: e.target.value });
                                        setSchedErrors({ ...schedErrors, day_of_month: "" });
                                    }}
                                />
                            )}
                        </div>
                        <div className="mt-3">
                            <Input
                                label="Details (optional)"
                                placeholder="Any extra instructions"
                                value={schedForm.description}
                                onChange={(e) => setSchedForm({ ...schedForm, description: e.target.value })}
                            />
                        </div>
                        <div className="mt-3">
                            <Input
                                label="Reminder alarm (time of day)"
                                type="time"
                                hint={isAdmin ? "Notified on the due date at this time" : "Only group admins set the schedule date; you can change this alarm time"}
                                value={schedForm.reminder_time}
                                onChange={(e) => setSchedForm({ ...schedForm, reminder_time: e.target.value })}
                            />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="sm" onClick={handleScheduleSubmit} loading={saving}>
                                {editingSchedule ? "Save changes" : "Create recurring duty"}
                            </Button>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                    setShowScheduleForm(false);
                                    resetSchedForm();
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}

                {schedules.length === 0 && !showScheduleForm ? (
                    <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-3">
                        No recurring duties yet — click "Add recurring duty" to set one up.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {schedules.map((sched) => (
                            <div
                                key={sched.id}
                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3"
                            >
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 mt-0.5 sm:mt-0">
                                        <RefreshCwIcon className="h-4.5 w-4.5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                            {sched.title}
                                        </p>
                                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                            <Badge variant="brand">{formatScheduleText(sched)}</Badge>
                                            {sched.assigned_name && (
                                                <span className="inline-flex items-center gap-1">
                                                    → <Avatar name={sched.assigned_name} size="xs" /> {sched.assigned_name}
                                                </span>
                                            )}
                                            <span className="inline-flex items-center gap-1">
                                                <ClockIcon className="h-3.5 w-3.5" />
                                                {sched.reminder_time
                                                    ? `Alarm ${sched.reminder_time}`
                                                    : canEditAlarm(sched)
                                                    ? "No alarm"
                                                    : "No alarm set"}
                                            </span>
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-end gap-1.5 shrink-0 pt-2 border-t border-slate-100 dark:border-slate-700/60 sm:border-0 sm:pt-0">
                                    {canEditAlarm(sched) && (
                                        <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
                                            <input
                                                type="time"
                                                value={
                                                    alarmDrafts[sched.id] !== undefined
                                                        ? alarmDrafts[sched.id]
                                                        : sched.reminder_time || ""
                                                }
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setAlarmDrafts((prev) => ({ ...prev, [sched.id]: val }));
                                                }}
                                                onBlur={() => {
                                                    const val = alarmDrafts[sched.id] ?? "";
                                                    const current = sched.reminder_time || "";
                                                    if (val === current) {
                                                        setAlarmDrafts((prev) => {
                                                            const copy = { ...prev };
                                                            delete copy[sched.id];
                                                            return copy;
                                                        });
                                                        return;
                                                    }
                                                    try {
                                                        onUpdateSchedule(sched.id, {
                                                            reminder_time: val,
                                                        }).then(() => {
                                                            setAlarmDrafts((prev) => {
                                                                const copy = { ...prev };
                                                                delete copy[sched.id];
                                                                return copy;
                                                            });
                                                            toast.success(val ? `Alarm set to ${val}` : "Alarm removed");
                                                        }).catch((err) => {
                                                            toast.error(errorMessage(err, "Could not update alarm"));
                                                        });
                                                    } catch (err) {
                                                        toast.error(errorMessage(err, "Could not update alarm"));
                                                    }
                                                }}
                                                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-1.5 py-1 text-xs text-slate-600 dark:text-slate-300"
                                            />
                                        </span>
                                    )}
                                    {isAdmin && (
                                        <button
                                            onClick={() => openEditSchedule(sched)}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-700 hover:text-slate-700 dark:text-slate-300"
                                            title="Edit"
                                        >
                                            <PencilIcon className="h-4 w-4" />
                                        </button>
                                    )}
                                    {isAdmin && (
                                        <button
                                            onClick={() => setDeleteScheduleTarget(sched)}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/20 dark:bg-rose-900/20 hover:text-rose-500 dark:text-rose-400"
                                            title="Delete"
                                        >
                                            <Trash2Icon className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <Card className="mb-5 p-5">
                <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                    This week's duties
                </h2>
                <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
                    Auto-generated instances of your recurring duties. Complete them once done.
                </p>
                {chores.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 dark:text-slate-500 py-3">
                        No duties yet — recurring duties will appear here automatically.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {chores.map((chore) => {
                            const isOverdue =
                                chore.status === "pending" &&
                                chore.due_date &&
                                new Date(chore.due_date) < new Date();
                            const isMine = chore.assigned_to === myUserId;
                            return (
                                <div
                                    key={chore.id}
                                    className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
                                        chore.status === "completed"
                                            ? "border-emerald-100 bg-emerald-50 dark:bg-emerald-500/15"
                                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                                    }`}
                                >
                                    <div
                                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                                            chore.status === "completed"
                                                ? "bg-emerald-100 text-emerald-600"
                                                : isOverdue
                                                ? "bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400"
                                                : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-500"
                                        }`}
                                    >
                                        {chore.status === "completed" ? (
                                            <CheckCircleIcon className="h-5 w-5" />
                                        ) : (
                                            <ClockIcon className="h-5 w-5" />
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                            {chore.title}
                                        </p>
                                        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400 dark:text-slate-500">
                                            <span className="inline-flex items-center gap-1">
                                                <Avatar name={chore.assigned_name || "?"} size="xs" />
                                                {chore.assigned_name || "Unassigned"}
                                                {isMine ? " (you)" : ""}
                                            </span>
                                            {chore.due_date && (
                                                <span>
                                                    Due {formatDate(chore.due_date)}
                                                    {isOverdue ? " · overdue" : ""}
                                                </span>
                                            )}
                                            {chore.recurring !== "none" && (
                                                <Badge variant="brand">
                                                    {chore.recurring === "weekly" ? "Weekly" : "Monthly"}
                                                </Badge>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-none sm:justify-end">
                                        {chore.status === "pending" && (chore.assigned_to == null || isMine) && (
                                            <Button
                                                size="sm"
                                                variant={isMine ? "success" : "secondary"}
                                                onClick={() => onComplete(chore)}
                                                title={isMine ? "" : "Unassigned chore — completing on their behalf"}
                                            >
                                                <CheckCircleIcon className="h-4 w-4" />
                                                Complete
                                            </Button>
                                        )}
                                        {chore.status === "pending" && chore.assigned_to != null && !isMine && (
                                            <span className="text-xs text-slate-400 dark:text-slate-500">
                                                Waiting on them
                                            </span>
                                        )}
                                        <span className="flex-1" />
                                        {isAdmin && (
                                            <button
                                                onClick={() => setDeleteTarget(chore)}
                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/20 dark:bg-rose-900/20 hover:text-rose-500 dark:text-rose-400"
                                                title="Delete"
                                            >
                                                <Trash2Icon className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </Card>
            </>
            )}

            {section === "activity" && (
            <>
            {history.length === 0 ? (
                <Card className="p-8">
                    <EmptyState
                        icon={<ClockIcon className="h-6 w-6" />}
                        title="No activity yet"
                        description="Completed and created duties will show up here."
                    />
                </Card>
            ) : (
                <Card className="p-5">
                    <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
                        Recent activity
                    </h2>
                    <div className="space-y-2">
                        {history.map((h) => (
                            <div key={h.id} className="flex items-start gap-3 py-2">
                                <Avatar name={h.user_name} size="xs" />
                                <div className="min-w-0">
                                    <p className="text-sm text-slate-700 dark:text-slate-300">
                                        <span className="font-medium text-slate-800 dark:text-slate-200">{h.user_name}</span>{" "}
                                        {h.action} <span className="font-medium">{h.chore_title}</span>
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">{formatDate(h.created_at)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
            </>
            )}

            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete chore?"
                message="This will permanently remove this chore and its history."
                confirmLabel="Delete"
                onConfirm={() => {
                    if (deleteTarget) onDelete(deleteTarget);
                    setDeleteTarget(null);
                }}
                onCancel={() => setDeleteTarget(null)}
            />

            <ConfirmDialog
                open={!!deleteScheduleTarget}
                title="Delete recurring task?"
                message={`This will remove "${deleteScheduleTarget?.title || ""}" and stop generating future chores from it.`}
                confirmLabel="Delete"
                onConfirm={() => {
                    if (deleteScheduleTarget) onDeleteSchedule(deleteScheduleTarget);
                    setDeleteScheduleTarget(null);
                }}
                onCancel={() => setDeleteScheduleTarget(null)}
            />
        </>
    );
}

function RulesPanel({
    group,
    members,
    rules,
    violations,
    onAddRule,
    onUpdateRule,
    onDeleteRule,
    onRecordViolation,
    onDeleteViolation,
    saving,
    myUserId,
    isAdmin,
}) {
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [violating, setViolating] = useState(null);
    const [form, setForm] = useState({
        title: "",
        description: "",
        penalty_amount: "",
    });
    const [violationForm, setViolationForm] = useState({
        user_id: "",
        note: "",
        penalty_amount: "",
    });
    const [errors, setErrors] = useState({});
    const [deleteTarget, setDeleteTarget] = useState(null);
    const toast = useToast();

    const openCreate = () => {
        setEditing(null);
        setForm({ title: "", description: "", penalty_amount: "" });
        setErrors({});
        setShowForm(true);
    };

    const openEdit = (rule) => {
        setEditing(rule);
        setForm({
            title: rule.title,
            description: rule.description || "",
            penalty_amount: String(rule.penalty_amount),
        });
        setErrors({});
        setShowForm(true);
    };

    const openViolate = (rule) => {
        const v = {
            user_id: "",
            note: "",
            penalty_amount: String(rule.penalty_amount || ""),
        };
        setViolationForm(v);
        setErrors({});
        setViolating(rule);
    };

    const handleRuleSubmit = async () => {
        const next = {};
        if (!form.title.trim()) next.title = "Add a rule title";
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        try {
            if (editing) {
                await onUpdateRule(editing.id, {
                    title: form.title.trim(),
                    description: form.description.trim() || null,
                    penalty_amount: form.penalty_amount ? Number(form.penalty_amount) : 0,
                });
                toast.success("Rule updated");
            } else {
                await onAddRule({
                    group_id: group.group_id,
                    title: form.title.trim(),
                    description: form.description.trim() || null,
                    penalty_amount: form.penalty_amount ? Number(form.penalty_amount) : 0,
                });
                toast.success("Rule created");
            }
            setShowForm(false);
            setEditing(null);
            setForm({ title: "", description: "", penalty_amount: "" });
        } catch (err) {
            toast.error(errorMessage(err, "Could not save rule"));
        }
    };

    const handleViolationSubmit = async () => {
        const next = {};
        if (!violationForm.user_id) next.user_id = "Select who violated the rule";
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        try {
            await onRecordViolation({
                rule_id: violating.id,
                user_id: Number(violationForm.user_id),
                note: violationForm.note.trim() || null,
                penalty_amount: violationForm.penalty_amount
                    ? Number(violationForm.penalty_amount)
                    : null,
            });
            toast.success("Violation recorded");
            setViolating(null);
            setViolationForm({ user_id: "", note: "", penalty_amount: "" });
        } catch (err) {
            toast.error(errorMessage(err, "Could not record violation"));
        }
    };

    return (
        <>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-500">
                        <ShieldCheckIcon className="h-4 w-4 text-brand-500" />
                        House rules & penalties in {group.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                        Set the ground rules — penalties for breaking them show up in group balances.
                    </p>
                </div>
                {isAdmin && (
                    <Button onClick={() => (showForm ? (setShowForm(false), setEditing(null)) : openCreate())}>
                        <PlusIcon className="h-4 w-4" />
                        {showForm ? "Close" : "New rule"}
                    </Button>
                )}
            </div>

            {showForm && isAdmin && (
                <Card className="mb-5 p-5">
                    <div className="mb-4 flex items-center gap-2">
                        <PlusIcon className="h-4.5 w-4.5 text-brand-500" />
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            {editing ? "Edit rule" : `New rule in ${group.name}`}
                        </h2>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                            label="Rule"
                            placeholder="e.g. No loud music after 10pm"
                            value={form.title}
                            error={errors.title}
                            onChange={(e) => {
                                setForm({ ...form, title: e.target.value });
                                setErrors({ ...errors, title: "" });
                            }}
                        />
                        <Input
                            label="Penalty amount (₹)"
                            type="number"
                            min="0"
                            placeholder="0.00"
                            value={form.penalty_amount}
                            onChange={(e) =>
                                setForm({ ...form, penalty_amount: e.target.value })
                            }
                        />
                    </div>

                    <div className="mt-3">
                        <Textarea
                            label="Details (optional)"
                            placeholder="Explain the rule in a bit more detail"
                            value={form.description}
                            onChange={(e) =>
                                setForm({ ...form, description: e.target.value })
                            }
                        />
                    </div>

                    <div className="mt-4 flex gap-2">
                        <Button onClick={handleRuleSubmit} loading={saving}>
                            <CheckCircleIcon className="h-4 w-4" />
                            {editing ? "Save changes" : "Create rule"}
                        </Button>
                        <Button variant="secondary" onClick={() => (setShowForm(false), setEditing(null))}>
                            Cancel
                        </Button>
                    </div>
                </Card>
            )}

            {rules.length === 0 ? (
                <Card className="p-8">
                    <EmptyState
                        icon={<ShieldCheckIcon className="h-6 w-6" />}
                        title="No rules yet"
                        description={isAdmin ? "Create a rule to set expectations and penalties." : "The group admin hasn't set any rules yet."}
                    />
                </Card>
            ) : (
                <div className="space-y-3">
                    {rules.map((rule) => (
                        <Card key={rule.id} className="p-4">
                            <div className="flex flex-wrap items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400">
                                    <ShieldCheckIcon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{rule.title}</p>
                                    {rule.description && (
                                        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-500">{rule.description}</p>
                                    )}
                                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                        {rule.penalty_amount > 0 ? (
                                            <Badge variant="danger">
                                                Penalty: {formatCurrency(rule.penalty_amount)}
                                            </Badge>
                                        ) : (
                                            <Badge variant="neutral">No penalty</Badge>
                                        )}
                                        <Badge variant="neutral">by {rule.creator_name}</Badge>
                                    </div>
                                </div>
                                {isAdmin && (
                                    <div className="ml-auto flex w-full items-center justify-end gap-1 sm:w-auto">
                                        <Button size="sm" variant="secondary" onClick={() => openViolate(rule)}>
                                            <AlertIcon className="h-3.5 w-3.5" />
                                            Violation
                                        </Button>
                                        <button
                                            onClick={() => openEdit(rule)}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-700 hover:text-slate-700 dark:text-slate-300"
                                            title="Edit"
                                        >
                                            <PencilIcon className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => setDeleteTarget(rule)}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/20 dark:bg-rose-900/20 hover:text-rose-500 dark:text-rose-400"
                                            title="Delete"
                                        >
                                            <Trash2Icon className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {violations.length > 0 && (
                <Card className="mt-5 p-5">
                    <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
                        Violations
                    </h2>
                    <div className="space-y-2">
                        {violations.map((v) => (
                            <div key={v.id} className="flex items-center gap-3 rounded-lg bg-rose-50 dark:bg-rose-500/15 p-3">
                                <Avatar name={v.user_name} size="xs" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                        {v.user_name} — {v.rule_title}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-500">
                                        {v.note ? `${v.note} · ` : ""}
                                        recorded by {v.recorded_by_name} · {formatDate(v.created_at)}
                                    </p>
                                </div>
                                {v.penalty_amount > 0 && (
                                    <Badge variant="danger">{formatCurrency(v.penalty_amount)}</Badge>
                                )}
                                {isAdmin && (
                                    <button
                                        onClick={() => onDeleteViolation(v)}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/20 dark:bg-rose-900/20 hover:text-rose-500 dark:text-rose-400"
                                        title="Delete violation"
                                    >
                                        <Trash2Icon className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <ConfirmDialog
                open={!!deleteTarget}
                title="Delete rule?"
                message="This will permanently remove this rule and its violations."
                confirmLabel="Delete"
                onConfirm={() => {
                    if (deleteTarget) onDeleteRule(deleteTarget);
                    setDeleteTarget(null);
                }}
                onCancel={() => setDeleteTarget(null)}
            />

            <Modal
                open={!!violating}
                onClose={() => setViolating(null)}
                title={`Record violation — ${violating?.title || ""}`}
            >
                <div className="space-y-3">
                    <Field label="Who violated the rule?">
                        <Select
                            value={violationForm.user_id}
                            error={errors.user_id}
                            onChange={(e) => {
                                setViolationForm({ ...violationForm, user_id: e.target.value });
                                setErrors({ ...errors, user_id: "" });
                            }}
                        >
                            <option value="">Select member</option>
                            {members
                                .filter((m) => m.id !== myUserId)
                                .map((m) => (
                                    <option key={m.id} value={m.id}>
                                        {m.name}
                                    </option>
                                ))}
                        </Select>
                    </Field>
                    <Input
                        label="Penalty amount (₹)"
                        type="number"
                        min="0"
                        placeholder="0.00"
                        value={violationForm.penalty_amount}
                        onChange={(e) =>
                            setViolationForm({ ...violationForm, penalty_amount: e.target.value })
                        }
                    />
                    <Textarea
                        label="Note (optional)"
                        placeholder="What happened?"
                        value={violationForm.note}
                        onChange={(e) =>
                            setViolationForm({ ...violationForm, note: e.target.value })
                        }
                    />
                    <div className="flex gap-2 pt-1">
                        <Button onClick={handleViolationSubmit} loading={saving}>
                            <AlertIcon className="h-4 w-4" />
                            Record violation
                        </Button>
                        <Button variant="secondary" onClick={() => setViolating(null)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    );
}

function scoreColor(score) {
    if (score >= 85) return { bar: "bg-emerald-500", text: "text-emerald-600", label: "Excellent" };
    if (score >= 70) return { bar: "bg-brand-500", text: "text-brand-600 dark:text-brand-400", label: "Good" };
    if (score >= 50) return { bar: "bg-amber-500", text: "text-amber-600", label: "Fair" };
    return { bar: "bg-rose-500", text: "text-rose-600", label: "Needs work" };
}

function ReliabilityPanel({ group, scores, onRefresh, myUserId }) {
    const sorted = [...scores].sort((a, b) => b.score - a.score);

    return (
        <>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-slate-500">
                        <TrendUpIcon className="h-4 w-4 text-brand-500" />
                        Living reliability in {group.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                        A fair, transparent score built from payments, chores and violations.
                    </p>
                </div>
                <button
                    onClick={onRefresh}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-700 hover:text-slate-700 dark:text-slate-300"
                    title="Refresh"
                >
                    <RefreshCwIcon className="h-4 w-4" />
                </button>
            </div>

            {sorted.length === 0 ? (
                <Card className="p-8">
                    <EmptyState
                        icon={<TrendUpIcon className="h-6 w-6" />}
                        title="No scores yet"
                        description="Reliability scores are computed from group activity — add expenses, household duties and rules to get started."
                    />
                </Card>
            ) : (
                <div className="space-y-4">
                    {sorted.map((m) => {
                        const c = scoreColor(m.score);
                        const isMe = m.user_id === myUserId;
                        return (
                            <Card key={m.user_id} className="p-4">
                                <div className="flex items-center gap-3">
                                    <Avatar name={m.name} size="md" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                            {m.name}
                                            {isMe && <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">(you)</span>}
                                        </p>
                                        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                            <div
                                                className={`h-full rounded-full ${c.bar}`}
                                                style={{ width: `${m.score}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-2xl font-bold ${c.text}`}>{Math.round(m.score)}</p>
                                        <Badge variant={m.score >= 70 ? "success" : m.score >= 50 ? "warning" : "danger"}>
                                            {c.label}
                                        </Badge>
                                    </div>
                                </div>
                                <div className="mt-3 grid gap-2 text-xs text-slate-500 dark:text-slate-500 sm:grid-cols-3">
                                    <p>
                                        <span className="font-medium text-slate-700 dark:text-slate-300">{m.overdue_shares}</span> overdue share(s)
                                        {m.overdue_share_amount > 0 && ` (${formatCurrency(m.overdue_share_amount)})`}
                                    </p>
                                    <p>
                                        <span className="font-medium text-slate-700 dark:text-slate-300">{m.overdue_chores}</span> overdue chore(s)
                                    </p>
                                    <p>
                                        <span className="font-medium text-slate-700 dark:text-slate-300">{m.violations}</span> violation(s) · 90 days
                                    </p>
                                </div>
                                {m.deductions.length > 0 && (
                                    <ul className="mt-3 space-y-1 border-t border-slate-100 dark:border-slate-700 pt-2">
                                        {m.deductions.map((d, i) => (
                                            <li key={i} className="text-xs text-slate-500 dark:text-slate-500">• {d}</li>
                                        ))}
                                    </ul>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}
        </>
    );
}

function Household() {
    const [groups, setGroups] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [members, setMembers] = useState([]);
    const [chores, setChores] = useState([]);
    const [history, setHistory] = useState([]);
    const [schedules, setSchedules] = useState([]);
    const [rules, setRules] = useState([]);
    const [violations, setViolations] = useState([]);
    const [scores, setScores] = useState([]);
    const [tab, setTab] = useState("chores");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [myUserId, setMyUserId] = useState(null);
    const [myRole, setMyRole] = useState("member");
    const toast = useToast();

    const loadGroups = useCallback(async () => {
        const res = await api.get("/groups/");
        const myGroups = (res.data.groups || []).filter((g) => g.status === "active");
        setGroups(myGroups);
        return myGroups;
    }, []);

    const loadMembers = useCallback(async (groupId) => {
        if (!groupId) {
            setMembers([]);
            return;
        }
        const [membersRes, meRes] = await Promise.all([
            api.get("/shared-expenses/members", { params: { group_id: groupId } }),
            api.get("/auth/me"),
        ]);
        setMembers(membersRes.data.members || []);
        setMyUserId(meRes.data.user_id);
    }, []);

    const loadChores = useCallback(async (groupId) => {
        if (!groupId) {
            setChores([]);
            setHistory([]);
            return;
        }
        const [choresRes, historyRes] = await Promise.all([
            api.get("/chores/", { params: { group_id: groupId } }),
            api.get("/chores/history", { params: { group_id: groupId } }),
        ]);
        setChores(choresRes.data.chores || []);
        setHistory(historyRes.data.history || []);
    }, []);

    const loadSchedules = useCallback(async (groupId) => {
        if (!groupId) {
            setSchedules([]);
            return;
        }
        try {
            const res = await api.get("/chores/schedules", { params: { group_id: groupId } });
            setSchedules(res.data.schedules || []);
        } catch {
            setSchedules([]);
        }
    }, []);

    const generateFromSchedules = useCallback(async (groupId) => {
        if (!groupId) return;
        try {
            await api.post("/chores/schedules/generate", null, { params: { group_id: groupId } });
        } catch {
            // silent — generate is best-effort
        }
    }, []);

    const loadRules = useCallback(async (groupId) => {
        if (!groupId) {
            setRules([]);
            setViolations([]);
            return;
        }
        const [rulesRes, violationsRes] = await Promise.all([
            api.get("/rules/", { params: { group_id: groupId } }),
            api.get("/rules/violations", { params: { group_id: groupId } }),
        ]);
        setRules(rulesRes.data.rules || []);
        setViolations(violationsRes.data.violations || []);
    }, []);

    const loadScores = useCallback(async (groupId) => {
        if (!groupId) {
            setScores([]);
            return;
        }
        const res = await api.get("/reliability/", { params: { group_id: groupId } });
        setScores(res.data.members || []);
        if (res.data.my_user_id) setMyUserId(res.data.my_user_id);
    }, []);

    const selectGroup = useCallback(async (groupId) => {
        setSelectedGroupId(groupId);
        if (!groupId) {
            setMembers([]);
            setChores([]);
            setHistory([]);
            setSchedules([]);
            setRules([]);
            setViolations([]);
            setScores([]);
            setMyRole("member");
            return;
        }
        try {
            const detail = await api.get(`/groups/${groupId}`);
            setMyRole(detail.data.group.my_role || "member");
            await Promise.all([
                loadMembers(groupId),
                loadChores(groupId),
                loadSchedules(groupId),
                loadRules(groupId),
                loadScores(groupId),
                generateFromSchedules(groupId),
            ]);
            await loadChores(groupId);
        } catch (err) {
            if (err.response?.status === 403) {
                // User is not an active member of this group
                setSelectedGroupId(null);
                setMembers([]);
                setChores([]);
                setHistory([]);
                setSchedules([]);
                setRules([]);
                setViolations([]);
                setScores([]);
                setMyRole("member");
            }
        }
    }, [loadMembers, loadChores, loadSchedules, loadRules, loadScores, generateFromSchedules]);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const myGroups = await loadGroups();
                if (myGroups.length > 0) {
                    const firstId = myGroups[0].group_id;
                    if (active) {
                        selectGroup(firstId);
                    }
                } else if (active) {
                    selectGroup(null);
                }
            } catch (error) {
                console.error(error);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, [loadGroups, selectGroup]);

    // Cross-module group synchronization & background revalidation
    useEffect(() => {
        let isCurrent = true;
        const syncGroups = async () => {
            try {
                const myGroups = await loadGroups();
                if (!isCurrent) return;
                setSelectedGroupId((prevId) => {
                    const stillMember = myGroups.some((g) => g.group_id === prevId);
                    if (!stillMember) {
                        const nextId = myGroups.length > 0 ? myGroups[0].group_id : null;
                        selectGroup(nextId);
                        return nextId;
                    }
                    return prevId;
                });
            } catch {
                // Fail silently on background sync
            }
        };

        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                syncGroups();
            }
        };

        window.addEventListener("coroomies:groups-changed", syncGroups);
        window.addEventListener("focus", syncGroups);
        document.addEventListener("visibilitychange", handleVisibility);

        const pollTimer = setInterval(syncGroups, 12000);

        return () => {
            isCurrent = false;
            window.removeEventListener("coroomies:groups-changed", syncGroups);
            window.removeEventListener("focus", syncGroups);
            document.removeEventListener("visibilitychange", handleVisibility);
            clearInterval(pollTimer);
        };
    }, [loadGroups, selectGroup]);

    const addChore = async (payload) => {
        setSaving(true);
        try {
            await api.post("/chores/", payload);
            await loadChores(payload.group_id);
        } finally {
            setSaving(false);
        }
    };

    const completeChore = async (chore) => {
        try {
            await api.post(`/chores/${chore.id}/complete`);
            toast.success("Chore completed!");
            await Promise.all([loadChores(selectedGroupId), loadScores(selectedGroupId)]);
        } catch (err) {
            toast.error(errorMessage(err, "Could not complete chore"));
        }
    };

    const updateChore = async (id, payload) => {
        setSaving(true);
        try {
            await api.put(`/chores/${id}`, payload);
            await loadChores(selectedGroupId);
        } finally {
            setSaving(false);
        }
    };

    const deleteChore = async (chore) => {
        try {
            await api.delete(`/chores/${chore.id}`);
            toast.success("Chore deleted");
            await loadChores(selectedGroupId);
        } catch (err) {
            toast.error(errorMessage(err, "Could not delete chore"));
        }
    };

    const addSchedule = async (payload) => {
        setSaving(true);
        try {
            await api.post("/chores/schedules", payload);
            await loadSchedules(payload.group_id);
            await generateFromSchedules(payload.group_id);
            await loadChores(payload.group_id);
        } finally {
            setSaving(false);
        }
    };

    const updateSchedule = async (id, payload) => {
        setSaving(true);
        try {
            await api.put(`/chores/schedules/${id}`, payload);
            await loadSchedules(selectedGroupId);
        } finally {
            setSaving(false);
        }
    };

    const deleteSchedule = async (schedule) => {
        try {
            await api.delete(`/chores/schedules/${schedule.id}`);
            toast.success("Recurring task deleted");
            await loadSchedules(selectedGroupId);
        } catch (err) {
            toast.error(errorMessage(err, "Could not delete recurring task"));
        }
    };

    const addRule = async (payload) => {
        setSaving(true);
        try {
            await api.post("/rules/", payload);
            await loadRules(payload.group_id);
        } finally {
            setSaving(false);
        }
    };

    const updateRule = async (id, payload) => {
        setSaving(true);
        try {
            await api.put(`/rules/${id}`, payload);
            await loadRules(selectedGroupId);
        } finally {
            setSaving(false);
        }
    };

    const deleteRule = async (rule) => {
        try {
            await api.delete(`/rules/${rule.id}`);
            toast.success("Rule deleted");
            await loadRules(selectedGroupId);
        } catch (err) {
            toast.error(errorMessage(err, "Could not delete rule"));
        }
    };

    const recordViolation = async (payload) => {
        setSaving(true);
        try {
            const res = await api.post("/rules/violations", payload);
            await Promise.all([
                loadRules(selectedGroupId),
                loadScores(selectedGroupId),
            ]);
            return res.data;
        } finally {
            setSaving(false);
        }
    };

    const deleteViolation = async (v) => {
        try {
            await api.delete(`/rules/violations/${v.id}`);
            toast.success("Violation deleted");
            await Promise.all([
                loadRules(selectedGroupId),
                loadScores(selectedGroupId),
            ]);
        } catch (err) {
            toast.error(errorMessage(err, "Could not delete violation"));
        }
    };

    if (loading) {
        return (
            <div className="w-full max-w-4xl mx-auto">
                <PageHeader title="Household" subtitle="Chores, house rules and reliability — everything that keeps your living group fair and running smoothly." />
                <div className="flex justify-center py-24">
                    <Spinner size="lg" />
                </div>
            </div>
        );
    }

    const selectedGroup = groups.find((g) => g.group_id === selectedGroupId) || null;
    const isAdmin = myRole === "admin";

    return (
        <div className="w-full max-w-4xl mx-auto">
            <PageHeader
                title="Household"
                subtitle="Chores, house rules and reliability — everything that keeps your living group fair and running smoothly."
            />

            <div className="mb-6">
                <GroupPicker groups={groups} selectedGroupId={selectedGroupId} onChange={selectGroup} />
            </div>

            {selectedGroup ? (
                <>
                    <div className="mb-6 flex gap-1 overflow-x-auto no-scrollbar touch-scroll scroll-smooth rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-100 dark:bg-slate-800/80 p-1 shadow-xs">
                        <button
                            className={`shrink-0 sm:flex-1 whitespace-nowrap rounded-lg px-3.5 py-2 min-h-[40px] text-xs font-semibold transition-all sm:px-4 sm:text-sm cursor-pointer ${
                                tab === "chores"
                                    ? "bg-brand-600 text-white shadow-xs"
                                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-700/60"
                            }`}
                            onClick={() => setTab("chores")}
                        >
                            <CheckCircleIcon className="mr-1 inline h-4 w-4 sm:mr-1.5" />
                            Chores
                        </button>
                        <button
                            className={`shrink-0 sm:flex-1 whitespace-nowrap rounded-lg px-3.5 py-2 min-h-[40px] text-xs font-semibold transition-all sm:px-4 sm:text-sm cursor-pointer ${
                                tab === "rules"
                                    ? "bg-brand-600 text-white shadow-xs"
                                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-700/60"
                            }`}
                            onClick={() => setTab("rules")}
                        >
                            <ShieldCheckIcon className="mr-1 inline h-4 w-4 sm:mr-1.5" />
                            Rules<span className="hidden sm:inline"> &amp; penalties</span>
                        </button>
                        <button
                            className={`shrink-0 sm:flex-1 whitespace-nowrap rounded-lg px-3.5 py-2 min-h-[40px] text-xs font-semibold transition-all sm:px-4 sm:text-sm cursor-pointer ${
                                tab === "reliability"
                                    ? "bg-brand-600 text-white shadow-xs"
                                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-700/60"
                            }`}
                            onClick={() => setTab("reliability")}
                        >
                            <TrendUpIcon className="mr-1 inline h-4 w-4 sm:mr-1.5" />
                            Reliability
                        </button>
                    </div>

                    {tab === "chores" && (
                        <ChoresPanel
                            group={selectedGroup}
                            members={members}
                            chores={chores}
                            history={history}
                            schedules={schedules}
                            onAdd={addChore}
                            onComplete={completeChore}
                            onUpdate={updateChore}
                            onDelete={deleteChore}
                            onAddSchedule={addSchedule}
                            onUpdateSchedule={updateSchedule}
                            onDeleteSchedule={deleteSchedule}
                            saving={saving}
                            myUserId={myUserId}
                            isAdmin={isAdmin}
                        />
                    )}

                    {tab === "rules" && (
                        <RulesPanel
                            group={selectedGroup}
                            members={members}
                            rules={rules}
                            violations={violations}
                            onAddRule={addRule}
                            onUpdateRule={updateRule}
                            onDeleteRule={deleteRule}
                            onRecordViolation={recordViolation}
                            onDeleteViolation={deleteViolation}
                            saving={saving}
                            myUserId={myUserId}
                            isAdmin={isAdmin}
                        />
                    )}

                    {tab === "reliability" && (
                        <ReliabilityPanel
                            group={selectedGroup}
                            scores={scores}
                            onRefresh={() => loadScores(selectedGroupId)}
                            myUserId={myUserId}
                        />
                    )}
                </>
            ) : null}
        </div>
    );
}

export default Household;
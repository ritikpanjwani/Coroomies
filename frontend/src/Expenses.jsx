import { useCallback, useEffect, useRef, useState } from "react";
import api from "./api";
import Card from "./components/ui/Card";
import Button from "./components/ui/Button";
import Badge from "./components/ui/Badge";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import EmptyState from "./components/ui/EmptyState";
import Modal from "./components/ui/Modal";
import Spinner from "./components/ui/Spinner";
import PageHeader from "./components/ui/PageHeader";
import { Input, Select, Field } from "./components/ui/Field";
import { useToast } from "./components/Toast";
import {
    ReceiptIndianRupeeIcon,
    WalletIcon,
    TrendUpIcon,
    PlusIcon,
    Trash2Icon,
    CheckIcon,
    RefreshCwIcon,
    PencilIcon,
    BellIcon,
    SparklesIcon,
    XIcon,
    UtensilsIcon,
    MapPinIcon,
    ShoppingBagIcon,
    GraduationCapIcon,
    FilmIcon,
} from "./components/Icons";
import { formatCurrency, formatDate, errorMessage } from "./utils/format";

const CATEGORIES = [
    "Food",
    "Travel",
    "Shopping",
    "Bills",
    "Education",
    "Entertainment",
    "Other",
];

const CATEGORY_META = {
    Food: { icon: UtensilsIcon, color: "bg-orange-50 text-orange-600", bar: "bg-orange-400" },
    Travel: { icon: MapPinIcon, color: "bg-sky-50 text-sky-600", bar: "bg-sky-400" },
    Shopping: { icon: ShoppingBagIcon, color: "bg-violet-50 text-violet-600", bar: "bg-violet-400" },
    Bills: { icon: ReceiptIndianRupeeIcon, color: "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300", bar: "bg-slate-400" },
    Education: { icon: GraduationCapIcon, color: "bg-indigo-50 text-indigo-600", bar: "bg-indigo-400" },
    Entertainment: { icon: FilmIcon, color: "bg-rose-50 dark:bg-rose-900/20 text-rose-600", bar: "bg-rose-400" },
    Other: { icon: WalletIcon, color: "bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400", bar: "bg-brand-400" },
};

function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function BudgetCard({ budget, onSetBudget, saving }) {
    const [editing, setEditing] = useState(false);
    const [settingReminder, setSettingReminder] = useState(false);
    const [value, setValue] = useState("");
    const [reminder, setReminder] = useState("");
    const [error, setError] = useState("");

    const hasBudget = budget.monthly_budget != null;
    const spent = budget.spent || 0;
    const percent = hasBudget && budget.percent != null ? budget.percent : 0;
    const hasReminder = budget.budget_reminder != null;
    const barColor =
        !hasBudget
            ? "bg-slate-200"
            : percent > 100
            ? "bg-rose-500"
            : percent >= 80
            ? "bg-amber-400"
            : "bg-gradient-to-r from-brand-600 to-violet-500";

    const saveBudget = async () => {
        const num = Number(value);
        if (value === "" || Number.isNaN(num) || num < 0) {
            setError("Enter a valid budget amount");
            return;
        }
        try {
            await onSetBudget(num, hasReminder ? budget.budget_reminder : null);
            setEditing(false);
            setValue("");
            setError("");
        } catch (err) {
            setError(errorMessage(err, "Could not save budget"));
        }
    };

    const saveReminder = async () => {
        if (!hasBudget) {
            setError("Set a monthly budget first");
            return;
        }
        const reminderVal = reminder !== "" ? Number(reminder) : null;
        if (reminder !== "" && (Number.isNaN(reminderVal) || reminderVal < 1 || reminderVal > 100)) {
            setError("Reminder must be between 1 and 100");
            return;
        }
        try {
            await onSetBudget(budget.monthly_budget, reminderVal);
            setSettingReminder(false);
            setReminder("");
            setError("");
        } catch (err) {
            setError(errorMessage(err, "Could not save reminder"));
        }
    };

    return (
        <Card className="p-5">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <WalletIcon className="h-4.5 w-4.5 text-brand-500" />
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Monthly budget
                    </h2>
                </div>
                {!editing && !settingReminder && (
                    <div className="flex items-center gap-1.5">
                        {hasBudget && (
                            <button
                                onClick={() => {
                                    setReminder(hasReminder ? String(budget.budget_reminder) : "");
                                    setError("");
                                    setSettingReminder(true);
                                }}
                                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                                    hasReminder
                                        ? "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/30"
                                        : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                                }`}
                                title={hasReminder ? `Reminder: ${budget.budget_reminder}%` : "Set budget reminder"}
                            >
                                <BellIcon className="h-4 w-4" />
                            </button>
                        )}
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                                setValue(hasBudget ? String(budget.monthly_budget) : "");
                                setError("");
                                setEditing(true);
                            }}
                        >
                            <PencilIcon className="h-3.5 w-3.5" />
                            {hasBudget ? "Edit" : "Set budget"}
                        </Button>
                    </div>
                )}
            </div>

            {editing ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                        <Input
                            label="Monthly budget (₹)"
                            type="number"
                            min="0"
                            placeholder="e.g. 15000"
                            value={value}
                            error={error}
                            onChange={(e) => {
                                setValue(e.target.value);
                                setError("");
                            }}
                            onKeyDown={(e) => e.key === "Enter" && !saving && saveBudget()}
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button loading={saving} onClick={saveBudget}>
                            Save
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setEditing(false);
                                setError("");
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : settingReminder ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                        <Input
                            label="Budget reminder (%)"
                            type="number"
                            min="1"
                            max="100"
                            placeholder="e.g. 80"
                            hint="Get notified when spending reaches this %"
                            value={reminder}
                            error={error}
                            onChange={(e) => {
                                setReminder(e.target.value);
                                setError("");
                            }}
                            onKeyDown={(e) => e.key === "Enter" && !saving && saveReminder()}
                        />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button loading={saving} onClick={saveReminder}>
                            {hasReminder ? "Update" : "Set"} reminder
                        </Button>
                        {hasReminder && (
                            <Button
                                variant="dangerOutline"
                                size="sm"
                                onClick={async () => {
                                    try {
                                        await onSetBudget(budget.monthly_budget, null);
                                        setSettingReminder(false);
                                    } catch (err) {
                                        setError(errorMessage(err, "Could not remove reminder"));
                                    }
                                }}
                            >
                                Clear
                            </Button>
                        )}
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setSettingReminder(false);
                                setError("");
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="mt-4">
                        {hasBudget ? (
                            <>
                                <div className="flex items-end justify-between">
                                    <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                                        {formatCurrency(spent)}
                                        <span className="text-sm font-medium text-slate-400 dark:text-slate-500">
                                            {" "}
                                            of {formatCurrency(budget.monthly_budget)}
                                        </span>
                                    </p>
                                    <p
                                        className={`text-sm font-semibold ${
                                            percent > 100
                                                ? "text-rose-600"
                                                : "text-slate-500 dark:text-slate-500"
                                        }`}
                                    >
                                        {percent}%
                                    </p>
                                </div>
                                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                    <div
                                        className={`h-full rounded-full ${barColor} transition-all`}
                                        style={{ width: `${Math.min(percent, 100)}%` }}
                                    />
                                </div>
                                <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-500">
                                    {budget.remaining != null && budget.remaining >= 0
                                        ? `${formatCurrency(budget.remaining)} left this month`
                                        : `${formatCurrency(
                                              Math.abs(budget.remaining || 0)
                                          )} over budget this month`}
                                </p>
                                {hasReminder && (
                                    <p className="mt-1.5 text-xs text-brand-600 dark:text-brand-400">
                                        Reminder set at {budget.budget_reminder}% · you'll be notified when spending reaches{" "}
                                        {formatCurrency((budget.monthly_budget * budget.budget_reminder) / 100)}
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="text-sm text-slate-400 dark:text-slate-500">
                                Set a monthly budget to track how your spending stacks up.
                            </p>
                        )}
                    </div>
                </>
            )}
        </Card>
    );
}

function CategoryBreakdown({ totals }) {
    const max = Math.max(...totals.categories.map((c) => c.total), 0);

    if (totals.categories.length === 0) {
        return (
            <Card className="p-5">
                <h2 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">
                    Category breakdown
                </h2>
                <p className="text-sm text-slate-400 dark:text-slate-500">
                    No spending recorded for {formatMonth(totals.month)} yet.
                </p>
            </Card>
        );
    }

    return (
        <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Category breakdown
                </h2>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {formatCurrency(totals.total)}
                </p>
            </div>

            <div className="space-y-3">
                {totals.categories.map((cat) => {
                    const meta = CATEGORY_META[cat.category] || CATEGORY_META.Other;
                    const Icon = meta.icon;
                    const width = max > 0 ? (cat.total / max) * 100 : 0;
                    return (
                        <div key={cat.category}>
                            <div className="mb-1 flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                                    <Icon className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400" />
                                    {cat.category}
                                    <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
                                        {cat.count} {cat.count === 1 ? "entry" : "entries"}
                                    </span>
                                </span>
                                <span className="font-semibold text-slate-900 dark:text-slate-100">
                                    {formatCurrency(cat.total)}
                                </span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                                <div
                                    className={`h-full rounded-full ${meta.bar}`}
                                    style={{ width: `${width}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

function formatMonth(month) {
    if (!month) return "";
    const [y, m] = month.split("-").map(Number);
    const names = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];
    return `${names[m - 1]} ${y}`;
}

function RecurringCard({
    recurring,
    onAdd,
    onDelete,
    onToggle,
    saving,
}) {
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({
        category: "",
        subcategory: "",
        amount: "",
        frequency: "monthly",
        start_date: today(),
        end_date: "",
    });
    const [errors, setErrors] = useState({});
    const toast = useToast();

    const reset = () => {
        setForm({
            category: "",
            subcategory: "",
            amount: "",
            frequency: "monthly",
            start_date: today(),
            end_date: "",
        });
        setErrors({});
        setShowForm(false);
    };

    const handleSubmit = async () => {
        const next = {};
        if (!form.category) next.category = "Select a category";
        if (!form.subcategory.trim()) next.subcategory = "Add a description";
        if (!form.amount || Number(form.amount) <= 0)
            next.amount = "Enter a valid amount";
        if (!form.start_date) next.start_date = "Pick a start date";
        if (
            form.end_date &&
            form.start_date &&
            form.end_date < form.start_date
        ) {
            next.end_date = "End date must be after start date";
        }
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        try {
            await onAdd({
                category: form.category,
                subcategory: form.subcategory.trim(),
                amount: Number(form.amount),
                frequency: form.frequency,
                start_date: form.start_date,
                end_date: form.end_date || null,
            });
            toast.success("Recurring expense added");
            reset();
        } catch (err) {
            toast.error(errorMessage(err, "Could not add recurring expense"));
        }
    };

    return (
        <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <SparklesIcon className="h-4.5 w-4.5 text-brand-500" />
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        Recurring expenses
                    </h2>
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => (showForm ? reset() : setShowForm(true))}
                >
                    {showForm ? <XIcon className="h-3.5 w-3.5" /> : <PlusIcon className="h-3.5 w-3.5" />}
                    {showForm ? "Cancel" : "Add recurring"}
                </Button>
            </div>

            {showForm && (
                <div className="mb-5 rounded-lg bg-slate-50 dark:bg-slate-900 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Select
                            label="Category"
                            value={form.category}
                            error={errors.category}
                            onChange={(e) => {
                                setForm({ ...form, category: e.target.value });
                                setErrors({ ...errors, category: "" });
                            }}
                        >
                            <option value="">Select</option>
                            {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </Select>

                        <Input
                            label="Description"
                            placeholder="e.g. Rent, Netflix"
                            value={form.subcategory}
                            error={errors.subcategory}
                            onChange={(e) => {
                                setForm({ ...form, subcategory: e.target.value });
                                setErrors({ ...errors, subcategory: "" });
                            }}
                        />

                        <Input
                            label="Amount (₹)"
                            type="number"
                            min="0"
                            placeholder="0.00"
                            value={form.amount}
                            error={errors.amount}
                            onChange={(e) => {
                                setForm({ ...form, amount: e.target.value });
                                setErrors({ ...errors, amount: "" });
                            }}
                        />

                        <Select
                            label="Frequency"
                            value={form.frequency}
                            onChange={(e) =>
                                setForm({ ...form, frequency: e.target.value })
                            }
                        >
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Yearly</option>
                        </Select>

                        <Input
                            label="Start date"
                            type="date"
                            value={form.start_date}
                            error={errors.start_date}
                            onChange={(e) => {
                                setForm({ ...form, start_date: e.target.value });
                                setErrors({ ...errors, start_date: "" });
                            }}
                        />

                        <Input
                            label="End date (optional)"
                            type="date"
                            value={form.end_date}
                            error={errors.end_date}
                            onChange={(e) => {
                                setForm({ ...form, end_date: e.target.value });
                                setErrors({ ...errors, end_date: "" });
                            }}
                        />
                    </div>

                    <Button
                        className="mt-4"
                        loading={saving}
                        onClick={handleSubmit}
                    >
                        <PlusIcon className="h-4 w-4" />
                        Add recurring
                    </Button>
                </div>
            )}

            {recurring.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                    No recurring expenses yet. Rent, subscriptions and memberships can
                    be auto-logged here.
                </p>
            ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {recurring.map((item) => {
                        const meta =
                            CATEGORY_META[item.category] || CATEGORY_META.Other;
                        const Icon = meta.icon;
                        return (
                            <div
                                key={item.id}
                                className="flex items-center gap-3 py-3"
                            >
                                <div
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${meta.color}`}
                                >
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                                        {item.subcategory}
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">
                                        {item.category} · {item.frequency} · next{" "}
                                        {formatDate(item.next_run_date)}
                                    </p>
                                </div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {formatCurrency(item.amount)}
                                </p>
                                <Badge
                                    variant={item.active ? "success" : "neutral"}
                                    dot
                                >
                                    {item.active ? "active" : "paused"}
                                </Badge>
                                <button
                                    onClick={() => onToggle(item.id, item.active)}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-700 hover:text-slate-700 dark:text-slate-300"
                                    title={item.active ? "Pause" : "Resume"}
                                >
                                    {item.active ? (
                                        <XIcon className="h-4 w-4" />
                                    ) : (
                                        <CheckIcon className="h-4 w-4" />
                                    )}
                                </button>
                                <button
                                    onClick={() => onDelete(item.id)}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/20 dark:bg-rose-900/20 hover:text-rose-500 dark:text-rose-400"
                                    title="Delete recurring expense"
                                >
                                    <Trash2Icon className="h-4 w-4" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
}

function ExpenseFormModal({ open, onClose, editing, onAdd, onUpdate, saving }) {
    if (!open) return null;
    return (
        <ExpenseFormInner
            key={editing ? `edit-${editing.id}` : "new"}
            onClose={onClose}
            editing={editing}
            onAdd={onAdd}
            onUpdate={onUpdate}
            saving={saving}
        />
    );
}

function ExpenseFormInner({ onClose, editing, onAdd, onUpdate, saving }) {
    const [form, setForm] = useState(
        editing
            ? {
                  category: editing.category,
                  subcategory: editing.subcategory,
                  amount: String(editing.amount),
                  expense_date: editing.expense_date,
              }
            : {
                  category: "",
                  subcategory: "",
                  amount: "",
                  expense_date: today(),
              }
    );
    const [errors, setErrors] = useState({});
    const toast = useToast();

    const handleSubmit = async () => {
        const next = {};
        if (!form.category) next.category = "Select a category";
        if (!form.subcategory.trim()) next.subcategory = "Add a description";
        if (!form.amount || Number(form.amount) <= 0)
            next.amount = "Enter a valid amount";
        if (!form.expense_date) next.expense_date = "Pick a date";
        setErrors(next);
        if (Object.keys(next).length > 0) return;

        const payload = {
            category: form.category,
            subcategory: form.subcategory.trim(),
            amount: Number(form.amount),
            expense_date: form.expense_date,
        };

        try {
            if (editing) {
                await onUpdate(editing.id, payload);
                toast.success("Expense updated!");
            } else {
                await onAdd(payload);
                toast.success("Expense added!");
            }
            onClose();
        } catch (err) {
            toast.error(
                errorMessage(err, editing ? "Could not update expense" : "Could not add expense")
            );
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title={editing ? "Edit expense" : "Add expense"}
        >
            <div className="grid gap-3 sm:grid-cols-2">
                <Select
                    label="Category"
                    value={form.category}
                    error={errors.category}
                    onChange={(e) => {
                        setForm({ ...form, category: e.target.value });
                        setErrors({ ...errors, category: "" });
                    }}
                >
                    <option value="">Select</option>
                    {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </Select>

                <Input
                    label="Description"
                    placeholder="e.g. Lunch"
                    value={form.subcategory}
                    error={errors.subcategory}
                    onChange={(e) => {
                        setForm({ ...form, subcategory: e.target.value });
                        setErrors({ ...errors, subcategory: "" });
                    }}
                />

                <Input
                    label="Amount (₹)"
                    type="number"
                    min="0"
                    placeholder="0.00"
                    value={form.amount}
                    error={errors.amount}
                    onChange={(e) => {
                        setForm({ ...form, amount: e.target.value });
                        setErrors({ ...errors, amount: "" });
                    }}
                />

                <Input
                    label="Date"
                    type="date"
                    value={form.expense_date}
                    error={errors.expense_date}
                    onChange={(e) => {
                        setForm({ ...form, expense_date: e.target.value });
                        setErrors({ ...errors, expense_date: "" });
                    }}
                />
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={onClose}>
                    Cancel
                </Button>
                <Button loading={saving} onClick={handleSubmit}>
                    {editing ? (
                        <CheckIcon className="h-4 w-4" />
                    ) : (
                        <PlusIcon className="h-4 w-4" />
                    )}
                    {editing ? "Save changes" : "Add expense"}
                </Button>
            </div>
        </Modal>
    );
}

function PersonalExpenses({
    section,
    expenses,
    budget,
    categoryTotals,
    filters,
    onFiltersChange,
    onSetBudget,
    onEdit,
    onDelete,
    recurring,
    onAddRecurring,
    onDeleteRecurring,
    onToggleRecurring,
    savingBudget,
    savingRecurring,
}) {
    const topCategory =
        expenses.length > 0
            ? Object.entries(
                  expenses.reduce((acc, e) => {
                      acc[e.category] = (acc[e.category] || 0) + Number(e.amount || 0);
                      return acc;
                  }, {})
              ).sort((a, b) => b[1] - a[1])[0][0]
            : null;

    if (section === "overview") {
        const stats = [
            {
                label: `Spent · ${formatMonth(categoryTotals.month)}`,
                value: formatCurrency(categoryTotals.total),
                icon: <WalletIcon className="h-4.5 w-4.5" />,
                accent: "from-amber-500 to-orange-500",
            },
            {
                label: "Entries shown",
                value: expenses.length,
                icon: <ReceiptIndianRupeeIcon className="h-4.5 w-4.5" />,
                accent: "from-brand-600 to-violet-500",
            },
            {
                label: "Top category",
                value: topCategory || "—",
                icon: <TrendUpIcon className="h-4.5 w-4.5" />,
                accent: "from-sky-500 to-blue-500",
            },
        ];

        return (
            <div className="space-y-5">
                {/* Stats */}
                <div className="grid gap-4 sm:grid-cols-3">
                    {stats.map((stat) => (
                        <Card key={stat.label} className="flex items-center gap-4 p-4">
                            <div
                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${stat.accent} text-white shadow-sm`}
                            >
                                {stat.icon}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-lg font-bold text-slate-900 dark:text-slate-100">
                                    {stat.value}
                                </p>
                                <p className="text-xs font-medium text-slate-500 dark:text-slate-500">
                                    {stat.label}
                                </p>
                            </div>
                        </Card>
                    ))}
                </div>

                <BudgetCard
                    budget={budget}
                    onSetBudget={onSetBudget}
                    saving={savingBudget}
                />

                <CategoryBreakdown totals={categoryTotals} />
            </div>
        );
    }

    if (section === "history") {
        return (
            <div className="space-y-5">
                {/* Filters */}
                <Card className="p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Month">
                            <Input
                                type="month"
                                value={filters.month}
                                onChange={(e) =>
                                    onFiltersChange({ ...filters, month: e.target.value })
                                }
                            />
                        </Field>
                        <Field label="Category">
                            <Select
                                value={filters.category}
                                onChange={(e) =>
                                    onFiltersChange({ ...filters, category: e.target.value })
                                }
                            >
                                <option value="">All categories</option>
                                {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </Select>
                        </Field>
                    </div>
                </Card>

                {/* History */}
                <Card className="p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                            Expense history
                        </h2>
                        {filters.category && (
                            <Badge variant="neutral">
                                {filters.category}
                                <button
                                    onClick={() => onFiltersChange({ ...filters, category: "" })}
                                    className="ml-1 text-slate-400 hover:text-slate-600 dark:text-slate-300"
                                >
                                    <XIcon className="h-3 w-3" />
                                </button>
                            </Badge>
                        )}
                    </div>

                    {expenses.length === 0 ? (
                        <EmptyState
                            compact
                            icon={<ReceiptIndianRupeeIcon className="h-6 w-6" />}
                            title="No expenses found"
                            description="Add an expense or adjust your filters to see entries here."
                        />
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                            {expenses.map((expense) => {
                                const meta =
                                    CATEGORY_META[expense.category] ||
                                    CATEGORY_META.Other;
                                const Icon = meta.icon;
                                return (
                                    <div
                                        key={expense.id}
                                        className="flex items-center gap-3 py-3"
                                    >
                                        <div
                                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${meta.color}`}
                                        >
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                                                {expense.subcategory}
                                            </p>
                                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                                {expense.category} · {formatDate(expense.expense_date)}
                                            </p>
                                        </div>
                                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                            {formatCurrency(expense.amount)}
                                        </p>
                                        <button
                                            onClick={() => onEdit(expense)}
                                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-700 hover:text-slate-700 dark:text-slate-300"
                                            title="Edit expense"
                                        >
                                            <PencilIcon className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => onDelete(expense.id)}
className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/20 dark:bg-rose-900/20 hover:text-rose-500 dark:text-rose-400"
                                            title="Delete expense"
                                        >
                                            <Trash2Icon className="h-4 w-4" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            </div>
        );
    }

    return (
        <RecurringCard
            recurring={recurring}
            onAdd={onAddRecurring}
            onDelete={onDeleteRecurring}
            onToggle={onToggleRecurring}
            saving={savingRecurring}
        />
    );
}


function Expenses() {
    const [tab, setTab] = useState("overview");
    const [formOpen, setFormOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState(null);
    const [personalExpenses, setPersonalExpenses] = useState([]);
    const [budget, setBudget] = useState({
        month: currentMonth(),
        monthly_budget: null,
        budget_reminder: null,
        spent: 0,
        remaining: null,
        percent: null,
    });
    const [categoryTotals, setCategoryTotals] = useState({
        month: currentMonth(),
        total: 0,
        categories: [],
    });
    const [recurring, setRecurring] = useState([]);
    const [filters, setFilters] = useState({
        month: currentMonth(),
        category: "",
    });
    const [loading, setLoading] = useState(true);
    const [savingPersonal, setSavingPersonal] = useState(false);
    const [savingBudget, setSavingBudget] = useState(false);
    const [savingRecurring, setSavingRecurring] = useState(false);
    const filterSeqRef = useRef(0);
    const [deleteTarget, setDeleteTarget] = useState({ id: null });
    const [deleting, setDeleting] = useState(false);
    const toast = useToast();

    const loadPersonal = useCallback(async (f) => {
        const params = {};
        if (f.month) params.month = f.month;
        if (f.category) params.category = f.category;

        const [expensesRes, totalsRes, budgetRes, recurringRes] =
            await Promise.all([
                api.get("/expenses/", { params }),
                api.get("/expenses/category-totals", {
                    params: f.month ? { month: f.month } : {},
                }),
                api.get("/expenses/budget", {
                    params: f.month ? { month: f.month } : {},
                }),
                api.get("/expenses/recurring"),
            ]);
        setPersonalExpenses(expensesRes.data.expenses || []);
        setCategoryTotals(totalsRes.data);
        setBudget(budgetRes.data);
        setRecurring(recurringRes.data.recurring || []);
    }, []);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                await loadPersonal(filters);
            } catch (error) {
                console.error(error);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadPersonal]);

    const changeFilters = async (next) => {
        setFilters(next);
        const seq = ++filterSeqRef.current;
        try {
            await loadPersonal(next);
        } catch (error) {
            if (filterSeqRef.current === seq) {
                toast.error(errorMessage(error, "Could not load expenses"));
            }
        }
    };

    const addPersonalExpense = async (payload) => {
        setSavingPersonal(true);
        try {
            await api.post("/expenses/", payload);
            await loadPersonal(filters);
        } finally {
            setSavingPersonal(false);
        }
    };

    const updatePersonalExpense = async (expenseId, payload) => {
        setSavingPersonal(true);
        try {
            await api.put(`/expenses/${expenseId}`, payload);
            await loadPersonal(filters);
        } finally {
            setSavingPersonal(false);
        }
    };

    const setBudgetValue = async (value, reminderValue) => {
        setSavingBudget(true);
        try {
            await api.put("/expenses/budget", {
                monthly_budget: value,
                budget_reminder: reminderValue,
            });
            toast.success("Monthly budget updated");
            await loadPersonal(filters);
        } catch (err) {
            toast.error(errorMessage(err, "Could not save budget"));
            throw err;
        } finally {
            setSavingBudget(false);
        }
    };

    const addRecurringExpense = async (payload) => {
        setSavingRecurring(true);
        try {
            await api.post("/expenses/recurring", payload);
            await loadPersonal(filters);
        } finally {
            setSavingRecurring(false);
        }
    };

    const deleteRecurringExpense = async (id) => {
        try {
            await api.delete(`/expenses/recurring/${id}`);
            toast.success("Recurring expense deleted");
            await loadPersonal(filters);
        } catch (err) {
            toast.error(errorMessage(err, "Could not delete recurring expense"));
        }
    };

    const toggleRecurringExpense = async (id, active) => {
        try {
            const current = recurring.find((r) => r.id === id);
            if (!current) return;
            await api.put(`/expenses/recurring/${id}`, {
                category: current.category,
                subcategory: current.subcategory,
                amount: current.amount,
                frequency: current.frequency,
                start_date: current.start_date,
                end_date: current.end_date,
                active: !active,
            });
            toast.success(active ? "Recurring expense paused" : "Recurring expense resumed");
            await loadPersonal(filters);
        } catch (err) {
            toast.error(errorMessage(err, "Could not update recurring expense"));
        }
    };

    const deleteExpense = async () => {
        const { id } = deleteTarget;
        try {
            setDeleting(true);
            await api.delete(`/expenses/${id}`);
            await loadPersonal(filters);
            toast.success("Expense deleted");
            setDeleteTarget({ id: null });
        } catch (err) {
            toast.error(errorMessage(err, "Could not delete expense"));
        } finally {
            setDeleting(false);
        }
    };

    if (loading) {
        return (
            <div className="w-full max-w-4xl mx-auto">
                <PageHeader title="Expenses" subtitle="Track your personal spending, budget and recurring costs." />
                <div className="flex justify-center py-24">
                    <Spinner size="lg" />
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-4xl mx-auto">
            <PageHeader
                title="Expenses"
                subtitle="Track your personal spending, budget and recurring costs."
                actions={
                    <Button
                        onClick={() => {
                            setEditingExpense(null);
                            setFormOpen(true);
                        }}
                    >
                        <PlusIcon className="h-4 w-4" />
                        Add expense
                    </Button>
                }
            />

            {/* Tabs */}
            <div className="mb-6 flex gap-1.5 overflow-x-auto no-scrollbar touch-scroll scroll-smooth rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 shadow-sm">
                {[
                    { key: "overview", label: "Overview", icon: <TrendUpIcon className="mr-1.5 inline h-4 w-4" /> },
                    { key: "history", label: "History", icon: <ReceiptIndianRupeeIcon className="mr-1.5 inline h-4 w-4" /> },
                    { key: "recurring", label: "Recurring", icon: <RefreshCwIcon className="mr-1.5 inline h-4 w-4" /> },
                ].map(({ key, label, icon }) => (
                    <button
                        key={key}
                        className={`shrink-0 sm:flex-1 whitespace-nowrap rounded-lg px-3.5 py-2 min-h-[42px] text-xs font-medium transition-colors sm:px-4 sm:text-sm ${
                            tab === key
                                ? "bg-gradient-to-r from-brand-600 to-violet-500 text-white shadow-sm"
                                : "text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900"
                        }`}
                        onClick={() => setTab(key)}
                    >
                        {icon}
                        {label}
                    </button>
                ))}
            </div>

            {tab === "overview" && (
                <PersonalExpenses
                    section="overview"
                    expenses={personalExpenses}
                    budget={budget}
                    categoryTotals={categoryTotals}
                    filters={filters}
                    onFiltersChange={changeFilters}
                    onSetBudget={setBudgetValue}
                    savingBudget={savingBudget}
                />
            )}

            {tab === "history" && (
                <PersonalExpenses
                    section="history"
                    expenses={personalExpenses}
                    budget={budget}
                    categoryTotals={categoryTotals}
                    filters={filters}
                    onFiltersChange={changeFilters}
                    onEdit={(expense) => {
                        setEditingExpense(expense);
                        setFormOpen(true);
                    }}
                    onDelete={(id) => setDeleteTarget({ id })}
                    savingBudget={savingBudget}
                />
            )}

            {tab === "recurring" && (
                <PersonalExpenses
                    section="recurring"
                    expenses={personalExpenses}
                    recurring={recurring}
                    onAddRecurring={addRecurringExpense}
                    onDeleteRecurring={deleteRecurringExpense}
                    onToggleRecurring={toggleRecurringExpense}
                    savingRecurring={savingRecurring}
                />
            )}

            <ExpenseFormModal
                open={formOpen}
                onClose={() => setFormOpen(false)}
                editing={editingExpense}
                onAdd={addPersonalExpense}
                onUpdate={updatePersonalExpense}
                saving={savingPersonal}
            />

            <ConfirmDialog
                open={!!deleteTarget.id}
                title="Delete expense?"
                message="This will permanently remove this expense. This action cannot be undone."
                confirmLabel="Delete"
                loading={deleting}
                onConfirm={deleteExpense}
                onCancel={() => setDeleteTarget({ id: null })}
            />
        </div>
    );
}

export default Expenses;

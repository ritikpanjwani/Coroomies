import { useState, useEffect } from "react";
import QRCode from "qrcode";
import api from "./api";
import Avatar from "./components/ui/Avatar";
import Badge from "./components/ui/Badge";
import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import EmptyState from "./components/ui/EmptyState";
import Modal from "./components/ui/Modal";
import { Input } from "./components/ui/Field";
import { useToast } from "./components/Toast";
import {
    AlertIcon,
    ArrowLeftIcon,
    ArrowUpRight,
    ArrowLeftRightIcon,
    BellIcon,
    CheckCircleIcon,
    CheckIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    ClockIcon,
    CopyIcon,
    ReceiptIndianRupeeIcon,
    ShieldCheckIcon,
    Trash2Icon,
    WalletIcon,
} from "./components/Icons";
import { formatCurrency, formatDate, errorMessage } from "./utils/format";
import { buildUpiDeepLink, isMobileDevice } from "./utils/upi";

/* ---------------- Shared expense bubble (inside group chat) ---------------- */

export function ExpenseBubble({ expense, myUserId, paying, onOpen, onPay }) {
    const paidCount = expense.shares.filter((s) => s.status === "paid").length;
    const total = expense.shares.length || 1;
    const myShare = expense.shares.find((s) => s.user_id === myUserId);
    const canPay = myShare && myShare.status === "pending";
    const isReported = myShare && myShare.status === "payment_reported";
    const isPayer = expense.payer_id === myUserId;

    return (
        <div className="flex items-end gap-2 justify-start">
            <div className="w-full max-w-[92%] sm:max-w-[76%] overflow-hidden rounded-2xl rounded-bl-md bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200/70 dark:ring-slate-700/80">
                <div className="p-3.5">
                    <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-950/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-300">
                            <ReceiptIndianRupeeIcon className="h-3 w-3" /> Shared Expense
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            {formatDate(expense.created_at)}
                        </span>
                    </div>

                    <p className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {expense.description}
                    </p>

                    <div className="mt-1 flex items-baseline justify-between gap-3">
                        <div>
                            <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                                {formatCurrency(expense.amount)}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Paid by <span className="font-medium text-slate-700 dark:text-slate-200">{isPayer ? "You" : (expense.payer_name || "Member")}</span>
                            </p>
                        </div>
                        <div className="flex -space-x-1.5">
                            {expense.shares.slice(0, 5).map((s) => (
                                <span
                                    key={s.user_id}
                                    className="inline-flex ring-2 ring-white dark:ring-slate-800 rounded-full"
                                    title={`${s.user_name}: ${formatCurrency(s.amount)} (${s.status})`}
                                >
                                    <Avatar name={s.user_name} size="xs" />
                                </span>
                            ))}
                            {expense.shares.length > 5 && (
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 ring-2 ring-white dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-800">
                                    +{expense.shares.length - 5}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2.5 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                            <div
                                className="h-full rounded-full bg-brand-600 transition-all"
                                style={{
                                    width: `${Math.round((paidCount / total) * 100)}%`,
                                }}
                            />
                        </div>
                        <span className="shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {paidCount}/{total} paid
                        </span>
                    </div>

                    {/* My Share Status indicator */}
                    {myShare && (
                        <div className="mt-2.5 flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-700/60">
                            <span className="text-slate-500 dark:text-slate-400">Your share:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {formatCurrency(myShare.amount)}
                                {myShare.status === "paid" ? (
                                    <span className="ml-1.5 inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                                        <CheckCircleIcon className="h-3 w-3" /> Paid
                                    </span>
                                ) : myShare.status === "payment_reported" ? (
                                    <span className="ml-1.5 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                                        <ClockIcon className="h-3 w-3" /> Pending Confirmation
                                    </span>
                                ) : (
                                    <span className="ml-1.5 text-rose-500 font-medium">Unpaid</span>
                                )}
                            </span>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex border-t border-slate-100 dark:border-slate-700 divide-x divide-slate-100 dark:divide-slate-700 bg-slate-50/60 dark:bg-slate-800/80">
                    <button
                        onClick={() => onOpen(expense)}
                        type="button"
                        className="flex-1 min-h-[44px] py-2 px-2 text-xs font-semibold text-brand-600 dark:text-brand-300 hover:bg-brand-50/50 dark:hover:bg-brand-950/30 transition-colors text-center flex items-center justify-center"
                    >
                        View Details
                    </button>
                    {canPay && (
                        <button
                            onClick={() => onPay(expense, myShare)}
                            disabled={paying}
                            type="button"
                            className="flex-1 min-h-[44px] py-2 px-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors text-center disabled:opacity-60 flex items-center justify-center"
                        >
                            {paying ? "Opening UPI..." : `Pay ${formatCurrency(myShare.amount)}`}
                        </button>
                    )}
                    {isReported && (
                        <button
                            onClick={() => onPay(expense, myShare)}
                            type="button"
                            className="flex-1 min-h-[44px] py-2 px-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 transition-colors text-center flex items-center justify-center"
                        >
                            Confirming
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ---------------- Expenses tab panel ---------------- */

export function GroupExpensesPanel({
    group,
    myUserId,
    expenses = [],
    balances,
    settlements = [],
    loading,
    onSplit,
    onSettle,
    onOpenSettleWith,
    onExpenseClick,
    onPayOwed,
    onRefresh,
}) {
    const toast = useToast();
    const groupId = group.group_id ?? group.id;
    const normalizedMyId = myUserId != null ? Number(myUserId) : null;

    const [confirmingPayerId, setConfirmingPayerId] = useState(null);
    const [rejectingPayerId, setRejectingPayerId] = useState(null);
    const [undoingSettlementId, setUndoingSettlementId] = useState(null);
    const isAdmin = group?.current_user_role === "admin" || group?.role === "admin";

    // Debts owed strictly by the current user
    const owedByMe = (balances?.owes || []).filter(
        (o) => normalizedMyId != null && Number(o.from_user_id) === normalizedMyId && Number(o.amount) > 0.004
    );

    // Debts owed strictly to the current user
    const owedToMeList = (balances?.owes || []).filter(
        (o) => normalizedMyId != null && Number(o.to_user_id) === normalizedMyId && Number(o.amount) > 0.004
    );

    // Totals calculated from actual unpaid balances
    const totalYouOwe = owedByMe.reduce((sum, o) => sum + Number(o.amount || 0), 0);
    const totalOwedToYou = owedToMeList.reduce((sum, o) => sum + Number(o.amount || 0), 0);

    // Past settled expenses
    const settledExpenses = expenses.filter((e) => e.status === "settled");

    const handleConfirmReceipt = async (payerId, payerName) => {
        if (confirmingPayerId || rejectingPayerId) return;
        setConfirmingPayerId(payerId);
        try {
            const res = await api.post("/shared-expenses/confirm-settlement-receipt", {
                group_id: groupId,
                payer_id: payerId,
            });
            toast.success(res.data.message || `Confirmed payment from ${payerName}!`);
            if (onRefresh) await onRefresh();
        } catch (err) {
            toast.error(errorMessage(err, "Could not confirm payment"));
        } finally {
            setConfirmingPayerId(null);
        }
    };

    const handleRejectReceipt = async (payerId) => {
        if (confirmingPayerId || rejectingPayerId) return;
        setRejectingPayerId(payerId);
        try {
            const res = await api.post("/shared-expenses/reject-settlement-receipt", {
                group_id: groupId,
                payer_id: payerId,
            });
            toast.info(res.data.message || "Payment status reset to pending");
            if (onRefresh) await onRefresh();
        } catch (err) {
            toast.error(errorMessage(err, "Could not reset payment"));
        } finally {
            setRejectingPayerId(null);
        }
    };

    const handleUndoSettlement = async (settlementId, payerName, amount) => {
        if (undoingSettlementId) return;
        const confirmed = window.confirm(
            `Mark ₹${Number(amount).toFixed(2)} from ${payerName} as not received?\n\nThis will restore the debt balance to Unpaid.`
        );
        if (!confirmed) return;

        setUndoingSettlementId(settlementId);
        try {
            const res = await api.post(`/shared-expenses/settlements/${settlementId}/undo`);
            toast.info(res.data.message || "Settlement reversed. Balance restored to Unpaid.");
            if (onRefresh) await onRefresh();
        } catch (err) {
            toast.error(errorMessage(err, "Could not undo settlement"));
        } finally {
            setUndoingSettlementId(null);
        }
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 dark:bg-slate-900/60 p-3.5 sm:p-5 touch-scroll">
                {loading ? (
                    <div className="flex justify-center py-16">
                        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-slate-200 border-t-brand-500" />
                    </div>
                ) : (
                    <>
                        {/* 2 Clear Balance Summary Cards */}
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            {/* You Owe Card */}
                            <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm ring-1 ring-rose-200/70 dark:ring-rose-900/40 relative overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                                        You Owe
                                    </span>
                                    <span className="rounded-full bg-rose-50 dark:bg-rose-950/60 p-1.5 text-rose-500">
                                        <ArrowUpRight className="h-4 w-4" />
                                    </span>
                                </div>
                                <p className="mt-2 text-2xl font-black text-rose-600 dark:text-rose-400 sm:text-3xl">
                                    {formatCurrency(totalYouOwe)}
                                </p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {owedByMe.length === 0
                                        ? "All settled up"
                                        : `To ${owedByMe.length} member${owedByMe.length !== 1 ? "s" : ""}`}
                                </p>
                            </div>

                            {/* Owed to You Card */}
                            <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-sm ring-1 ring-emerald-200/70 dark:ring-emerald-900/40 relative overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                        Owed to You
                                    </span>
                                    <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/60 p-1.5 text-emerald-500">
                                        <ArrowLeftRightIcon className="h-4 w-4" />
                                    </span>
                                </div>
                                <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400 sm:text-3xl">
                                    {formatCurrency(totalOwedToYou)}
                                </p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {owedToMeList.length === 0
                                        ? "All settled up"
                                        : `From ${owedToMeList.length} member${owedToMeList.length !== 1 ? "s" : ""}`}
                                </p>
                            </div>
                        </div>

                        {/* Owed by You Section */}
                        {owedByMe.length > 0 && (
                            <Card className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                            Owed by You
                                        </h3>
                                        <Badge variant="danger">{owedByMe.length}</Badge>
                                    </div>
                                    <span className="text-xs text-slate-400">Tap a member to settle</span>
                                </div>

                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {owedByMe.map((o) => {
                                        const memberExpenses = (expenses || []).filter(
                                            (e) =>
                                                Number(e.payer_id) === Number(o.to_user_id) &&
                                                e.shares?.some(
                                                    (s) =>
                                                        Number(s.user_id) === normalizedMyId &&
                                                        s.status !== "paid"
                                                )
                                        );
                                        const unpaidCount = memberExpenses.length;
                                        const hasReported = memberExpenses.some((e) =>
                                            e.shares?.some(
                                                (s) =>
                                                    Number(s.user_id) === normalizedMyId &&
                                                    s.status === "payment_reported"
                                            )
                                        );

                                        return (
                                            <div
                                                key={`owed-by-${o.from_user_id}-${o.to_user_id}`}
                                                onClick={() => {
                                                    if (onOpenSettleWith) onOpenSettleWith(o);
                                                    else if (onPayOwed) onPayOwed(o);
                                                }}
                                                className="flex items-center gap-3 py-3 px-1 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-850 cursor-pointer transition-colors"
                                            >
                                                <Avatar name={o.to_name} size="md" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                        {o.to_name}
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                                            {unpaidCount > 0
                                                                ? `${unpaidCount} unpaid expense${unpaidCount !== 1 ? "s" : ""}`
                                                                : "Outstanding balance"}
                                                        </span>
                                                        {o.to_upi_id ? (
                                                            <span className="text-[10px] font-mono rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-slate-500">
                                                                UPI: {o.to_upi_id}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] text-amber-500 font-medium">
                                                                No UPI ID set
                                                            </span>
                                                        )}
                                                        {hasReported && (
                                                            <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                                                                <ClockIcon className="h-3 w-3" />
                                                                <span>Verification Pending</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2.5 shrink-0">
                                                    <p className="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                                        {formatCurrency(o.amount)}
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (onOpenSettleWith) onOpenSettleWith(o);
                                                            else if (onPayOwed) onPayOwed(o);
                                                        }}
                                                        className="min-h-[40px] rounded-lg bg-brand-600 hover:bg-brand-700 active:scale-95 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all focus:outline-none whitespace-nowrap flex items-center justify-center"
                                                    >
                                                        Settle Up
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Card>
                        )}

                        {/* Owed to You Section */}
                        {owedToMeList.length > 0 && (
                            <Card className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                            Owed to You
                                        </h3>
                                        <Badge variant="success">{owedToMeList.length}</Badge>
                                    </div>
                                    <span className="text-xs text-slate-400">Money owed to you</span>
                                </div>

                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {owedToMeList.map((o) => {
                                        const memberExpenses = (expenses || []).filter(
                                            (e) =>
                                                Number(e.payer_id) === normalizedMyId &&
                                                e.shares?.some(
                                                    (s) =>
                                                        Number(s.user_id) === Number(o.from_user_id) &&
                                                        s.status !== "paid"
                                                )
                                        );
                                        const unpaidCount = memberExpenses.length;
                                        const reportedShares = (expenses || []).flatMap((e) =>
                                            Number(e.payer_id) === normalizedMyId
                                                ? e.shares?.filter(
                                                      (s) =>
                                                          Number(s.user_id) === Number(o.from_user_id) &&
                                                          s.status === "payment_reported"
                                                  ) || []
                                                : []
                                        );
                                        const hasReported = reportedShares.length > 0;
                                        const reportedAmount = reportedShares.reduce(
                                            (sum, s) => sum + Number(s.amount || 0),
                                            0
                                        );
                                        const isConfirming = confirmingPayerId === o.from_user_id;
                                        const isRejecting = rejectingPayerId === o.from_user_id;

                                        return (
                                            <div
                                                key={`owed-to-${o.from_user_id}-${o.to_user_id}`}
                                                className="py-3 px-1"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Avatar name={o.from_name} size="md" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                            {o.from_name}
                                                        </p>
                                                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                                                            {unpaidCount > 0
                                                                ? `${unpaidCount} unpaid expense${unpaidCount !== 1 ? "s" : ""}`
                                                                : "Outstanding balance"}
                                                        </p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                                            {formatCurrency(o.amount)}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* If payment reported, show interactive confirmation banner */}
                                                {hasReported && (
                                                    <div className="mt-2.5 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/30 p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                        <div className="text-xs text-amber-800 dark:text-amber-200 font-medium">
                                                            <span>{o.from_name} reported paying </span>
                                                            <span className="font-bold">{formatCurrency(reportedAmount)}</span>
                                                            {reportedShares[0]?.payment_reference && (
                                                                <span className="ml-1 font-mono text-[11px] opacity-80">
                                                                    ({reportedShares[0].payment_reference})
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                                                            <button
                                                                type="button"
                                                                disabled={isConfirming || isRejecting}
                                                                onClick={() =>
                                                                    handleConfirmReceipt(
                                                                        o.from_user_id,
                                                                        o.from_name
                                                                    )
                                                                }
                                                                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs px-2.5 py-1 transition-colors flex items-center gap-1 shadow-sm"
                                                            >
                                                                <CheckIcon className="h-3.5 w-3.5" />
                                                                {isConfirming ? "Confirming..." : "Confirm Received"}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={isConfirming || isRejecting}
                                                                onClick={() =>
                                                                    handleRejectReceipt(o.from_user_id)
                                                                }
                                                                className="rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 disabled:opacity-50 text-slate-700 dark:text-slate-200 font-medium text-xs px-2.5 py-1 transition-colors"
                                                            >
                                                                {isRejecting ? "..." : "Not Received"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </Card>
                        )}

                        {/* All Settled Empty State (when neither owes anything) */}
                        {owedByMe.length === 0 && owedToMeList.length === 0 && (
                            <Card className="p-6 text-center">
                                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                                    <CheckCircleIcon className="h-6 w-6" />
                                </div>
                                <h4 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100">
                                    All Settled Up!
                                </h4>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                                    There are no outstanding balances between any members in {group?.name || "this group"}. Everyone is square!
                                </p>
                            </Card>
                        )}

                        {/* Settled Section (Collapsible Accordion) */}
                        <details className="group rounded-2xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-slate-200/60 dark:ring-slate-700/60 overflow-hidden">
                            <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-semibold text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50/80 dark:hover:bg-slate-750 transition-colors">
                                <div className="flex items-center gap-2">
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                                        <CheckIcon className="h-3 w-3" />
                                    </span>
                                    <span>Settled Balances & History</span>
                                    <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                        {settledExpenses.length + (settlements || []).length}
                                    </span>
                                </div>
                                <ChevronDownIcon className="h-4 w-4 transition-transform duration-200 group-open:rotate-180 text-slate-400" />
                            </summary>

                            <div className="border-t border-slate-100 dark:border-slate-700/80 p-4 space-y-2.5 bg-slate-50/40 dark:bg-slate-850/40">
                                {settledExpenses.length === 0 && (!settlements || settlements.length === 0) ? (
                                    <p className="text-center text-xs text-slate-400 py-4">
                                        No settled expenses or payments recorded yet.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {/* Confirmed Settlements History */}
                                        {(settlements || []).map((s) => {
                                            const canUndo =
                                                (normalizedMyId != null && Number(s.receiver_id) === normalizedMyId) ||
                                                isAdmin;
                                            const isUndoing = undoingSettlementId === s.id;
                                            return (
                                                <div
                                                    key={`settle-hist-${s.id}`}
                                                    className="flex items-center gap-3 rounded-xl bg-white dark:bg-slate-800 p-3 ring-1 ring-slate-200/50 dark:ring-slate-700/50 text-xs"
                                                >
                                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600">
                                                        <CheckCircleIcon className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                                            {s.payer_name} paid {s.receiver_name}
                                                        </p>
                                                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                                                            {s.note ? `${s.note} · ` : ""}{formatDate(s.settled_at)}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm whitespace-nowrap">
                                                            {formatCurrency(s.amount)}
                                                        </p>
                                                        {canUndo && (
                                                            <button
                                                                type="button"
                                                                disabled={isUndoing}
                                                                onClick={() =>
                                                                    handleUndoSettlement(s.id, s.payer_name, s.amount)
                                                                }
                                                                title="Mark as not received / restore balance"
                                                                className="rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 dark:bg-slate-700 dark:hover:bg-rose-950/50 dark:text-slate-300 dark:hover:text-rose-400 px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
                                                            >
                                                                {isUndoing ? "..." : "Not Received"}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* Fully Settled Expenses */}
                                        {settledExpenses.map((expense) => (
                                            <button
                                                key={`settled-exp-${expense.id}`}
                                                type="button"
                                                onClick={() => onExpenseClick(expense)}
                                                className="w-full text-left flex items-center gap-3 rounded-xl bg-white dark:bg-slate-800 p-3 ring-1 ring-slate-200/50 dark:ring-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors text-xs"
                                            >
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600">
                                                    <ReceiptIndianRupeeIcon className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                                        {expense.description}
                                                    </p>
                                                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                                                        Paid by {expense.payer_name} · Fully Settled · {formatDate(expense.created_at)}
                                                    </p>
                                                </div>
                                                <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                                                    {formatCurrency(expense.amount)}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </details>

                        {/* Active Expense Log */}
                        <div>
                            <p className="mb-2 px-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                All Group Expenses
                            </p>
                            {expenses.length === 0 ? (
                                <Card>
                                    <EmptyState
                                        icon={<WalletIcon className="h-6 w-6" />}
                                        title="No shared expenses yet"
                                        description={`Split groceries, rent and bills within ${group.name} to keep things fair.`}
                                    />
                                </Card>
                            ) : (
                                <div className="space-y-2.5">
                                    {expenses.map((expense) => {
                                        const paidCount = expense.shares.filter(
                                            (s) => s.status === "paid"
                                        ).length;
                                        const total = expense.shares.length || 1;
                                        const settled = expense.status === "settled";
                                        const myPending = expense.shares?.find(
                                            (s) =>
                                                normalizedMyId != null &&
                                                Number(s.user_id) === normalizedMyId &&
                                                s.status === "pending"
                                        );
                                        const myReported = expense.shares?.find(
                                            (s) =>
                                                normalizedMyId != null &&
                                                Number(s.user_id) === normalizedMyId &&
                                                s.status === "payment_reported"
                                        );

                                        return (
                                            <button
                                                key={expense.id}
                                                onClick={() => onExpenseClick(expense)}
                                                className="block w-full rounded-xl bg-white dark:bg-slate-800 p-3.5 text-left shadow-sm ring-1 ring-slate-200/60 transition-shadow hover:shadow-md"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                                            settled
                                                                ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600"
                                                                : "bg-brand-50 dark:bg-brand-900/20 text-brand-600"
                                                        }`}
                                                    >
                                                        <ReceiptIndianRupeeIcon className="h-4.5 w-4.5" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                            {expense.description}
                                                        </p>
                                                        <p className="text-xs text-slate-400 dark:text-slate-500">
                                                            {paidCount}/{total} paid · Paid by {expense.payer_name} · {formatDate(expense.created_at)}
                                                        </p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                                            {formatCurrency(expense.amount)}
                                                        </p>
                                                        {myPending && (
                                                            <span className="inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                                                                You owe {formatCurrency(myPending.amount)}
                                                            </span>
                                                        )}
                                                        {myReported && (
                                                            <span className="inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                                                                Reported
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Bottom action bar with single, consistent Split Expense button */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
                <button
                    onClick={onSplit}
                    className="rounded-full bg-slate-100 dark:bg-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-200 dark:hover:bg-slate-600"
                >
                    Split expense
                </button>
                <button
                    onClick={onSettle}
                    className="rounded-full bg-brand-600 hover:bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition-colors"
                >
                    Settle up
                </button>
            </div>
        </div>
    );
}

/* ---------------- Split expense modal ---------------- */

export function SplitExpenseModal({ open, onClose, group, members, creating, onCreate }) {
    if (!open) return null;
    return (
        <SplitExpenseInner
            onClose={onClose}
            group={group}
            members={members}
            creating={creating}
            onCreate={onCreate}
        />
    );
}

function SplitExpenseInner({ onClose, group, members, creating, onCreate }) {
    const groupId = group.group_id ?? group.id;
    const [splitMode, setSplitMode] = useState("equal");
    const [customAmounts, setCustomAmounts] = useState({});
    const [selectedIds, setSelectedIds] = useState(() => new Set(members.map((m) => m.id)));
    const [form, setForm] = useState({ description: "", amount: "" });
    const [errors, setErrors] = useState({});
    const toast = useToast();

    const selectedMembers = members.filter((m) => selectedIds.has(m.id));
    const selectedCount = selectedMembers.length;

    const toggleMember = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            if (next.size === 1) return;
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    const switchMode = (mode) => {
        setSplitMode(mode);
        setErrors({});
        if (mode === "custom") {
            const total = Number(form.amount) || 0;
            const each = selectedCount > 0 ? (total / selectedCount).toFixed(2) : "";
            const initial = {};
            selectedMembers.forEach((m) => {
                initial[m.id] = each;
            });
            setCustomAmounts(initial);
        }
    };

    const validate = () => {
        const errs = {};
        if (!form.description.trim()) errs.description = "Description is required";
        const amt = Number(form.amount);
        if (!form.amount || isNaN(amt) || amt <= 0) {
            errs.amount = "Enter a valid amount";
        }
        if (selectedCount === 0) {
            errs.members = "Select at least one member to split with";
        }
        if (splitMode === "custom") {
            let sum = 0;
            for (const m of selectedMembers) {
                const val = Number(customAmounts[m.id]);
                if (isNaN(val) || val < 0) {
                    errs.custom = "All amounts must be positive numbers";
                    break;
                }
                sum += val;
            }
            if (!errs.custom && Math.abs(sum - amt) > 0.05) {
                errs.custom = `Shares total ${formatCurrency(sum)}, but expense is ${formatCurrency(amt)}`;
            }
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        const payload = {
            group_id: groupId,
            description: form.description.trim(),
            amount: Number(form.amount),
            member_ids: Array.from(selectedIds),
        };
        if (splitMode === "custom") {
            payload.amounts = selectedMembers.map((m) => ({
                user_id: m.id,
                amount: Number(customAmounts[m.id]),
            }));
        }
        try {
            await onCreate(payload);
            toast.success("Expense split successfully");
            onClose();
        } catch (err) {
            toast.error(errorMessage(err, "Failed to split expense"));
        }
    };

    return (
        <Modal open onClose={onClose} title="Split a new expense" maxWidth="max-w-lg">
            <div className="space-y-4">
                <Input
                    label="Description"
                    placeholder="e.g. Weekly Groceries, WiFi bill"
                    value={form.description}
                    error={errors.description}
                    onChange={(e) => {
                        setForm({ ...form, description: e.target.value });
                        setErrors({ ...errors, description: "" });
                    }}
                />

                <Input
                    label="Total amount (₹)"
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

                <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                        Split with members
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {members.map((member) => {
                            const selected = selectedIds.has(member.id);
                            return (
                                <button
                                    key={member.id}
                                    type="button"
                                    onClick={() => toggleMember(member.id)}
                                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                                        selected
                                            ? "bg-brand-600 text-white shadow-sm"
                                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200"
                                    }`}
                                >
                                    <Avatar name={member.name} size="xs" />
                                    <span>{member.name}</span>
                                </button>
                            );
                        })}
                    </div>
                    {errors.members && (
                        <p className="mt-1 text-xs text-rose-500 font-medium">{errors.members}</p>
                    )}
                </div>

                <div>
                    <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                        <button
                            type="button"
                            onClick={() => switchMode("equal")}
                            className={`flex-1 rounded-md py-1.5 text-xs font-bold transition-all ${
                                splitMode === "equal"
                                    ? "bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-300 shadow-sm"
                                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
                            }`}
                        >
                            Split Equally
                        </button>
                        <button
                            type="button"
                            onClick={() => switchMode("custom")}
                            className={`flex-1 rounded-md py-1.5 text-xs font-bold transition-all ${
                                splitMode === "custom"
                                    ? "bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-300 shadow-sm"
                                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400"
                            }`}
                        >
                            Custom Amounts
                        </button>
                    </div>
                </div>

                {splitMode === "custom" && (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {selectedMembers.map((m) => (
                            <div
                                key={m.id}
                                className="flex items-center gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/80 p-2.5"
                            >
                                <Avatar name={m.name} size="xs" />
                                <span className="flex-1 text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                                    {m.name}
                                </span>
                                <div className="w-28">
                                    <Input
                                        type="number"
                                        min="0"
                                        placeholder="0.00"
                                        value={customAmounts[m.id] ?? ""}
                                        onChange={(e) =>
                                            setCustomAmounts({
                                                ...customAmounts,
                                                [m.id]: e.target.value,
                                            })
                                        }
                                    />
                                </div>
                            </div>
                        ))}
                        {errors.custom && (
                            <p className="text-xs text-rose-500 font-medium">{errors.custom}</p>
                        )}
                    </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button loading={creating} onClick={handleSubmit}>
                        Split Expense
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

/* ---------------- Dedicated 3-Step Settle Up Modal ---------------- */

export function SettleUpModal({
    open,
    onClose,
    group,
    balances,
    expenses = [],
    initialMember,
    myUserId,
    onSettlementComplete,
}) {
    if (!open) return null;
    return (
        <SettleUpInner
            onClose={onClose}
            group={group}
            balances={balances}
            expenses={expenses}
            initialMember={initialMember}
            myUserId={myUserId}
            onSettlementComplete={onSettlementComplete}
        />
    );
}

function SettleUpInner({
    onClose,
    group,
    balances,
    expenses,
    initialMember,
    myUserId,
    onSettlementComplete,
}) {
    const toast = useToast();
    const groupId = group.group_id ?? group.id;
    const normalizedMyId = myUserId != null ? Number(myUserId) : null;

    // Filter members to whom the current user owes money (amount > 0)
    const owedByMe = (balances?.owes || []).filter(
        (o) => normalizedMyId != null && Number(o.from_user_id) === normalizedMyId && Number(o.amount) > 0.004
    );

    const [step, setStep] = useState(() => (initialMember ? "details" : "select"));
    const [selectedPeer, setSelectedPeer] = useState(() => initialMember || null);
    const [amountToPay, setAmountToPay] = useState(() =>
        initialMember ? String(initialMember.amount) : ""
    );
    const [reference, setReference] = useState("");
    const [note, setNote] = useState("");
    const [showQr, setShowQr] = useState(false);
    const [qrDataUrl, setQrDataUrl] = useState("");
    const [copiedUpi, setCopiedUpi] = useState(false);
    const [copiedAmount, setCopiedAmount] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const isMobile = isMobileDevice();

    const handleSelectMember = (member) => {
        setSelectedPeer(member);
        setAmountToPay(String(member.amount));
        setReference("");
        setNote("");
        setShowQr(false);
        setStep("details");
    };

    const handleBackToSelect = () => {
        setStep("select");
        setSelectedPeer(null);
        setShowQr(false);
    };

    const recipientUpi = selectedPeer?.to_upi_id || "";
    const recipientName = selectedPeer?.to_name || "Roommate";
    const numericAmount = Number(amountToPay) || Number(selectedPeer?.amount) || 0;

    const upiDeepLink = buildUpiDeepLink({
        upiId: recipientUpi,
        recipientName,
        amount: numericAmount,
        description: `Settlement for ${group.name || "Living Group"}`,
    });

    useEffect(() => {
        let isMounted = true;
        if (showQr && upiDeepLink) {
            QRCode.toDataURL(upiDeepLink, {
                width: 200,
                margin: 2,
                color: { dark: "#0f172a", light: "#ffffff" },
            })
                .then((url) => {
                    if (isMounted) setQrDataUrl(url);
                })
                .catch((e) => console.error("QR generation error:", e));
        }
        return () => {
            isMounted = false;
        };
    }, [showQr, upiDeepLink]);

    const handleCopy = async (text, type) => {
        try {
            await navigator.clipboard.writeText(text);
            if (type === "upi") {
                setCopiedUpi(true);
                setTimeout(() => setCopiedUpi(false), 2000);
            } else {
                setCopiedAmount(true);
                setTimeout(() => setCopiedAmount(false), 2000);
            }
            toast.success("Copied to clipboard!");
        } catch {
            toast.error("Failed to copy");
        }
    };

    const handleLaunchUpi = () => {
        if (!recipientUpi) {
            toast.error("Recipient has no UPI ID set");
            return;
        }
        if (isMobile) {
            window.location.href = upiDeepLink;
        } else {
            setShowQr(true);
            toast.info("Scan the QR code or copy details to transfer via your mobile UPI app.");
        }
    };

    const handleReportSubmit = async (e) => {
        e?.preventDefault();
        if (submitting) return;
        const amt = Number(amountToPay);
        if (!amt || amt <= 0) {
            toast.error("Please enter a valid amount");
            return;
        }

        setSubmitting(true);
        try {
            const res = await api.post("/shared-expenses/settle-up-report", {
                group_id: groupId,
                receiver_id: Number(selectedPeer.to_user_id),
                amount: amt,
                payment_reference: reference.trim() || null,
                note: note.trim() || null,
            });
            toast.success(res.data.message || `Payment of ${formatCurrency(amt)} reported. Waiting for confirmation.`);
            if (onSettlementComplete) await onSettlementComplete();
            onClose();
        } catch (err) {
            toast.error(errorMessage(err, "Could not clear balance"));
        } finally {
            setSubmitting(false);
        }
    };

    // Find all unsettled shared balances and individual breakdown with selectedPeer
    const peerExpenses = selectedPeer
        ? (expenses || []).filter(
              (e) =>
                  Number(e.payer_id) === Number(selectedPeer.to_user_id) &&
                  e.shares?.some((s) => Number(s.user_id) === normalizedMyId && s.status !== "paid")
          )
        : [];

    const totalDue = Number(selectedPeer?.amount || 0);
    const enteredAmt = Number(amountToPay) || 0;
    const remainingAfterPay = Math.max(0, totalDue - enteredAmt);

    return (
        <Modal
            open
            onClose={onClose}
            title={step === "select" ? "Settle Up" : `Settle with ${recipientName}`}
            maxWidth="max-w-md"
        >
            {/* STEP A: Choose whom to settle with */}
            {step === "select" && (
                <div className="space-y-4">
                    <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Select a flatmate to whom you have outstanding balances.
                        </p>
                    </div>

                    {owedByMe.length === 0 ? (
                        <div className="py-8 text-center space-y-3">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                                <CheckCircleIcon className="h-8 w-8" />
                            </div>
                            <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                                All Settled Up!
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                                You don&apos;t owe anyone right now. All your shared expenses in this group are squared!
                            </p>
                            <div className="pt-2">
                                <Button variant="secondary" onClick={onClose}>
                                    Close
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {owedByMe.map((member) => {
                                const memberExpenses = (expenses || []).filter(
                                    (e) =>
                                        Number(e.payer_id) === Number(member.to_user_id) &&
                                        e.shares?.some(
                                            (s) =>
                                                Number(s.user_id) === normalizedMyId &&
                                                s.status !== "paid"
                                        )
                                );
                                const unpaidCount = memberExpenses.length;

                                return (
                                    <button
                                        key={`select-member-${member.to_user_id}`}
                                        type="button"
                                        onClick={() => handleSelectMember(member)}
                                        className="w-full text-left flex items-center gap-3 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-brand-500 dark:hover:border-brand-500 hover:shadow-sm transition-all group"
                                    >
                                        <Avatar name={member.to_name} size="md" />
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-sm text-slate-900 dark:text-slate-100 group-hover:text-brand-600 transition-colors">
                                                {member.to_name}
                                            </p>
                                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                                                {unpaidCount > 0
                                                    ? `${unpaidCount} unpaid expense${unpaidCount !== 1 ? "s" : ""}`
                                                    : "Outstanding balance"}
                                                {member.to_upi_id ? ` · UPI ready` : ` · No UPI ID`}
                                            </p>
                                        </div>
                                        <div className="text-right flex items-center gap-2">
                                            <div>
                                                <p className="text-xs text-slate-400">You owe</p>
                                                <p className="text-sm font-black text-rose-600 dark:text-rose-400">
                                                    {formatCurrency(member.amount)}
                                                </p>
                                            </div>
                                            <ChevronRightIcon className="h-4 w-4 text-slate-400 group-hover:text-brand-500 group-hover:translate-x-0.5 transition-all" />
                                        </div>
                                    </button>
                                );
                            })}

                            <div className="flex justify-end pt-3">
                                <Button variant="secondary" onClick={onClose}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* STEP B & C: Review outstanding history & settle */}
            {step === "details" && selectedPeer && (
                <div className="space-y-4">
                    {/* Navigation back button */}
                    {owedByMe.length > 1 && (
                        <button
                            type="button"
                            onClick={handleBackToSelect}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                        >
                            <ArrowLeftIcon className="h-3.5 w-3.5" /> Back to flatmates
                        </button>
                    )}

                    {/* Recipient summary card */}
                    <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-md">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <Avatar name={recipientName} size="md" />
                                <div>
                                    <p className="text-xs font-medium text-slate-300">Settling balance with</p>
                                    <p className="text-base font-bold text-white">{recipientName}</p>
                                </div>
                            </div>
                            {recipientUpi ? (
                                <Badge variant="brand" className="bg-brand-500/20 text-brand-300 border-brand-400/30">
                                    UPI Ready
                                </Badge>
                            ) : (
                                <Badge variant="warning" className="bg-amber-500/20 text-amber-300 border-amber-400/30">
                                    No UPI ID
                                </Badge>
                            )}
                        </div>

                        <div className="mt-3 border-t border-slate-700/60 pt-3 flex items-baseline justify-between">
                            <div>
                                <p className="text-xs text-slate-400">Total Outstanding</p>
                                <p className="text-xs text-slate-300">
                                    {peerExpenses.length} shared expense{peerExpenses.length !== 1 ? "s" : ""}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-black text-rose-400">
                                    {formatCurrency(totalDue)}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Complete Outstanding Expenses Breakdown */}
                    <div>
                        <div className="flex items-center justify-between mb-2 px-0.5">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                Outstanding Expense Breakdown
                            </h4>
                            <span className="text-[11px] text-slate-400">Excludes settled</span>
                        </div>

                        {peerExpenses.length === 0 ? (
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-center text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/40">
                                Outstanding balance of {formatCurrency(totalDue)} from adjustments or penalties.
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-40 overflow-y-auto pr-1 touch-scroll">
                                {peerExpenses.map((expense) => {
                                    const myShare = expense.shares?.find(
                                        (s) => Number(s.user_id) === normalizedMyId
                                    );
                                    if (!myShare || myShare.status === "paid") return null;

                                    return (
                                        <div
                                            key={`peer-exp-${expense.id}`}
                                            className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/80 p-2.5 border border-slate-200/70 dark:border-slate-700 text-xs"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                                    {expense.description}
                                                </p>
                                                <p className="text-[11px] text-slate-400 mt-0.5">
                                                    Total {formatCurrency(expense.amount)} · {formatDate(expense.created_at)}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0 ml-3">
                                                <p className="font-bold text-rose-600 dark:text-rose-400 text-xs">
                                                    Your share: {formatCurrency(myShare.amount)}
                                                </p>
                                                {myShare.status === "payment_reported" ? (
                                                    <span className="inline-block mt-0.5 rounded px-1.5 py-0.2 text-[10px] font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                                                        Reported
                                                    </span>
                                                ) : (
                                                    <span className="inline-block mt-0.5 text-[10px] text-slate-400 font-medium">
                                                        Unpaid
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Amount to settle (supports partial settlement calculation) */}
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 bg-slate-50/70 dark:bg-slate-800/50 space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                Amount to Settle (₹)
                            </label>
                            {enteredAmt !== totalDue && (
                                <button
                                    type="button"
                                    onClick={() => setAmountToPay(String(totalDue))}
                                    className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                                >
                                    Settle Full Balance ({formatCurrency(totalDue)})
                                </button>
                            )}
                        </div>

                        <Input
                            type="number"
                            min="1"
                            step="0.01"
                            value={amountToPay}
                            onChange={(e) => setAmountToPay(e.target.value)}
                            placeholder="Enter amount"
                            className="font-bold text-slate-900 dark:text-slate-100"
                        />

                        {enteredAmt > 0 && enteredAmt < totalDue && (
                            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                Partial payment: Remaining balance after payment will be{" "}
                                <span className="font-bold text-rose-500">{formatCurrency(remainingAfterPay)}</span>
                            </p>
                        )}
                    </div>

                    {/* STEP C: Pay via UPI or Manual Alternatives */}
                    <div className="space-y-3">
                        {recipientUpi ? (
                            <div className="space-y-2">
                                <button
                                    type="button"
                                    onClick={handleLaunchUpi}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 px-4 py-3 text-sm font-bold text-white shadow-xs transition-all active:scale-[0.99] cursor-pointer"
                                >
                                    <ArrowUpRight className="h-4 w-4" />
                                    {isMobile
                                        ? `Open in UPI App (${formatCurrency(numericAmount)})`
                                        : `Pay ${formatCurrency(numericAmount)} via UPI`}
                                </button>
                                <p className="text-center text-[11px] text-slate-400">
                                    Supports Google Pay, PhonePe, Paytm, BHIM
                                </p>

                                {/* Toggle desktop QR code / details */}
                                {!isMobile && (
                                    <div className="text-center">
                                        <button
                                            type="button"
                                            onClick={() => setShowQr(!showQr)}
                                            className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                                        >
                                            {showQr ? "Hide QR Code" : "Show QR Code to scan with phone"}
                                        </button>
                                    </div>
                                )}

                                {showQr && (
                                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-center space-y-3">
                                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            Scan with your phone&apos;s UPI App
                                        </p>
                                        {qrDataUrl && (
                                            <div className="flex justify-center">
                                                <div className="rounded-lg bg-white p-2 shadow-sm border border-slate-200 dark:border-slate-700">
                                                    <img
                                                        src={qrDataUrl}
                                                        alt="UPI QR Code"
                                                        className="h-40 w-40 object-contain"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        <div className="space-y-2 text-left text-xs">
                                            <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 border border-slate-200 dark:border-slate-700">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[10px] uppercase font-bold text-slate-400">
                                                        UPI ID
                                                    </p>
                                                    <p className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate">
                                                        {recipientUpi}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopy(recipientUpi, "upi")}
                                                    className="inline-flex items-center gap-1 rounded bg-slate-200 dark:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
                                                >
                                                    <CopyIcon className="h-3 w-3" />
                                                    {copiedUpi ? "Copied" : "Copy"}
                                                </button>
                                            </div>

                                            <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 border border-slate-200 dark:border-slate-700">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[10px] uppercase font-bold text-slate-400">
                                                        Amount
                                                    </p>
                                                    <p className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate">
                                                        {formatCurrency(numericAmount)}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopy(numericAmount.toFixed(2), "amount")}
                                                    className="inline-flex items-center gap-1 rounded bg-slate-200 dark:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
                                                >
                                                    <CopyIcon className="h-3 w-3" />
                                                    {copiedAmount ? "Copied" : "Copy"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-3.5 space-y-1">
                                <p className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                                    <AlertIcon className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                    <span>{recipientName} has not added a UPI ID</span>
                                </p>
                                <p className="text-xs text-amber-800 dark:text-amber-300">
                                    You can settle directly via cash, bank transfer, or other offline method, then record your payment below to clear the balance immediately.
                                </p>
                            </div>
                        )}

                        {/* Payment Recording Section */}
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 bg-white dark:bg-slate-800 shadow-sm">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                                <ShieldCheckIcon className="h-4 w-4 text-brand-500" />
                                Record Payment & Clear Balance
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Once transferred, report it below. The recipient must verify receipt before the balance is marked Paid.
                            </p>

                            <div className="space-y-2">
                                <input
                                    type="text"
                                    value={reference}
                                    onChange={(e) => setReference(e.target.value)}
                                    placeholder="UTR / UPI Ref / Transaction ID (optional)"
                                    maxLength={100}
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                />
                                <input
                                    type="text"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder="Note (optional, e.g. Paid via PhonePe / Cash)"
                                    maxLength={150}
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                />
                            </div>

                            <Button
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                                loading={submitting}
                                onClick={handleReportSubmit}
                            >
                                <CheckIcon className="h-4 w-4" />
                                Clear & Mark as Paid ({formatCurrency(numericAmount)})
                            </Button>
                        </div>

                        <div className="flex justify-end pt-2">
                            <Button variant="secondary" onClick={onClose}>
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}

/* ---------------- Expense detail modal ---------------- */

export function ExpenseDetailModal({
    expense,
    myUserId,
    paying,
    reminding,
    onClose,
    onPay,
    onOpenUpi,
    onRemind,
    onDelete,
    onRefresh,
}) {
    const toast = useToast();
    const [undoingShareId, setUndoingShareId] = useState(null);
    if (!expense) return null;

    const handleUndoShare = async (share) => {
        if (undoingShareId) return;
        const ok = window.confirm(
            `Mark ${share.user_name}'s payment of ${formatCurrency(share.amount)} as not received?\n\nThis will restore their share to Unpaid.`
        );
        if (!ok) return;

        setUndoingShareId(share.id);
        try {
            const res = await api.post(`/shared-expenses/${expense.id}/shares/${share.id}/reject-payment`);
            toast.info(res.data.message || "Payment status reset to Unpaid.");
            if (onRefresh) await onRefresh();
            onClose();
        } catch (err) {
            toast.error(errorMessage(err, "Could not undo payment"));
        } finally {
            setUndoingShareId(null);
        }
    };

    const paidCount = expense.shares.filter((s) => s.status === "paid").length;
    const total = expense.shares.length || 1;
    const paidAmount = expense.shares
        .filter((s) => s.status === "paid")
        .reduce((acc, s) => acc + Number(s.amount), 0);
    const leftAmount = Number(expense.amount) - paidAmount;
    const myShare = expense.shares.find((s) => s.user_id === myUserId);
    const isPayer = expense.payer_id === myUserId;

    return (
        <Modal open onClose={onClose} title={expense.description}>
            <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-600">
                    <ReceiptIndianRupeeIcon className="h-7 w-7" />
                </div>
                <p className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-100">
                    Total: {formatCurrency(expense.amount)}
                </p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    Paid by {expense.payer_name} · requested {formatDate(expense.created_at)}
                </p>
                {expense.payer_upi_id && (
                    <p className="mt-1 font-mono text-xs text-brand-600 dark:text-brand-400">
                        Recipient UPI: {expense.payer_upi_id}
                    </p>
                )}
            </div>

            <div className="mt-5">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                        className="h-full rounded-full bg-brand-600 transition-all"
                        style={{
                            width: `${Math.min(
                                100,
                                Math.round((paidAmount / Number(expense.amount)) * 100)
                            )}%`,
                        }}
                    />
                </div>
                <div className="mt-1.5 flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span>{formatCurrency(paidAmount)} paid</span>
                    <span>{formatCurrency(leftAmount)} left</span>
                </div>
            </div>

            <div className="mt-5 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {paidCount} of {total} paid
                </p>
                {isPayer && paidCount < total && (
                    <Button
                        size="sm"
                        variant="secondary"
                        loading={reminding}
                        onClick={() => onRemind(expense)}
                    >
                        <BellIcon className="h-3.5 w-3.5" />
                        Send reminder
                    </Button>
                )}
            </div>

            <div className="mt-3 space-y-2">
                {expense.shares.map((share) => {
                    const paid = share.status === "paid";
                    const reported = share.status === "payment_reported";
                    const isCurrentUser = share.user_id === myUserId;
                    return (
                        <div
                            key={share.user_id}
                            className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-900 px-3 py-2.5"
                        >
                            <Avatar name={share.user_name} size="sm" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                                    {share.user_name}
                                    {isCurrentUser && (
                                        <span className="text-slate-400 dark:text-slate-500"> (You)</span>
                                    )}
                                </p>
                                <p className="text-xs text-slate-400 dark:text-slate-500">
                                    {paid
                                        ? isCurrentUser && isPayer
                                            ? "Sent this request"
                                            : "Paid"
                                        : reported
                                        ? share.payment_reference
                                            ? `Payment reported (${share.payment_reference})`
                                            : "Payment reported"
                                        : "Unpaid"}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {paid ? (
                                    <div className="flex items-center gap-1.5">
                                        <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-500" />
                                        {isPayer && !isCurrentUser && (
                                            <button
                                                type="button"
                                                disabled={undoingShareId === share.id}
                                                onClick={() => handleUndoShare(share)}
                                                title="Mark as not received / Unpaid"
                                                className="text-[11px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 px-1 py-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-50"
                                            >
                                                {undoingShareId === share.id ? "..." : "Undo"}
                                            </button>
                                        )}
                                    </div>
                                ) : reported ? (
                                    <div className="flex items-center gap-1.5">
                                        <Badge variant="warning" dot>
                                            Reported
                                        </Badge>
                                        {(isPayer || isCurrentUser) && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    onOpenUpi
                                                        ? onOpenUpi(expense, share)
                                                        : onPay(expense, share)
                                                }
                                                className={`rounded px-2 py-0.5 text-xs font-semibold ${
                                                    isPayer
                                                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                                        : "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 hover:bg-amber-200"
                                                }`}
                                            >
                                                {isPayer ? "Confirm" : "View"}
                                            </button>
                                        )}
                                    </div>
                                ) : isCurrentUser ? (
                                    <button
                                        type="button"
                                        onClick={() => onPay(expense, share)}
                                        className="rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                                    >
                                        Pay {formatCurrency(share.amount)}
                                    </button>
                                ) : (
                                    <Badge variant="neutral" dot>
                                        Due
                                    </Badge>
                                )}
                                <p className="w-16 shrink-0 text-right text-sm font-bold text-slate-900 dark:text-slate-100">
                                    {formatCurrency(share.amount)}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                {isPayer && (
                    <Button
                        variant="dangerOutline"
                        onClick={() => onDelete(expense)}
                        className="sm:mr-auto"
                    >
                        <Trash2Icon className="h-4 w-4" />
                        Delete
                    </Button>
                )}
                {myShare && myShare.status === "pending" && (
                    <Button loading={paying} onClick={() => onPay(expense, myShare)} className="bg-brand-600 hover:bg-brand-700 text-white">
                        <CheckIcon className="h-4 w-4" />
                        Pay {formatCurrency(myShare.amount)} via UPI
                    </Button>
                )}
                {myShare && myShare.status === "payment_reported" && (
                    <Button
                        variant="secondary"
                        onClick={() =>
                            onOpenUpi
                                ? onOpenUpi(expense, myShare)
                                : onPay(expense, myShare)
                        }
                    >
                        <ClockIcon className="h-4 w-4" />
                        Payment Reported (View)
                    </Button>
                )}
                <Button variant="secondary" onClick={onClose}>
                    Close
                </Button>
            </div>
        </Modal>
    );
}

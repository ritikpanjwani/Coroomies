import { useEffect, useState } from "react";
import QRCode from "qrcode";
import api from "../api";
import { formatCurrency } from "../utils/format";
import { buildUpiDeepLink, isMobileDevice } from "../utils/upi";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Avatar from "./ui/Avatar";
import Badge from "./ui/Badge";
import { useToast } from "./Toast";
import { errorMessage } from "../utils/format";
import {
    ArrowUpRight,
    CheckCircleIcon,
    CheckIcon,
    XIcon,
    CopyIcon,
    RefreshCwIcon,
    ShieldCheckIcon,
} from "./Icons";

export default function UpiPaymentModal({
    open,
    onClose,
    expense,
    share,
    owedItem,
    groupId,
    groupName,
    myUserId,
    onStatusUpdated,
}) {
    const toast = useToast();
    const [qrDataUrl, setQrDataUrl] = useState("");
    const [copiedUpi, setCopiedUpi] = useState(false);
    const [copiedAmount, setCopiedAmount] = useState(false);
    const [reference, setReference] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const recipientName = expense?.payer_name || owedItem?.to_name || "Roommate";
    const recipientUpi = expense?.payer_upi_id || owedItem?.to_upi_id || "";
    const amount = Number(
        share?.amount != null
            ? share.amount
            : (owedItem?.amount != null ? owedItem.amount : 0)
    );
    const description =
        expense?.description ||
        (groupName ? `Settlement for ${groupName}` : "Group expense balance");

    const effectiveMyUserId =
        myUserId != null
            ? Number(myUserId)
            : (localStorage.getItem("user_id") ? Number(localStorage.getItem("user_id")) : null);

    const isPayer =
        (share?.user_id != null && effectiveMyUserId != null && Number(share.user_id) === effectiveMyUserId) ||
        (owedItem?.from_user_id != null && effectiveMyUserId != null && Number(owedItem.from_user_id) === effectiveMyUserId) ||
        (owedItem != null && !share) ||
        (expense && !share && effectiveMyUserId != null && Number(expense.payer_id) !== effectiveMyUserId);

    const isRecipient =
        (expense?.payer_id != null && effectiveMyUserId != null && Number(expense.payer_id) === effectiveMyUserId) ||
        (owedItem?.to_user_id != null && effectiveMyUserId != null && Number(owedItem.to_user_id) === effectiveMyUserId);

    const isReported = share?.status === "payment_reported";
    const isPaid = share?.status === "paid";
    const isMobile = isMobileDevice();

    const upiDeepLink = buildUpiDeepLink({
        upiId: recipientUpi,
        recipientName,
        amount,
        description: `CoRoomies: ${description}`,
    });

    useEffect(() => {
        let isMounted = true;
        if (open && upiDeepLink) {
            QRCode.toDataURL(upiDeepLink, {
                width: 220,
                margin: 2,
                color: {
                    dark: "#0f172a",
                    light: "#ffffff",
                },
            })
                .then((url) => {
                    if (isMounted) setQrDataUrl(url);
                })
                .catch((err) => {
                    console.error("Failed to generate UPI QR code:", err);
                });
        }
        return () => {
            isMounted = false;
        };
    }, [open, upiDeepLink]);

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
            toast.error("Failed to copy to clipboard");
        }
    };

    const handleOpenUpiApp = () => {
        if (!upiDeepLink) {
            toast.error("No UPI ID available for this recipient");
            return;
        }
        if (isMobile) {
            window.location.href = upiDeepLink;
        } else {
            // Attempt to trigger URI protocol handler on desktop
            try {
                window.location.href = upiDeepLink;
            } catch (err) {
                console.error("Desktop UPI launch handler:", err);
            }
            toast.info("On desktop: Scan the QR code with your mobile UPI app or copy the UPI ID below.");
        }
    };

    const handleReportPayment = async () => {
        if (submitting) return;
        setSubmitting(true);
        try {
            if (expense && share) {
                const res = await api.post(
                    `/shared-expenses/${expense.id}/shares/${share.id}/report-payment`,
                    { payment_reference: reference.trim() || null }
                );
                toast.success(res.data.message || "Payment reported. Waiting for recipient confirmation.");
            } else if (owedItem) {
                const targetGroupId = groupId || expense?.group_id;
                const res = await api.post("/shared-expenses/settle-up-report", {
                    group_id: targetGroupId,
                    receiver_id: Number(owedItem.to_user_id),
                    amount: Number(amount),
                    payment_reference: reference.trim() || null,
                    note: reference.trim() || `UPI payment to ${recipientName}`,
                });
                toast.success(res.data?.message || "Payment reported. Waiting for recipient confirmation.");
            }
            if (onStatusUpdated) await onStatusUpdated();
            onClose();
        } catch (err) {
            toast.error(errorMessage(err, "Could not record payment"));
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirmPayment = async () => {
        setSubmitting(true);
        try {
            if (expense && share) {
                const res = await api.post(
                    `/shared-expenses/${expense.id}/shares/${share.id}/confirm-payment`
                );
                toast.success(res.data.message || "Payment marked as paid!");
            } else if (owedItem) {
                const targetGroupId = groupId || expense?.group_id;
                const res = await api.post("/shared-expenses/confirm-settlement-receipt", {
                    group_id: targetGroupId,
                    payer_id: Number(owedItem.from_user_id || owedItem.user_id),
                    amount: Number(amount),
                });
                toast.success(res.data.message || "Payment confirmed! Balance settled.");
            }
            if (onStatusUpdated) onStatusUpdated();
            onClose();
        } catch (err) {
            toast.error(errorMessage(err, "Could not confirm payment"));
        } finally {
            setSubmitting(false);
        }
    };

    const handleRejectPayment = async () => {
        setSubmitting(true);
        try {
            if (expense && share) {
                const res = await api.post(
                    `/shared-expenses/${expense.id}/shares/${share.id}/reject-payment`
                );
                toast.success(res.data.message || "Status reset to pending");
            } else if (owedItem) {
                const targetGroupId = groupId || expense?.group_id;
                const res = await api.post("/shared-expenses/reject-settlement-receipt", {
                    group_id: targetGroupId,
                    payer_id: Number(owedItem.from_user_id || owedItem.user_id),
                });
                toast.success(res.data.message || "Reported payment rejected");
            }
            if (onStatusUpdated) onStatusUpdated();
            onClose();
        } catch (err) {
            toast.error(errorMessage(err, "Could not update status"));
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="UPI Split Payment"
            maxWidth="max-w-md"
        >
            <div className="p-5 sm:p-6 space-y-5">
                {/* Header card with recipient and amount */}
                <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-md">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <Avatar name={recipientName} size="md" />
                            <div>
                                <p className="text-xs font-medium text-slate-300">
                                    Paying to
                                </p>
                                <p className="text-base font-bold text-white">
                                    {recipientName}
                                </p>
                            </div>
                        </div>
                        <Badge variant="brand" className="bg-brand-500/20 text-brand-300 border-brand-400/30">
                            UPI Intent
                        </Badge>
                    </div>

                    <div className="mt-4 border-t border-slate-700/60 pt-4 flex items-baseline justify-between">
                        <div>
                            <p className="text-xs text-slate-400">Expense split</p>
                            <p className="text-sm font-medium text-slate-200 truncate max-w-[200px]">
                                {description}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-black tracking-tight text-white">
                                {formatCurrency(amount)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* If already Paid */}
                {isPaid && (
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center">
                        <CheckCircleIcon className="mx-auto h-8 w-8 text-emerald-500" />
                        <p className="mt-2 text-sm font-bold text-emerald-900 dark:text-emerald-200">
                            This share is paid and verified
                        </p>
                        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                            Amount: {formatCurrency(amount)}
                        </p>
                    </div>
                )}

                {/* If Payment Reported */}
                {isReported && !isPaid && (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 p-4">
                        <div className="flex items-start gap-3">
                            <RefreshCwIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                                    Payment Reported
                                </p>
                                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                                    {isRecipient
                                        ? `${share?.user_name || "Roommate"} reported paying ${formatCurrency(amount)}. Please verify in your bank/UPI app and confirm.`
                                        : "You have reported payment. Waiting for recipient to verify and confirm."}
                                </p>
                                {share?.payment_reference && (
                                    <p className="mt-1 text-xs font-mono text-amber-800 dark:text-amber-300">
                                        Ref: {share.payment_reference}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Recipient Action to confirm */}
                        {isRecipient && (
                            <div className="mt-3 flex gap-2">
                                <Button
                                    size="sm"
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    loading={submitting}
                                    onClick={handleConfirmPayment}
                                >
                                    <CheckIcon className="h-4 w-4" />
                                    Confirm Received
                                </Button>
                                <Button
                                    size="sm"
                                    variant="secondary"
                                    loading={submitting}
                                    onClick={handleRejectPayment}
                                >
                                    <XIcon className="h-4 w-4" />
                                    Not Received
                                </Button>
                            </div>
                        )}

                        {/* Payer Action to cancel report */}
                        {isPayer && !isRecipient && (
                            <div className="mt-3 text-right">
                                <button
                                    type="button"
                                    disabled={submitting}
                                    onClick={handleRejectPayment}
                                    className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
                                >
                                    Cancel payment report
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Outstanding Payment Section (Pending) */}
                {!isPaid && !isReported && (
                    <>
                        {/* Missing UPI ID Warning */}
                        {!recipientUpi ? (
                            <div className="rounded-xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/30 p-4">
                                <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                                    No UPI ID added by {recipientName}
                                </p>
                                <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                                    The recipient hasn&apos;t added their UPI ID in Settings yet. Ask them to add their UPI ID to enable 1-click payment and QR code.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Mobile Direct App Launch Button */}
                                <div>
                                    <button
                                        type="button"
                                        onClick={handleOpenUpiApp}
                                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:from-brand-500 hover:to-indigo-500 transition-all active:scale-[0.99]"
                                    >
                                        <ArrowUpRight className="h-4 w-4" />
                                        {isMobile
                                            ? `Open in UPI App (${formatCurrency(amount)})`
                                            : `Pay ${formatCurrency(amount)} via UPI App`}
                                    </button>
                                    <p className="mt-1.5 text-center text-[11px] text-slate-400">
                                        Supports Google Pay, PhonePe, Paytm, BHIM, Cred
                                    </p>
                                    {!isMobile && (
                                        <p className="mt-2 text-center text-xs text-brand-600 dark:text-brand-400 font-medium bg-brand-50/60 dark:bg-brand-950/40 p-2 rounded-lg border border-brand-200/50 dark:border-brand-800/40">
                                            Desktop: Scan the QR code below using your mobile UPI app or copy the UPI ID below to transfer.
                                        </p>
                                    )}
                                </div>

                                {/* QR Code & Copy Fallback for Desktop/Scan */}
                                <div className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-900/40 p-4 text-center">
                                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                        Scan QR or Copy UPI Details
                                    </p>

                                    {qrDataUrl && (
                                        <div className="my-3 flex justify-center">
                                            <div className="rounded-lg bg-white p-2 shadow-sm border border-slate-200 dark:border-slate-700">
                                                <img
                                                    src={qrDataUrl}
                                                    alt="UPI Payment QR Code"
                                                    className="h-44 w-44 object-contain"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Copyable Details */}
                                    <div className="space-y-2 text-left">
                                        <div className="flex items-center justify-between rounded-lg bg-white dark:bg-slate-800 px-3 py-2 border border-slate-200/80 dark:border-slate-700">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[10px] font-medium text-slate-400 uppercase">
                                                    UPI ID
                                                </p>
                                                <p className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 truncate">
                                                    {recipientUpi}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleCopy(recipientUpi, "upi")}
                                                className="ml-2 inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                            >
                                                <CopyIcon className="h-3 w-3" />
                                                {copiedUpi ? "Copied" : "Copy"}
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-between rounded-lg bg-white dark:bg-slate-800 px-3 py-2 border border-slate-200/80 dark:border-slate-700">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[10px] font-medium text-slate-400 uppercase">
                                                    Amount
                                                </p>
                                                <p className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200">
                                                    ₹{Number(amount).toFixed(2)}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleCopy(Number(amount).toFixed(2), "amount")
                                                }
                                                className="ml-2 inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                            >
                                                <CopyIcon className="h-3 w-3" />
                                                {copiedAmount ? "Copied" : "Copy"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Report Payment after transferring */}
                        {isPayer && (
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 bg-white dark:bg-slate-800">
                                <div>
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                                        <ShieldCheckIcon className="h-3.5 w-3.5 text-brand-500" />
                                        Step 2: Report Payment After Transferring
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        Once your transfer is completed, report it here. The recipient must verify receipt before it is marked Paid.
                                    </p>
                                </div>

                                <div>
                                    <input
                                        type="text"
                                        value={reference}
                                        onChange={(e) => setReference(e.target.value)}
                                        placeholder="UPI Ref / UTR / Note (optional)"
                                        maxLength={100}
                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                    />
                                </div>

                                <Button
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                                    loading={submitting}
                                    onClick={handleReportPayment}
                                >
                                    <CheckIcon className="h-4 w-4" />
                                    I Have Paid — Report Payment ({formatCurrency(amount)})
                                </Button>
                            </div>
                        )}
                    </>
                )}

                <div className="flex justify-end pt-2">
                    <Button variant="secondary" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

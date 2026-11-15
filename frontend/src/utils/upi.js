/**
 * Utility functions for UPI payment links and validation.
 */

/**
 * Validate standard UPI ID format.
 * Format: username@bank (e.g., name@okhdfcbank, 9876543210@paytm)
 */
export function isValidUpiId(upiId) {
    if (!upiId || typeof upiId !== "string") return false;
    const cleaned = upiId.trim().toLowerCase();
    return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(cleaned);
}

/**
 * Generate standard UPI Intent URI.
 * Spec: upi://pay?pa=RECIPIENT_UPI_ID&pn=RECIPIENT_NAME&am=AMOUNT&cu=INR&tn=EXPENSE_DESCRIPTION
 * Properly URL-encodes every parameter with standard percent-encoding (%20 for spaces).
 */
export function buildUpiDeepLink({ upiId, recipientName, amount, description }) {
    if (!upiId) return "";
    const cleanUpi = upiId.trim().toLowerCase();
    const cleanAmount = Number(amount || 0).toFixed(2);
    const cleanName = encodeURIComponent((recipientName || "Roommate").trim());
    const cleanDesc = encodeURIComponent((description || "CoRoomies expense").trim().slice(0, 50));

    return `upi://pay?pa=${cleanUpi}&pn=${cleanName}&am=${cleanAmount}&cu=INR&tn=${cleanDesc}`;
}

/**
 * Check if the client device is likely mobile for direct app intent launching.
 */
export function isMobileDevice() {
    if (typeof navigator === "undefined") return false;
    return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || "");
}

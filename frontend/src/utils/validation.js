/**
 * Shared frontend validation utilities.
 */

/**
 * Validates password strength according to the CoRoomies security policy:
 * - Minimum 8 characters
 * - Maximum 128 characters
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one number (0-9)
 * - At least one special character / symbol
 *
 * @param {string} password
 * @returns {string|null} Specific error message, or null if valid.
 */
export function validatePasswordStrength(password) {
    if (!password) {
        return "Please enter a password";
    }
    if (password.length < 8) {
        return "Password must be at least 8 characters long";
    }
    if (password.length > 128) {
        return "Password must be 128 characters or fewer";
    }
    if (!/[A-Z]/.test(password)) {
        return "Password must contain at least one uppercase letter";
    }
    if (!/[a-z]/.test(password)) {
        return "Password must contain at least one lowercase letter";
    }
    if (!/[0-9]/.test(password)) {
        return "Password must contain at least one number";
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        return "Password must contain at least one special character (e.g. !@#$%^&*)";
    }
    return null;
}

/**
 * Breakdown of each password requirement for live UI checklists.
 *
 * @param {string} password
 * @returns {Record<string, boolean>}
 */
export function checkPasswordCriteria(password = "") {
    const val = typeof password === "string" ? password : "";
    return {
        length: val.length >= 8 && val.length <= 128,
        uppercase: /[A-Z]/.test(val),
        lowercase: /[a-z]/.test(val),
        number: /[0-9]/.test(val),
        special: /[^A-Za-z0-9]/.test(val),
    };
}

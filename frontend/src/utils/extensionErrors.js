/**
 * Utilities to distinguish benign third-party browser extension issues from real CoRoomies application errors.
 * 
 * Common sources of browser extension noise include:
 * - Password managers (1Password, Bitwarden, LastPass) attempting to inject autofill widgets
 * - Grammar extensions (Grammarly, LanguageTool) mutating DOM elements or timing out
 * - Web3 / Wallet extensions (MetaMask, Phantom) listening on window.postMessage
 * - Adblockers blocking benign tracking/analytics domains
 */

const EXTENSION_SCHEMES = [
  "chrome-extension://",
  "moz-extension://",
  "safari-extension://",
  "ms-browser-extension://",
];

const EXTENSION_ERROR_PATTERNS = [
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
  /ms-browser-extension:\/\//i,
  /ResizeObserver loop/i,
  /The message port closed before a response was received/i,
  /Extension context invalidated/i,
  /Could not establish connection\. Receiving end does not exist/i,
  /Cannot read properties of undefined \(reading 'postMessage'\)/i,
  /Failed to execute 'postMessage' on 'DOMWindow'/i,
  /__gCrWeb/i, // iOS Chrome content script injection
];

/**
 * Checks whether an Error or Event originated from a browser extension.
 * @param {Error|ErrorEvent|PromiseRejectionEvent|any} errorOrEvent
 * @returns {boolean}
 */
export function isBrowserExtensionError(errorOrEvent) {
  if (!errorOrEvent) return false;

  // Check event filename, source, or script origin
  const filename = errorOrEvent.filename || errorOrEvent.source || errorOrEvent.target?.src || "";
  if (typeof filename === "string" && EXTENSION_SCHEMES.some((scheme) => filename.includes(scheme))) {
    return true;
  }

  // Check error message and stack trace
  const message =
    errorOrEvent.message ||
    errorOrEvent.reason?.message ||
    (typeof errorOrEvent === "string" ? errorOrEvent : "");
  const stack =
    errorOrEvent.stack ||
    errorOrEvent.reason?.stack ||
    errorOrEvent.error?.stack ||
    "";

  const targetText = `${message} ${stack}`;

  return EXTENSION_ERROR_PATTERNS.some((pattern) => pattern.test(targetText));
}

/**
 * Initializes global window error and unhandled rejection listeners
 * to cleanly filter and categorize browser extension warnings.
 */
export function initGlobalExtensionErrorFilter() {
  if (typeof window === "undefined") return;

  if (window.__coroomies_extension_filter_active) return;
  window.__coroomies_extension_filter_active = true;

  window.addEventListener("error", (event) => {
    if (isBrowserExtensionError(event)) {
      // Benign extension error: log as diagnostic notice without crashing the UI
      console.debug("[Browser Extension Notice] Suppressed extension error:", event.message);
      event.preventDefault?.();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (isBrowserExtensionError(event.reason)) {
      console.debug(
        "[Browser Extension Notice] Suppressed extension promise rejection:",
        event.reason?.message || event.reason
      );
      event.preventDefault?.();
    }
  });
}

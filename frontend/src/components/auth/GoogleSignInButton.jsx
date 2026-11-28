import { useEffect, useRef, useState } from "react";
import api from "../../api";

const GOOGLE_SCRIPT_ID = "google-identity-services";
const GOOGLE_SCRIPT_URL = "https://accounts.google.com/gsi/client";
let initializedGoogleClientId = "";
let googleCredentialCallback = null;

function loadGoogleScript() {
    if (window.google?.accounts?.id) return Promise.resolve();

    const existing = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existing) {
        if (existing.dataset.googleStatus === "loaded") {
            if (window.google?.accounts?.id) return Promise.resolve();
        }
        if (existing.dataset.googleStatus === "error") {
            existing.remove();
        } else {
            return new Promise((resolve, reject) => {
                const timeout = window.setTimeout(() => {
                    cleanup();
                    reject(new Error("Could not load Google sign-in."));
                }, 15000);
                const cleanup = () => {
                    window.clearTimeout(timeout);
                    existing.removeEventListener("load", handleLoad);
                    existing.removeEventListener("error", handleError);
                };
                const handleLoad = () => {
                    existing.dataset.googleStatus = "loaded";
                    cleanup();
                    if (window.google?.accounts?.id) resolve();
                    else reject(new Error("Google sign-in did not initialize."));
                };
                const handleError = () => {
                    existing.dataset.googleStatus = "error";
                    cleanup();
                    reject(new Error("Could not load Google sign-in."));
                };
                existing.addEventListener("load", handleLoad, { once: true });
                existing.addEventListener("error", handleError, { once: true });
            });
        }
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.id = GOOGLE_SCRIPT_ID;
        script.src = GOOGLE_SCRIPT_URL;
        script.async = true;
        script.defer = true;
        script.dataset.googleStatus = "loading";

        const timeout = window.setTimeout(() => {
            script.dataset.googleStatus = "error";
            reject(new Error("Could not load Google sign-in."));
        }, 15000);

        script.onload = () => {
            window.clearTimeout(timeout);
            script.dataset.googleStatus = "loaded";
            if (window.google?.accounts?.id) resolve();
            else reject(new Error("Google sign-in did not initialize."));
        };
        script.onerror = () => {
            window.clearTimeout(timeout);
            script.dataset.googleStatus = "error";
            reject(new Error("Could not load Google sign-in."));
        };
        document.head.appendChild(script);
    });
}

export default function GoogleSignInButton({ onCredential, disabled = false }) {
    const buttonRef = useRef(null);
    const [error, setError] = useState("");
    const [clientId, setClientId] = useState(
        (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim()
    );

    useEffect(() => {
        if (clientId) return undefined;
        let cancelled = false;
        api.get("/auth/google/config")
            .then((response) => {
                if (!cancelled) {
                    setClientId((response.data?.client_id || "").trim());
                }
            })
            .catch(() => {
                if (!cancelled) setClientId("");
            });
        return () => {
            cancelled = true;
        };
    }, [clientId]);

    useEffect(() => {
        let cancelled = false;
        if (!clientId || disabled) return undefined;

        loadGoogleScript()
            .then(() => {
                if (cancelled || !buttonRef.current || !window.google?.accounts?.id) return;
                setError("");
                buttonRef.current.replaceChildren();
                googleCredentialCallback = onCredential;
                if (initializedGoogleClientId !== clientId) {
                    window.google.accounts.id.initialize({
                        client_id: clientId,
                        ux_mode: "popup",
                        context: "signin",
                        itp_support: true,
                        use_fedcm_for_button: true,
                        callback: (response) => {
                            if (!response?.credential) {
                                setError("Google sign-in was cancelled or could not complete.");
                                return;
                            }
                            googleCredentialCallback?.(response.credential);
                        },
                        cancel_on_tap_outside: true,
                    });
                    initializedGoogleClientId = clientId;
                }
                window.google.accounts.id.renderButton(buttonRef.current, {
                    type: "standard",
                    theme: "outline",
                    size: "large",
                    text: "continue_with",
                    shape: "rectangular",
                    width: Math.min(buttonRef.current.clientWidth || 360, 400),
                });
            })
            .catch((loadError) => {
                if (!cancelled) setError(loadError.message);
            });

        return () => {
            cancelled = true;
        };
    }, [clientId, disabled, onCredential]);

    if (!clientId) {
        return null;
    }

    return (
        <div className="w-full">
            <div
                ref={buttonRef}
                className={`flex justify-center w-full min-h-[44px] ${disabled ? "pointer-events-none opacity-60" : ""}`}
                aria-label="Continue with Google"
            />
            {error && <p className="mt-2 text-center text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
    );
}

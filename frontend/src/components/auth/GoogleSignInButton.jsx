import { useEffect, useRef, useState } from "react";
import api from "../../api";

const GOOGLE_SCRIPT_ID = "google-identity-services";

function loadGoogleScript() {
    if (window.google?.accounts?.id) return Promise.resolve();

    const existing = document.getElementById(GOOGLE_SCRIPT_ID);
    if (existing) {
        return new Promise((resolve, reject) => {
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", () => reject(new Error("Could not load Google sign-in.")), { once: true });
        });
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.id = GOOGLE_SCRIPT_ID;
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error("Could not load Google sign-in."));
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
                buttonRef.current.replaceChildren();
                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: (response) => onCredential(response.credential),
                    cancel_on_tap_outside: true,
                });
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
        <div className="mt-4">
            <div
                ref={buttonRef}
                className={disabled ? "pointer-events-none opacity-60" : ""}
                aria-label="Continue with Google"
            />
            {error && <p className="mt-2 text-center text-xs text-rose-600">{error}</p>}
        </div>
    );
}

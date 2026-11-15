import axios from "axios";
import { getToken, removeToken } from "./auth";

// Set VITE_API_URL in frontend/.env for local development. Production builds
// require an absolute https:// API origin and fail in vite.config.js when it
// is missing or points at localhost/loopback/Quick Tunnel hosts.
export function getApiBase() {
    const configured = import.meta.env.VITE_API_URL;
    if (typeof window !== "undefined") {
        // When browsing over an HTTPS tunnel (e.g. *.trycloudflare.com), NEVER attempt to call
        // an insecure http://127.0.0.1:8000 URL because browsers will block it as Mixed Content!
        // Instead, return "" (same-origin relative) so requests are cleanly forwarded through
        // Vite's local dev server reverse proxy on loopback.
        if (
            window.location.hostname.endsWith(".trycloudflare.com") ||
            (window.location.protocol === "https:" && (!configured || configured.startsWith("http://")))
        ) {
            return "";
        }

        const isLocalHost =
            window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1";
        // When browsing locally, always use direct local backend to avoid unnecessary Cloudflare roundtrips and keepalive drops
        if (isLocalHost && (!configured || configured.includes(".trycloudflare.com"))) {
            return "http://127.0.0.1:8000";
        }
    }
    return configured || "http://127.0.0.1:8000";
}

export const API_BASE = getApiBase();

const api = axios.create({
    baseURL: API_BASE,
    timeout: 15000,
});

api.interceptors.request.use((config) => {
    // Dynamically update baseURL if accessing from localhost vs public tunnel
    const dynamicBase = getApiBase();
    if (dynamicBase === "") {
        config.baseURL = "";
    } else if (!config.baseURL || config.baseURL.includes(".trycloudflare.com")) {
        config.baseURL = dynamicBase;
    }

    const token = getToken();

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const config = error.config;

        // Auto-retry once for idempotent GET requests on transient tunnel disconnects or socket keepalive resets
        if (
            config &&
            !config._retry &&
            config.method?.toLowerCase() === "get" &&
            (!error.response || error.code === "ERR_NETWORK" || error.code === "ECONNABORTED")
        ) {
            config._retry = true;
            await new Promise((resolve) => setTimeout(resolve, 350));
            return api(config);
        }

        const url = error.config?.url || "";
        const isAuthEndpoint =
            url.includes("/auth/login") || url.includes("/auth/register");
        if (!isAuthEndpoint && error.response && error.response.status === 401) {
            removeToken();
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("coroomies:session-expired"));
                // Guard against destructive reload if user is currently typing in a form or chat
                const isTyping = document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);
                if (!isTyping) {
                    window.location.reload();
                }
            }
        }
        return Promise.reject(error);
    }
);

export default api;

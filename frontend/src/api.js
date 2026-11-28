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
        // When browsing locally, check for local override port or use direct local backend
        if (isLocalHost) {
            const overridePort =
                typeof window !== "undefined"
                    ? window.__COROOMIES_API_PORT__ ||
                      localStorage.getItem("coroomies_api_port")
                    : null;
            if (overridePort) {
                return `http://127.0.0.1:${overridePort}`;
            }
            if (!configured || configured.includes(".trycloudflare.com") || configured.includes("example.com")) {
                return "http://127.0.0.1:8000";
            }
        }
    }
    return configured || "http://127.0.0.1:8000";
}

export const API_BASE = getApiBase();

let pendingRequestsCount = 0;
let wakingTimer = null;

function notifyServerWaking() {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("coroomies:server-waking"));
    }
}

function notifyServerReady() {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("coroomies:server-ready"));
    }
}

const api = axios.create({
    baseURL: API_BASE,
    timeout: 45000, // 45 seconds to accommodate Render free-tier cold starts
});

api.interceptors.request.use((config) => {
    // Dynamically update baseURL if accessing from localhost vs public tunnel
    const dynamicBase = getApiBase();
    config.baseURL = dynamicBase;

    const token = getToken();

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    pendingRequestsCount++;
    if (pendingRequestsCount === 1 && !wakingTimer) {
        wakingTimer = setTimeout(() => {
            if (pendingRequestsCount > 0) {
                notifyServerWaking();
            }
        }, 2200);
    }

    return config;
});

api.interceptors.response.use(
    (response) => {
        pendingRequestsCount = Math.max(0, pendingRequestsCount - 1);
        if (pendingRequestsCount === 0) {
            if (wakingTimer) {
                clearTimeout(wakingTimer);
                wakingTimer = null;
            }
            notifyServerReady();
        }
        return response;
    },
    async (error) => {
        pendingRequestsCount = Math.max(0, pendingRequestsCount - 1);
        if (pendingRequestsCount === 0 && wakingTimer) {
            clearTimeout(wakingTimer);
            wakingTimer = null;
        }

        const config = error.config;
        if (!config) return Promise.reject(error);

        const status = error.response?.status;
        const isNetworkOrTimeout =
            !error.response ||
            error.code === "ERR_NETWORK" ||
            error.code === "ECONNABORTED" ||
            status === 502 ||
            status === 503 ||
            status === 504;

        // Bounded retries for cold starts and transient network disconnects
        config._retryCount = config._retryCount || 0;
        const method = config.method?.toLowerCase() || "get";
        const isIdempotent = ["get", "head", "options"].includes(method);
        const isHealth = config.url?.includes("/health");

        if (isNetworkOrTimeout && config._retryCount < 3 && (isIdempotent || isHealth)) {
            config._retryCount += 1;
            notifyServerWaking();
            const delay = Math.min(1500 * config._retryCount, 4500);
            await new Promise((resolve) => setTimeout(resolve, delay));
            return api(config);
        }

        const url = config.url || "";
        const isAuthEndpoint =
            url.includes("/auth/login") || url.includes("/auth/register");
        if (!isAuthEndpoint && error.response && error.response.status === 401) {
            removeToken();
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("coroomies:session-expired"));
            }
        }
        return Promise.reject(error);
    }
);

// In-flight GET request deduplication map, cache generation tracker, and SWR navigation cache
let cacheGeneration = 0;
const inFlightGetRequests = new Map();
const getResponseCache = new Map();
const SWR_FRESH_MS = 6000;    // Fresh cache TTL (6 seconds)
const SWR_STALE_MS = 120000;  // Stale-while-revalidate TTL (2 minutes)

function getCacheKey(config) {
    const url = config.url || "";
    const params = config.params ? JSON.stringify(config.params) : "";
    const token = getToken();
    // Cache isolation: isolate responses per user session
    const userScope = token ? token.slice(-16) : "anon";
    return `${userScope}:${url}?${params}`;
}

export function clearApiCache(filter) {
    cacheGeneration++;
    if (!filter) {
        getResponseCache.clear();
        inFlightGetRequests.clear();
        return;
    }
    for (const key of getResponseCache.keys()) {
        if (key.includes(filter)) {
            getResponseCache.delete(key);
        }
    }
}

if (typeof window !== "undefined") {
    window.addEventListener("coroomies:logout", () => {
        clearApiCache();
    });
    window.addEventListener("coroomies:session-expired", () => {
        clearApiCache();
    });
    window.addEventListener("coroomies:profile-updated", () => {
        clearApiCache("/profile");
        clearApiCache("/matches");
    });
    window.addEventListener("coroomies:refresh-counts", () => {
        clearApiCache("/notifications");
        clearApiCache("/requests");
    });
}

const originalRequest = api.request.bind(api);

api.request = function (config) {
    const method = (config.method || "get").toLowerCase();
    const isGet = method === "get";

    // Any mutation (POST, PUT, DELETE, PATCH) immediately invalidates cached data
    if (!isGet) {
        clearApiCache();
        return originalRequest(config);
    }

    if (config.skipCache || config.responseType === "blob") {
        return originalRequest(config);
    }

    const key = getCacheKey(config);
    const requestGen = cacheGeneration;
    const now = Date.now();

    const cached = getResponseCache.get(key);

    // 1. Fresh cache hit: resolve immediately with zero network overhead
    if (cached && now < cached.freshUntil) {
        return Promise.resolve(cached.response);
    }

    // 2. Stale cache hit (SWR): return cached response immediately for instant UI, revalidate in background
    if (cached && now < cached.staleUntil) {
        if (!inFlightGetRequests.has(key)) {
            const revalidatePromise = originalRequest(config)
                .then((res) => {
                    if (cacheGeneration === requestGen) {
                        getResponseCache.set(key, {
                            response: res,
                            freshUntil: Date.now() + SWR_FRESH_MS,
                            staleUntil: Date.now() + SWR_STALE_MS,
                        });
                    }
                    inFlightGetRequests.delete(key);
                    return res;
                })
                .catch(() => {
                    inFlightGetRequests.delete(key);
                });
            inFlightGetRequests.set(key, revalidatePromise);
        }
        return Promise.resolve(cached.response);
    }

    // 3. Deduplicate in-flight GET requests
    if (inFlightGetRequests.has(key)) {
        return inFlightGetRequests.get(key);
    }

    // 4. Cold fetch
    const reqPromise = originalRequest(config)
        .then((res) => {
            // Stale-response protection: Only store in cache if cacheGeneration has not changed
            if (cacheGeneration === requestGen) {
                getResponseCache.set(key, {
                    response: res,
                    freshUntil: Date.now() + SWR_FRESH_MS,
                    staleUntil: Date.now() + SWR_STALE_MS,
                });
            }
            inFlightGetRequests.delete(key);
            return res;
        })
        .catch((err) => {
            inFlightGetRequests.delete(key);
            throw err;
        });

    inFlightGetRequests.set(key, reqPromise);
    return reqPromise;
};

/**
 * Proactively checks backend readiness (wakes up Render cold starts).
 */
export async function checkBackendReadiness() {
    try {
        const res = await api.get("/health/ready", { timeout: 45000 });
        return res.status === 200;
    } catch {
        return false;
    }
}

export default api;

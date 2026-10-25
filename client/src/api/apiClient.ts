/**
 * @module ApiClient
 * 
 * Centralized Axios instance configured with base API URL, security interceptors,
 * and concurrent in-flight GET request deduplication.
 * Transmits HttpOnly session cookies (`hunting_token` and `hunting_refresh_token`) via
 * `withCredentials: true` and handles silent session refresh on 401 responses.
 * A 429 rejects with a RateLimitError carrying the server's retry delay; nothing is ever retried
 * automatically, so a rate limit can never feed a request loop.
 */

import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from "axios";
import envConfig from "../config/env";

/**
 * A request refused with 429 Too Many Requests. Still an AxiosError (`axios.isAxiosError` is
 * true and `response` is kept), with the delay the server asked for.
 */
export class RateLimitError extends AxiosError {
    /** Seconds until the budget resets, from the `Retry-After` header; null when absent. */
    readonly retryAfterSeconds: number | null;

    constructor(source: AxiosError) {
        const serverMessage = (source.response?.data as { message?: unknown } | undefined)?.message;
        super(
            typeof serverMessage === "string" ? serverMessage : "Too many requests",
            source.code,
            source.config,
            source.request,
            source.response,
        );
        this.name = "RateLimitError";
        const retryAfter = Number(source.response?.headers?.["retry-after"]);
        this.retryAfterSeconds = Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null;
    }
}

export const isRateLimitError = (error: unknown): error is RateLimitError => error instanceof RateLimitError;

/** What to tell the user about a rate limit: when to try again, as precisely as the server said. */
export const rateLimitMessage = (error: RateLimitError): string => {
    if (error.retryAfterSeconds !== null) {
        const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
        return `Too many requests. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    return error.message;
};

/**
 * Why the server refused a request, for showing to the user: the first field error of a 4xx
 * answer (it names what is wrong, e.g. which time slot), else its message, else `fallback`.
 * 5xx answers only say "Internal server error", so they get `fallback` too.
 */
export const apiErrorMessage = (error: unknown, fallback: string): string => {
    if (isRateLimitError(error)) return rateLimitMessage(error);
    if (!axios.isAxiosError(error) || !error.response || error.response.status >= 500) return fallback;
    const data = error.response.data as { message?: unknown; errors?: Array<{ message?: unknown }> } | undefined;
    const fieldMessage = data?.errors?.[0]?.message;
    if (typeof fieldMessage === "string") return fieldMessage;
    return typeof data?.message === "string" ? data.message : fallback;
};

const axiosInstance = axios.create({
    baseURL: envConfig.apiUrl,
    withCredentials: true,
    headers: {
        "X-Requested-With": "XMLHttpRequest",
    },
});

// Shared in-flight refresh promise to prevent multiple concurrent refresh calls
let refreshPromise: Promise<string | null> | null = null;

const attemptRefresh = async (): Promise<string | null> => {
    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async (): Promise<string | null> => {
        try {
            await axios.post(
                `${envConfig.apiUrl}/auth/refresh`,
                {},
                {
                    withCredentials: true,
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                }
            );
            return "refreshed";
        } catch (err: unknown) {
            // Only return null (signaling expired session) on explicit 401/403
            if (axios.isAxiosError(err) && err.response && (err.response.status === 401 || err.response.status === 403)) {
                return null;
            }
            // For network errors or 5xx outages, throw to prevent wiping stored credentials prematurely
            throw err;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
};

// Response Interceptor: Handle 401 Unauthorized globally with silent refresh
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
        // Nonprod servers add `details` to 5xx bodies for developers; never shown in the UI
        const details = axios.isAxiosError(error) ? (error.response?.data as { details?: unknown } | undefined)?.details : undefined;
        if (details) {
            console.error("[API] Server error details:", details);
        }
        if (axios.isAxiosError(error) && error.response?.status === 429) {
            return Promise.reject(new RateLimitError(error));
        }
        if (axios.isAxiosError(error) && error.response && error.response.status === 401) {
            const originalRequest = error.config as (AxiosRequestConfig & { _retry?: boolean });
            const requestUrl = originalRequest?.url || "";
            const hadSession = Boolean(localStorage.getItem("hunting_userId"));
            const isAuthRoute =
                requestUrl.includes("/auth/refresh") ||
                requestUrl.includes("/auth/login") ||
                requestUrl.includes("/auth/logout") ||
                (requestUrl.includes("/auth/me") && !hadSession);

            if (!originalRequest?._retry && !isAuthRoute) {
                originalRequest._retry = true;
                try {
                    const refreshResult = await attemptRefresh();
                    if (refreshResult) {
                        return axiosInstance(originalRequest);
                    }
                } catch {
                    // Network disruption during refresh; do not destroy session yet
                    return Promise.reject(error);
                }
            }

            // If request fails with 401 and cannot be refreshed, clear stored client session state
            const currentPath = window.location.pathname;

            localStorage.removeItem("hunting_userId");
            localStorage.removeItem("hunting_groupId");

            // Redirect to login if user had an active session and isn't already on public auth pages
            if (hadSession && currentPath !== "/login" && currentPath !== "/auth/callback") {
                window.location.href = "/login?error=session_expired";
            }
        }
        return Promise.reject(error);
    },
);

// In-flight Promise deduplication map for concurrent GET requests
const inFlightRequests = new Map<string, Promise<AxiosResponse<unknown>>>();

/**
 * Builds a deterministic cache key from the request URL and query parameters.
 */
const buildRequestKey = (url: string, config?: AxiosRequestConfig): string => {
    let paramsString = "";
    if (config?.params) {
        if (typeof config.params === "object" && config.params !== null) {
            const sortedParams = Object.keys(config.params)
                .sort()
                .reduce<Record<string, unknown>>((acc, key) => {
                    acc[key] = (config.params as Record<string, unknown>)[key];
                    return acc;
                }, {});
            paramsString = JSON.stringify(sortedParams);
        } else {
            paramsString = String(config.params);
        }
    }
    return `GET:${url}:${paramsString}`;
};

/**
 * Clears any in-flight cached promises. Useful for test resets and cache invalidation.
 */
export const clearInFlightRequests = (): void => {
    inFlightRequests.clear();
};

const originalGet = axiosInstance.get.bind(axiosInstance);

axiosInstance.get = (<T = unknown, R = AxiosResponse<T>, D = unknown>(
    url: string,
    config?: AxiosRequestConfig<D>,
): Promise<R> => {
    // A caller that manages cancellation gets its own request: sharing it could hand that caller
    // a request another caller already aborted (or let this caller's abort cancel theirs)
    if (config?.signal) {
        return originalGet<T, R, D>(url, config) as Promise<R>;
    }

    const requestKey = buildRequestKey(url, config as AxiosRequestConfig);

    const existingPromise = inFlightRequests.get(requestKey);
    if (existingPromise) {
        return existingPromise as Promise<R>;
    }

    const requestPromise = originalGet<T, R, D>(url, config).finally(() => {
        inFlightRequests.delete(requestKey);
    });

    inFlightRequests.set(
        requestKey,
        requestPromise as Promise<AxiosResponse<unknown>>,
    );

    return requestPromise as Promise<R>;
}) as typeof axiosInstance.get;

const apiClient: AxiosInstance = axiosInstance;

export default apiClient;

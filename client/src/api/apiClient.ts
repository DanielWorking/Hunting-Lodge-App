/**
 * @module ApiClient
 * 
 * Centralized Axios instance configured with base API URL, security interceptors,
 * and concurrent in-flight GET request deduplication.
 * Injects cryptographic Bearer JWT tokens into request headers and handles session expiration.
 */

import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from "axios";
import envConfig from "../config/env";

const axiosInstance = axios.create({
    baseURL: envConfig.apiUrl,
    withCredentials: true,
    headers: {
        "X-Requested-With": "XMLHttpRequest",
    },
});

// Request Interceptor: Attach JWT Bearer token to all outgoing requests
axiosInstance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("hunting_token");
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error: unknown) => Promise.reject(error),
);

// Shared in-flight refresh promise to prevent multiple concurrent refresh calls
let refreshPromise: Promise<string | null> | null = null;

const attemptRefresh = async (): Promise<string | null> => {
    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async (): Promise<string | null> => {
        try {
            const response = await axios.post<{ token?: string }>(
                `${envConfig.apiUrl}/auth/refresh`,
                {},
                {
                    withCredentials: true,
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                }
            );
            const newToken = response.data?.token;
            if (newToken) {
                localStorage.setItem("hunting_token", newToken);
            }
            return newToken || "refreshed";
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
        if (axios.isAxiosError(error) && error.response && error.response.status === 401) {
            const originalRequest = error.config as (AxiosRequestConfig & { _retry?: boolean });
            const requestUrl = originalRequest?.url || "";

            const isAuthRoute =
                requestUrl.includes("/auth/refresh") ||
                requestUrl.includes("/auth/login") ||
                requestUrl.includes("/users/login");

            if (!originalRequest?._retry && !isAuthRoute) {
                originalRequest._retry = true;
                try {
                    const refreshResult = await attemptRefresh();
                    if (refreshResult) {
                        const token = localStorage.getItem("hunting_token");
                        if (token && originalRequest.headers) {
                            originalRequest.headers.Authorization = `Bearer ${token}`;
                        }
                        return axiosInstance(originalRequest);
                    }
                } catch {
                    // Network disruption during refresh; do not destroy session yet
                    return Promise.reject(error);
                }
            }

            // If request fails with 401 and cannot be refreshed, clear stored auth credentials
            const currentPath = window.location.pathname;
            const hadSession = Boolean(localStorage.getItem("hunting_token") || localStorage.getItem("hunting_userId"));

            localStorage.removeItem("hunting_token");
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

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

// Response Interceptor: Handle 401 Unauthorized globally
axiosInstance.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
        if (axios.isAxiosError(error) && error.response && error.response.status === 401) {
            // If request fails with 401, clear stored auth credentials
            const currentPath = window.location.pathname;
            const hadToken = Boolean(localStorage.getItem("hunting_token"));

            localStorage.removeItem("hunting_token");
            localStorage.removeItem("hunting_userId");
            localStorage.removeItem("hunting_groupId");

            // Redirect to login if user had a token and isn't already on public auth pages
            if (hadToken && currentPath !== "/login" && currentPath !== "/auth/callback") {
                window.location.href = "/login?error=session_expired";
            }
        }
        return Promise.reject(error);
    },
);

// In-flight Promise deduplication map for concurrent GET requests
const inFlightRequests = new Map<string, Promise<AxiosResponse<any>>>();

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

axiosInstance.get = (<T = any, R = AxiosResponse<T>, D = any>(
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
        requestPromise as Promise<AxiosResponse<any>>,
    );

    return requestPromise as Promise<R>;
}) as typeof axiosInstance.get;

const apiClient: AxiosInstance = axiosInstance;

export default apiClient;

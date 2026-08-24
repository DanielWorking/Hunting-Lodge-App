/**
 * @module ApiClient
 * 
 * Centralized Axios instance configured with base API URL and security interceptors.
 * Injects cryptographic Bearer JWT tokens into request headers and handles session expiration.
 */

import axios from "axios";
import envConfig from "../config/env";

const apiClient = axios.create({
    baseURL: envConfig.apiUrl,
});

// Request Interceptor: Attach JWT Bearer token to all outgoing requests
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("hunting_token");
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error),
);

// Response Interceptor: Handle 401 Unauthorized globally
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            // If request fails with 401, clear stored auth credentials
            const currentPath = window.location.pathname;
            const hadToken = !!localStorage.getItem("hunting_token");

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

export default apiClient;

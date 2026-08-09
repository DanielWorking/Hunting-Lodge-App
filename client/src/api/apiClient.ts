import axios from "axios";

/**
 * Centralized Axios instance configured with the base API URL.
 * It also injects the user ID from localStorage into the headers of every request.
 */
const apiClient = axios.create({
    baseURL: "/api",
});

apiClient.interceptors.request.use(
    (config) => {
        const userId = localStorage.getItem("hunting_userId");
        if (userId) {
            config.headers["x-user-id"] = userId;
        }
        return config;
    },
    (error) => Promise.reject(error),
);

export default apiClient;

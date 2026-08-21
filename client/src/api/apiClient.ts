import axios from "axios";
import envConfig from "../config/env";

/**
 * Centralized Axios instance configured with the base API URL.
 * It also injects the user ID from localStorage into the headers of every request.
 */
const apiClient = axios.create({
    baseURL: envConfig.apiUrl,
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

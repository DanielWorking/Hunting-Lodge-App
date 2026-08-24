import apiClient from "./apiClient";

export const getSsoUrl = () => apiClient.get("/auth/sso-url");

export const loginWithCode = (data: { code: string; state: string | null }) => apiClient.post("/auth/login", data);

export const getMe = () => apiClient.get("/auth/me");


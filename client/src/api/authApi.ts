/**
 * @module AuthApi
 *
 * Provides client-side API methods for user authentication and session management.
 * Communicates with backend authentication endpoints to initiate Single Sign-On (SSO) flows,
 * exchange authorization codes for HttpOnly session cookies (`hunting_token` and `hunting_refresh_token`), and validate existing user sessions.
 */

import type { AxiosResponse } from "axios";
import apiClient from "./apiClient";
import type { User } from "../types";

export interface SsoUrlResponse {
    url: string;
    state?: string;
}

export interface SsoLoginPayload {
    code: string;
    state?: string | null;
}

export interface SsoLoginResponse {
    user: User;
    success?: boolean;
}

export interface SsoLogoutResponse {
    success: boolean;
    message: string;
    logoutUrl?: string;
}

/**
 * Requests the Single Sign-On (SSO) authorization URL from the server.
 *
 * Initiates the authentication flow by retrieving the identity provider redirect URL
 * configured on the backend with PKCE security parameters.
 *
 * @returns {Promise<AxiosResponse<SsoUrlResponse>>} Axios promise resolving with the SSO redirection URL payload.
 */
export const getSsoUrl = (): Promise<AxiosResponse<SsoUrlResponse>> =>
    apiClient.get<SsoUrlResponse>("/auth/sso-url");

/**
 * Exchanges an SSO authorization code for a session cookie and user record.
 *
 * Submits the authorization code and state parameter received from the identity provider callback
 * to finalize authentication, provision or update the local user record, and receive the
 * HttpOnly session cookies.
 *
 * @param  {SsoLoginPayload} data - The SSO callback payload containing code and optional state.
 * @returns {Promise<AxiosResponse<SsoLoginResponse>>} Axios promise resolving with the authenticated user object.
 */
export const loginWithCode = (data: SsoLoginPayload): Promise<AxiosResponse<SsoLoginResponse>> =>
    apiClient.post<SsoLoginResponse>("/auth/login", data);

/**
 * Terminates the authenticated session, invalidating cookies on the backend.
 *
 * @returns {Promise<AxiosResponse<SsoLogoutResponse>>} Axios promise resolving with logout outcome and optional IdP logout URL.
 */
export const logoutUser = (): Promise<AxiosResponse<SsoLogoutResponse>> =>
    apiClient.post<SsoLogoutResponse>("/auth/logout");

/**
 * Fetches the profile and permissions of the currently authenticated user.
 *
 * Relies on the HttpOnly session cookie sent with every API request.
 * Used during application startup to restore session state without prompting for re-login.
 *
 * @returns {Promise<AxiosResponse<any>>} Axios promise resolving with the current user's profile and group roles.
 */
export const getMe = (): Promise<AxiosResponse<User>> =>
    apiClient.get<User>("/auth/me");

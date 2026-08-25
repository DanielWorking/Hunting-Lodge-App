/**
 * @module AuthApi
 *
 * Provides client-side API methods for user authentication and session management.
 * Communicates with backend authentication endpoints to initiate Single Sign-On (SSO) flows,
 * exchange authorization codes for JWT credentials, and validate existing user sessions.
 */

import apiClient from "./apiClient";

/**
 * Requests the Single Sign-On (SSO) authorization URL from the server.
 *
 * Initiates the authentication flow by retrieving the identity provider redirect URL
 * configured on the backend.
 *
 * @returns {Promise<import("axios").AxiosResponse<{ url: string }>>} Axios promise resolving with the SSO redirection URL payload.
 */
export const getSsoUrl = () => apiClient.get("/auth/sso-url");

/**
 * Exchanges an SSO authorization code for a session token and user record.
 *
 * Submits the authorization code and state parameter received from the identity provider callback
 * to finalize authentication, provision or update the local user record, and receive a JWT token.
 *
 * @param  {Object}       data        The SSO callback payload.
 * @param  {string}       data.code   The temporary authorization code issued by the identity provider.
 * @param  {string|null}  data.state  The state token verified against the initial auth request for CSRF protection, or null.
 * @returns {Promise<import("axios").AxiosResponse<{ user: any; token: string }>>} Axios promise resolving with the authenticated user object and JWT bearer token.
 */
export const loginWithCode = (data: { code: string; state: string | null }) => apiClient.post("/auth/login", data);

/**
 * Fetches the profile and permissions of the currently authenticated user.
 *
 * Relies on the JWT Bearer token attached by the API client request interceptor.
 * Used during application startup to restore session state without prompting for re-login.
 *
 * @returns {Promise<import("axios").AxiosResponse>} Axios promise resolving with the current user's profile and group roles.
 */
export const getMe = () => apiClient.get("/auth/me");

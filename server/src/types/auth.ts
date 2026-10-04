/**
 * @module Types/Auth
 * Authoritative TypeScript interfaces and contracts for Single Sign-On (SSO),
 * OpenID Connect (OIDC) authentication flows, and session management.
 */

/**
 * Authoritative Company TokenSet Payload Contract
 * Returned by IdP Token Endpoint in Step 8
 */
export interface CompanyTokenSet {
    /** Cryptographic OAuth2 / OIDC access token used for downstream API authorization */
    readonly access_token: string;
    /** Standard OIDC JSON Web Token containing cryptographically verified user identity claims */
    readonly id_token: string;
    /** Long-lived token used to obtain renewed access tokens without re-prompting user */
    readonly refresh_token?: string;
    /** Lifetime of the access token in seconds */
    readonly expires_in: number;
    /** Lifetime of the refresh token in seconds (standard Keycloak claim) */
    readonly refresh_expires_in?: number;
    /** Unique OIDC session identifier for the active SSO session */
    readonly session_state?: string;
    /** Space-separated list of scopes granted by the identity provider */
    readonly scope?: string;
    /** Keycloak-specific policy epoch/counter defining token issuance validity */
    readonly "not-before-policy"?: number;
    /** Token type identifier, typically "Bearer" */
    readonly token_type: string;
}

/**
 * Ephemeral OIDC state stored in HttpOnly cookie between authorization redirect (Step 2)
 * and token exchange callback (Step 8) for PKCE, CSRF protection, and nonce verification.
 */
export interface OidcTransientState {
    readonly state: string;
    readonly nonce: string;
    readonly codeVerifier: string;
    readonly createdAt: number;
}

/**
 * User claims extracted from the verified OIDC ID token or UserInfo endpoint.
 */
export interface SsoClaimsRecord {
    readonly sub?: string;
    readonly name?: string;
    readonly preferred_username?: string;
    readonly nickname?: string;
    readonly email?: string;
    readonly groups?: ReadonlyArray<string>;
    readonly roles?: ReadonlyArray<string>;
    readonly [key: string]: unknown;
}

/**
 * Structured response for the SSO Authorization URL endpoint (GET /api/auth/sso-url).
 */
export interface SsoUrlResponse {
    readonly url: string;
    readonly state?: string;
}

/**
 * Response returned to client upon successful SSO login / code exchange.
 */
export interface SsoSessionResponse {
    readonly user: Record<string, unknown>;
    readonly token: string;
}

/**
 * Response returned to client upon session refresh.
 */
export interface SsoRefreshResponse {
    readonly success: boolean;
    readonly message: string;
    readonly user?: Record<string, unknown>;
    readonly token?: string;
}

/**
 * Response returned to client upon session termination.
 */
export interface SsoLogoutResponse {
    readonly success: boolean;
    readonly message: string;
    readonly logoutUrl?: string;
}

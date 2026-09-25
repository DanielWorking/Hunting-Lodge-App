/**
 * @module Config/SSO
 *
 * Configuration for Single Sign-On (SSO) authentication via OpenID Connect (OIDC).
 * Implemented using openid-client v6.8.8 functional discovery and configuration.
 */

import * as client from "openid-client";
import "./env";
import { isProd, deepFreeze } from "./env";
import type { SsoConfig } from "../types/config";

const isTestEnv = process.env.NODE_ENV === "test";

if (!isProd && !isTestEnv && (!process.env.SSO_CLIENT_ID || !process.env.SSO_ISSUER_URL)) {
    console.warn("⚠️  [Dev Warning] SSO variables are partially missing. SSO login may not work.");
}

const rawSsoConfig: SsoConfig = {
    issuerUrl: process.env.SSO_ISSUER_URL || (isTestEnv ? "https://auth.example.com" : ""),
    clientId: process.env.SSO_CLIENT_ID || (isTestEnv ? "test-client-id" : ""),
    clientSecret: process.env.SSO_CLIENT_SECRET || (isTestEnv ? "test-client-secret" : ""),
    redirectUri: process.env.SSO_REDIRECT_URI || "http://localhost:5173/auth/callback",
    identifierField: process.env.SSO_IDENTIFIER_FIELD || (isProd ? "username" : "email"),
    scope: "openid profile email",
};

/** Cached openid-client Configuration instance */
let cachedOidcConfig: client.Configuration | null = null;

/**
 * Discovers and returns the openid-client v6 Configuration instance.
 * Implements in-memory caching and connection timeout via customFetch.
 */
async function getOidcConfig(): Promise<client.Configuration> {
    if (cachedOidcConfig) {
        return cachedOidcConfig;
    }

    const issuerUrlStr = rawSsoConfig.issuerUrl;
    const clientId = rawSsoConfig.clientId;
    const clientSecret = rawSsoConfig.clientSecret || undefined;

    if (!issuerUrlStr || !clientId) {
        const missing = [
            !issuerUrlStr ? "SSO_ISSUER_URL" : null,
            !clientId ? "SSO_CLIENT_ID" : null,
        ].filter(Boolean).join(", ");
        const errorMsg = `SSO Configuration incomplete: Missing required SSO configuration [${missing}]. Failed to connect to SSO server.`;
        console.error(`❌ [SSO Error] ${errorMsg}`);
        throw new Error(errorMsg);
    }

    // In test environment or fallback, construct a manual Configuration without network discovery
    if (isTestEnv || issuerUrlStr === "https://auth.example.com") {
        cachedOidcConfig = new client.Configuration(
            {
                issuer: issuerUrlStr,
                authorization_endpoint: `${issuerUrlStr}/oauth/authorize`,
                token_endpoint: `${issuerUrlStr}/oauth/token`,
                jwks_uri: `${issuerUrlStr}/.well-known/jwks.json`,
                end_session_endpoint: `${issuerUrlStr}/oauth/logout`,
                response_types_supported: ["code"],
            },
            clientId,
            clientSecret,
        );
        return cachedOidcConfig;
    }

    try {
        const issuerUrl = new URL(issuerUrlStr);
        cachedOidcConfig = await client.discovery(
            issuerUrl,
            clientId,
            clientSecret,
            undefined,
            {
                [client.customFetch]: (url: string | URL, init?: RequestInit) => {
                    const timeoutSignal = AbortSignal.timeout(10000);
                    const signal = init?.signal
                        ? AbortSignal.any([init.signal, timeoutSignal])
                        : timeoutSignal;
                    return fetch(url, {
                        ...init,
                        signal,
                    });
                },
            },
        );
        return cachedOidcConfig;
    } catch (err: unknown) {
        console.error(`❌ [SSO Error] Failed to connect to SSO server at ${issuerUrlStr}:`, err);
        throw err;
    }
}

/**
 * Resets the cached Configuration instance (used for testing or reload).
 */
function resetOidcConfig(): void {
    cachedOidcConfig = null;
}

type ExportedSsoConfig = SsoConfig & {
    readonly default: SsoConfig;
    readonly ssoConfig: SsoConfig;
    readonly sso: SsoConfig;
    readonly getOidcConfig: typeof getOidcConfig;
    readonly resetOidcConfig: typeof resetOidcConfig;
};

const combinedSso: ExportedSsoConfig = {
    ...rawSsoConfig,
    default: rawSsoConfig,
    ssoConfig: rawSsoConfig,
    sso: rawSsoConfig,
    getOidcConfig,
    resetOidcConfig,
};

const exportedSso: ExportedSsoConfig = deepFreeze(combinedSso);

export { rawSsoConfig as ssoConfig, getOidcConfig, resetOidcConfig };
export default exportedSso;

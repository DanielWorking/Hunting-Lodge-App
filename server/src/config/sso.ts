/**
 * @module Config/SSO
 *
 * Configuration for Single Sign-On (SSO) authentication via OpenID Connect (OIDC).
 */

import "./env";
import { isProd, deepFreeze } from "./env";
import type { SsoConfig } from "../types/config";

if (!isProd && (!process.env.SSO_CLIENT_ID || !process.env.SSO_ISSUER_URL)) {
    console.warn("⚠️  [Dev Warning] SSO variables are partially missing. SSO login may not work.");
}

const rawSsoConfig: SsoConfig = {
    issuerUrl: process.env.SSO_ISSUER_URL || "",
    clientId: process.env.SSO_CLIENT_ID || "",
    clientSecret: process.env.SSO_CLIENT_SECRET || "",
    redirectUri: process.env.SSO_REDIRECT_URI || "http://localhost:5173/auth/callback",
    identifierField: process.env.SSO_IDENTIFIER_FIELD || (isProd ? "username" : "email"),
    scope: "openid profile email",
    usePkce: process.env.SSO_USE_PKCE !== "false",
    cookieSecret: process.env.SSO_COOKIE_SECRET || process.env.JWT_SECRET || "hunting-lodge-sso-cookie-secret",
    cookieDomain: process.env.SSO_COOKIE_DOMAIN || undefined,
    cookieSecure: process.env.SSO_COOKIE_SECURE ? process.env.SSO_COOKIE_SECURE === "true" : isProd,
    sameSite: (process.env.SSO_SAME_SITE as "lax" | "strict" | "none") || "lax",
    sessionCookieName: "hunting_token",
    refreshCookieName: "hunting_refresh_token",
    stateCookieName: "hunting_oidc_state",
    clockTolerance: 15,
};

type ExportedSsoConfig = SsoConfig & {
    readonly default: SsoConfig;
    readonly ssoConfig: SsoConfig;
    readonly sso: SsoConfig;
};

const combinedSso: ExportedSsoConfig = {
    ...rawSsoConfig,
    default: rawSsoConfig,
    ssoConfig: rawSsoConfig,
    sso: rawSsoConfig,
};

const exportedSso: ExportedSsoConfig = deepFreeze(combinedSso);

export = exportedSso;

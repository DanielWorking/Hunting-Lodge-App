/**
 * @module Config/SSO
 *
 * Configuration for Single Sign-On (SSO) authentication via OpenID Connect (OIDC).
 */

import "./env";
import { deepFreeze, validatedEnv } from "./env";
import type { SsoConfig } from "../types/config";

// Required SSO variables are enforced at startup by validateServerEnv, identically in every environment.
const redirectUri = validatedEnv.SSO_REDIRECT_URI || "";
// Cookies are Secure whenever the app is served over HTTPS; only local http://localhost development is not.
const servedOverHttps = redirectUri.startsWith("https://");

const rawSsoConfig: SsoConfig = {
    issuerUrl: validatedEnv.SSO_ISSUER_URL || "",
    clientId: validatedEnv.SSO_CLIENT_ID || "",
    clientSecret: validatedEnv.SSO_CLIENT_SECRET || "",
    redirectUri,
    identifierField: validatedEnv.SSO_IDENTIFIER_FIELD || "email",
    scope: "openid profile email",
    usePkce: validatedEnv.SSO_USE_PKCE !== "false",
    cookieSecret: validatedEnv.SSO_COOKIE_SECRET || validatedEnv.JWT_SECRET || "",
    cookieDomain: process.env.SSO_COOKIE_DOMAIN || undefined,
    // Always Secure over HTTPS; SSO_COOKIE_SECURE=false only takes effect on plain-http localhost
    cookieSecure: servedOverHttps || validatedEnv.SSO_COOKIE_SECURE === "true",
    sameSite: (validatedEnv.SSO_SAME_SITE as "lax" | "strict" | "none") || "lax",
    sessionCookieName: "hunting_token",
    refreshCookieName: "hunting_refresh_token",
    stateCookieName: "hunting_oidc_state",
    clockTolerance: 15,
};

const ssoConfig = deepFreeze(rawSsoConfig);

export default ssoConfig;

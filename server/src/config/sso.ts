/**
 * @module Config/SSO
 *
 * Configuration for Single Sign-On (SSO) authentication via OpenID Connect (OIDC).
 */

import "./env";
import { isProd, isPreProd, isNonProd, deepFreeze, validatedEnv } from "./env";
import type { SsoConfig } from "../types/config";

if (isNonProd && (!validatedEnv.SSO_CLIENT_ID || !validatedEnv.SSO_ISSUER_URL)) {
    console.warn("⚠️  [Nonprod Warning] SSO variables are partially missing. SSO login may not work.");
}

const rawSsoConfig: SsoConfig = {
    issuerUrl: validatedEnv.SSO_ISSUER_URL || "",
    clientId: validatedEnv.SSO_CLIENT_ID || "",
    clientSecret: validatedEnv.SSO_CLIENT_SECRET || "",
    redirectUri: validatedEnv.SSO_REDIRECT_URI || (isNonProd ? "http://localhost:5173/auth/callback" : ""),
    identifierField: validatedEnv.SSO_IDENTIFIER_FIELD || (isProd ? "username" : "email"),
    scope: "openid profile email",
    usePkce: validatedEnv.SSO_USE_PKCE !== "false",
    cookieSecret: validatedEnv.SSO_COOKIE_SECRET || validatedEnv.JWT_SECRET || "hunting-lodge-sso-cookie-secret",
    cookieDomain: process.env.SSO_COOKIE_DOMAIN || undefined,
    cookieSecure: validatedEnv.SSO_COOKIE_SECURE ? validatedEnv.SSO_COOKIE_SECURE === "true" : (isProd || isPreProd),
    sameSite: (validatedEnv.SSO_SAME_SITE as "lax" | "strict" | "none") || "lax",
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

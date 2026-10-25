/**
 * @module AuthController
 * 
 * Handles user authentication via OpenID Connect (OIDC).
 * Integrates with an external SSO provider to manage user logins,
 * PKCE authorization flows, automatic user provisioning, and session identification.
 * Migrated to strict TypeScript with zero `any` and robust claim resolution.
 */

import crypto from "crypto";
import https from "https";
import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { Issuer, BaseClient, TokenSet, custom, generators } from "openid-client";
import User, { toPublicUser } from "../models/User";
import Group from "../models/Group";
import config from "../config";
import ssoConfig from "../config/sso";
import { generateToken, verifyToken } from "../utils/jwt";
import { isSuperAdminUser, isAdmin, AuthUser } from "../utils/authHelpers";
import { invalidateUserCache } from "../middleware/authMiddleware";
import { resolveOrProvisionUser } from "../utils/ssoIdentity";
import type { SsoLoginInput } from "../routes/auth";
import type {
    CompanyTokenSet,
    OidcTransientState,
    SsoClaimsRecord,
    SsoUrlResponse,
    SsoLogoutResponse,
} from "../types/auth";

// Configure outbound HTTP keep-alive connection pooling for OIDC token exchanges and discovery
const ssoHttpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    keepAliveMsecs: 30000,
    timeout: 10000,
});
custom.setHttpOptionsDefaults({
    agent: ssoHttpsAgent,
    timeout: 10000,
});

/** Cached OIDC client instance to avoid repeated dynamic discoveries. */
let client: BaseClient | null = null;

/**
 * Deterministically creates an HMAC-SHA256 signature for transient state cookie payloads.
 */
function signCookie(value: string, secret: string): string {
    const signature = crypto.createHmac("sha256", secret).update(value).digest("base64url");
    return `${Buffer.from(value, "utf8").toString("base64url")}.${signature}`;
}

/**
 * Validates the HMAC-SHA256 signature and parses a signed cookie payload.
 */
function verifyAndParseCookie<T>(signedValue: string | undefined, secret: string): T | null {
    if (!signedValue || typeof signedValue !== "string") return null;
    const parts = signedValue.split(".");
    if (parts.length !== 2) return null;
    const [encodedPayload, signature] = parts;
    try {
        const rawPayload = Buffer.from(encodedPayload, "base64url").toString("utf8");
        const expectedSignature = crypto.createHmac("sha256", secret).update(rawPayload).digest("base64url");
        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expectedSignature);
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            return null;
        }
        return JSON.parse(rawPayload) as T;
    } catch {
        return null;
    }
}

/** What the sealed refresh cookie carries: the provider's refresh token and the session it belongs to. */
interface RefreshBinding {
    readonly rt: string;
    readonly uid: string;
    readonly tv: number;
}

/**
 * Seals the identity provider's refresh token together with the app user and the session version
 * (tokenVersion) it was issued for, signed so the client cannot alter any of it.
 */
export function sealRefreshToken(refreshToken: string, user: { _id?: unknown; tokenVersion?: number }): string {
    const binding: RefreshBinding = { rt: refreshToken, uid: String(user._id), tv: user.tokenVersion ?? 0 };
    return signCookie(JSON.stringify(binding), ssoConfig.cookieSecret);
}

/** Verifies and opens a sealed refresh cookie; null for anything unsigned, tampered or malformed. */
function openRefreshCookie(rawCookie: unknown): RefreshBinding | null {
    if (typeof rawCookie !== "string" || rawCookie.length === 0) {
        return null;
    }
    const parsed = verifyAndParseCookie<Partial<RefreshBinding>>(rawCookie, ssoConfig.cookieSecret);
    if (!parsed || typeof parsed.rt !== "string" || typeof parsed.uid !== "string" || typeof parsed.tv !== "number") {
        return null;
    }
    return { rt: parsed.rt, uid: parsed.uid, tv: parsed.tv };
}

/**
 * Initializes or retrieves the cached OIDC client.
 * 
 * Performs dynamic discovery of the SSO issuer's configuration 
 * and instantiates a client with the project's credentials.
 * 
 * @returns The initialized OIDC client instance.
 * @throws If issuer discovery or client initialization fails.
 */
export async function getClient(): Promise<BaseClient> {
    if (client) {
        return client;
    }

    if (!ssoConfig.issuerUrl || !ssoConfig.clientId) {
        const missing = [
            !ssoConfig.issuerUrl ? "SSO_ISSUER_URL" : null,
            !ssoConfig.clientId ? "SSO_CLIENT_ID" : null,
        ].filter(Boolean).join(", ");
        const errorMsg = `SSO Configuration incomplete: Missing required SSO configuration [${missing}]. Failed to connect to SSO server.`;
        console.error(`❌ [SSO Error] ${errorMsg}`);
        throw new Error(errorMsg);
    }

    try {
        const issuer = await Issuer.discover(ssoConfig.issuerUrl);

        client = new issuer.Client({
            client_id: ssoConfig.clientId,
            client_secret: ssoConfig.clientSecret,
            redirect_uris: [ssoConfig.redirectUri],
            response_types: ["code"],
        });

        // Configure clock tolerance to prevent token clock-skew rejections
        client[custom.clock_tolerance] = ssoConfig.clockTolerance || 15;

        return client;
    } catch (discoveryError: unknown) {
        console.error(`❌ [SSO Error] Failed to connect to SSO server at ${ssoConfig.issuerUrl}:`, discoveryError);
        throw discoveryError;
    }
}

/**
 * Reset client cache (useful for testing and configuration changes).
 */
export function resetClientCache(): void {
    client = null;
}

/**
 * Step 2 & Step 3: Generates the authorization URL with PKCE for the SSO provider.
 * Generates code_verifier, code_challenge (S256), state, and nonce.
 * Sets signed hunting_oidc_state cookie and returns the URL and state.
 */
export async function getSsoUrl(_req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const ssoClient = await getClient();

        // Generate PKCE code verifier and S256 code challenge
        const codeVerifier = generators.codeVerifier();
        const codeChallenge = generators.codeChallenge(codeVerifier);
        const state = generators.state();
        const nonce = generators.nonce();

        const transientState: OidcTransientState = {
            state,
            nonce,
            codeVerifier,
            createdAt: Date.now(),
        };

        // Set signed hunting_oidc_state cookie (HttpOnly, SameSite=Lax, Max-Age 600)
        const serializedState = JSON.stringify(transientState);
        const signedCookieValue = signCookie(serializedState, ssoConfig.cookieSecret);

        res.cookie(ssoConfig.stateCookieName, signedCookieValue, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            maxAge: 600 * 1000, // 10 minutes
            path: "/api/auth",
            domain: ssoConfig.cookieDomain,
        });

        const url = ssoClient.authorizationUrl({
            scope: ssoConfig.scope,
            state,
            nonce,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
        });

        const responsePayload: SsoUrlResponse = { url, state };
        res.json(responsePayload);
    } catch (error: unknown) {
        console.error("Error generating SSO URL:", error);
        if (typeof next === "function") {
            next(error);
            return;
        }
        res.status(500).json({ message: "Failed to generate SSO URL", code: "INTERNAL_ERROR" });
    }
}

function isDatabaseError(error: unknown): boolean {
    if (error instanceof mongoose.Error) {
        return true;
    }
    if (error instanceof Error && /^Mongo/i.test(error.name)) {
        return true;
    }
    return false;
}

/**
 * Step 8 & Step 9: Completes the SSO authentication flow using an authorization code.
 * Validates code, state, and transient cookie.
 * Exchanges the code for TokenSet using PKCE code_verifier.
 * Strictly maps to CompanyTokenSet, extracts user claims, provisions/syncs user,
 * and issues httpOnly session cookies.
 */
export async function login(req: Request<unknown, unknown, SsoLoginInput>, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = req.body || {};
        const code = typeof body.code === "string" ? body.code.trim() : "";
        const state = typeof body.state === "string" ? body.state.trim() : undefined;

        if (!code) {
            res.status(400).json({ message: "Authorization code missing", code: "VALIDATION_ERROR" });
            return;
        }

        // Retrieve and verify transient state cookie
        const rawStateCookie = req.cookies?.[ssoConfig.stateCookieName];
        const transientState = verifyAndParseCookie<OidcTransientState>(rawStateCookie, ssoConfig.cookieSecret);

        if (!transientState) {
            res.status(401).json({
                message: "SSO Authentication failed",
                error: "Missing or invalid OIDC state cookie",
                code: "NO_STATE_COOKIE",
            });
            return;
        }

        if (!state || transientState.state !== state) {
            res.status(401).json({
                message: "SSO Authentication failed",
                error: "OIDC state verification failed: state parameter mismatch",
                code: "INVALID_STATE",
            });
            return;
        }

        const ssoClient = await getClient();

        // Build callback checks using transient state verifier and nonce
        const checks: {
            code_verifier?: string;
            state?: string;
            nonce?: string;
        } = {};

        if (transientState?.codeVerifier) {
            checks.code_verifier = transientState.codeVerifier;
        }
        if (transientState?.state) {
            checks.state = transientState.state;
        }
        if (transientState?.nonce) {
            checks.nonce = transientState.nonce;
        }

        const callbackParams = {
            code,
            ...(state ? { state } : (transientState?.state ? { state: transientState.state } : {})),
        };

        const tokenSet: TokenSet = await ssoClient.callback(
            ssoConfig.redirectUri,
            callbackParams,
            checks
        );

        // Strictly validate and map the CompanyTokenSet (9 company properties)
        const rawTokenSet = tokenSet as unknown as Record<string, unknown>;
        const companyTokenSet: CompanyTokenSet = {
            access_token: tokenSet.access_token || "",
            id_token: tokenSet.id_token || "",
            refresh_token: tokenSet.refresh_token,
            expires_in: typeof tokenSet.expires_in === "number" ? tokenSet.expires_in : 3600,
            refresh_expires_in: typeof rawTokenSet.refresh_expires_in === "number"
                ? (rawTokenSet.refresh_expires_in as number)
                : undefined,
            session_state: typeof tokenSet.session_state === "string" ? tokenSet.session_state : undefined,
            scope: tokenSet.scope,
            "not-before-policy": typeof rawTokenSet["not-before-policy"] === "number"
                ? (rawTokenSet["not-before-policy"] as number)
                : undefined,
            token_type: tokenSet.token_type || "Bearer",
        };

        // Extract user claims safely and resolve/provision user
        const claims = (tokenSet.claims() || {}) as SsoClaimsRecord;
        const user = await resolveOrProvisionUser(claims, ssoConfig.issuerUrl);

        // Response-safe copy: SSO issuer/subject and tokenVersion stay server-side, and so does the
        // vacation balance (only a Shift Manager sees balances, through the group's member list)
        const userObj = toPublicUser(user);
        delete userObj.vacationBalance;
        const adminGroupName = config.superAdmin.groupName;
        const rawGroups = Array.isArray(userObj.groups) ? [...userObj.groups] : [];
        userObj.groups = rawGroups.map((g: any) => {
            const gDoc = typeof g?.toObject === "function" ? g.toObject() : { ...g };
            const gid = gDoc?.groupId && typeof gDoc.groupId === "object" && "_id" in gDoc.groupId
                ? (gDoc.groupId as { _id?: unknown; name?: string }).name || String((gDoc.groupId as { _id?: unknown })._id)
                : String(gDoc?.groupId);
            const gName = gDoc?.name || gDoc?.groupName || (gDoc?.groupId && typeof gDoc.groupId === "object" ? gDoc.groupId.name : undefined);
            return {
                ...gDoc,
                isSystemGroup: gid === adminGroupName || gName === adminGroupName,
            };
        });
        userObj.isSuperAdmin = isSuperAdminUser(user);
        userObj.isAdmin = isAdmin(user as unknown as AuthUser);

        const token = generateToken(user);

        // Set httpOnly session cookie hunting_token
        res.cookie(ssoConfig.sessionCookieName, token, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            maxAge: 24 * 60 * 60 * 1000,
            path: "/",
            domain: ssoConfig.cookieDomain,
        });

        // Set httpOnly refresh token cookie if present in CompanyTokenSet
        if (companyTokenSet.refresh_token) {
            const refreshMaxAge = companyTokenSet.refresh_expires_in
                ? companyTokenSet.refresh_expires_in * 1000
                : 30 * 24 * 60 * 60 * 1000;
            res.cookie(ssoConfig.refreshCookieName, sealRefreshToken(companyTokenSet.refresh_token, user), {
                httpOnly: true,
                secure: ssoConfig.cookieSecure,
                sameSite: "strict",
                maxAge: refreshMaxAge,
                path: "/api/auth",
                domain: ssoConfig.cookieDomain,
            });
        }

        // Clear transient hunting_oidc_state cookie
        res.clearCookie(ssoConfig.stateCookieName, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            path: "/api/auth",
            domain: ssoConfig.cookieDomain,
        });

        res.json({ user: userObj, success: true });
    } catch (error: unknown) {
        console.error("SSO Login Error:", error);
        const errCode = (error as { code?: string })?.code;
        const isNetworkTimeout = errCode === "ETIMEDOUT" || errCode === "ECONNREFUSED" || errCode === "ENOTFOUND" || errCode === "ECONNRESET";

        if (isNetworkTimeout) {
            res.status(504).json({
                message: "Identity provider connection timeout during login",
                code: "IDP_TIMEOUT",
                // Same generic text in every environment; the details are in the server log above
                error: "Identity provider connection timeout",
            });
            return;
        }

        if (isDatabaseError(error)) {
            if (typeof next === "function") {
                next(error);
                return;
            }
            res.status(500).json({
                message: "Database error during authentication",
                code: "INTERNAL_SERVER_ERROR",
            });
            return;
        }

        res.status(401).json({
            message: "SSO Authentication failed",
            code: "SSO_AUTH_FAILED",
            // Same generic text in every environment; the details are in the server log above
            error: "Invalid authorization code or provider error",
        });
    }
}

/**
 * Renews the application session using the hunting_refresh_token cookie.
 */
export async function refreshToken(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const rawRefreshCookie = req.cookies?.[ssoConfig.refreshCookieName];

        if (!rawRefreshCookie || typeof rawRefreshCookie !== "string") {
            res.status(401).json({
                message: "Refresh token missing",
                code: "NO_REFRESH_TOKEN",
            });
            return;
        }

        // The cookie seals the provider's refresh token with the app user and session version it was
        // issued for. Anything unsigned or tampered with is rejected before the provider is called.
        const binding = openRefreshCookie(rawRefreshCookie);
        if (!binding) {
            throw new Error("Refresh cookie is not a valid sealed session");
        }

        // The user comes from the sealed binding, never from editable claims such as a display name
        const user = await User.findById(binding.uid);
        if (!user || user.isActive === false) {
            res.status(401).json({
                message: "User not found or inactive during token refresh",
                code: "USER_INACTIVE",
            });
            return;
        }
        // Logout and deactivation bump tokenVersion, so an older refresh cookie can never revive a
        // session, even when revoking it at the identity provider failed
        if ((user.tokenVersion ?? 0) !== binding.tv) {
            throw new Error("Refresh cookie belongs to a revoked session");
        }

        const ssoClient = await getClient();
        const refreshedTokenSet: TokenSet = await ssoClient.refresh(binding.rt);

        const rawRefreshed = refreshedTokenSet as unknown as Record<string, unknown>;
        const companyTokenSet: CompanyTokenSet = {
            access_token: refreshedTokenSet.access_token || "",
            id_token: refreshedTokenSet.id_token || "",
            refresh_token: refreshedTokenSet.refresh_token || binding.rt,
            expires_in: typeof refreshedTokenSet.expires_in === "number" ? refreshedTokenSet.expires_in : 3600,
            refresh_expires_in: typeof rawRefreshed.refresh_expires_in === "number"
                ? (rawRefreshed.refresh_expires_in as number)
                : undefined,
            session_state: typeof refreshedTokenSet.session_state === "string" ? refreshedTokenSet.session_state : undefined,
            scope: refreshedTokenSet.scope,
            "not-before-policy": typeof rawRefreshed["not-before-policy"] === "number"
                ? (rawRefreshed["not-before-policy"] as number)
                : undefined,
            token_type: refreshedTokenSet.token_type || "Bearer",
        };

        // When the provider returns a new ID token, it must still be the same provider account
        const claims = (refreshedTokenSet.id_token ? refreshedTokenSet.claims() : {}) as SsoClaimsRecord;
        if (user.ssoSubject && typeof claims.sub === "string" && claims.sub !== user.ssoSubject) {
            throw new Error("Refreshed identity does not match the session's user");
        }

        const token = generateToken(user);

        // Update hunting_token session cookie
        res.cookie(ssoConfig.sessionCookieName, token, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            maxAge: 24 * 60 * 60 * 1000,
            path: "/",
            domain: ssoConfig.cookieDomain,
        });

        // Update refresh token cookie if renewed
        if (companyTokenSet.refresh_token) {
            const refreshMaxAge = companyTokenSet.refresh_expires_in
                ? companyTokenSet.refresh_expires_in * 1000
                : 30 * 24 * 60 * 60 * 1000;
            res.cookie(ssoConfig.refreshCookieName, sealRefreshToken(companyTokenSet.refresh_token, user), {
                httpOnly: true,
                secure: ssoConfig.cookieSecure,
                sameSite: "strict",
                maxAge: refreshMaxAge,
                path: "/api/auth",
                domain: ssoConfig.cookieDomain,
            });
        }

        res.json({
            success: true,
            message: "Session refreshed",
        });
    } catch (error: unknown) {
        console.error("Session refresh error:", error);
        const errCode = (error as { code?: string })?.code;
        const isNetworkTimeout = errCode === "ETIMEDOUT" || errCode === "ECONNREFUSED" || errCode === "ENOTFOUND" || errCode === "ECONNRESET";

        if (isNetworkTimeout) {
            res.status(504).json({
                message: "Identity provider network timeout during session refresh",
                code: "IDP_TIMEOUT",
            });
            return;
        }

        if (isDatabaseError(error)) {
            if (typeof next === "function") {
                next(error);
                return;
            }
            res.status(500).json({
                message: "Database error during session refresh",
                code: "INTERNAL_SERVER_ERROR",
            });
            return;
        }

        // Only clear stale session cookies on definitive invalid token rejection
        res.clearCookie(ssoConfig.sessionCookieName, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            path: "/",
            domain: ssoConfig.cookieDomain,
        });
        res.clearCookie(ssoConfig.refreshCookieName, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: "strict",
            path: "/api/auth",
            domain: ssoConfig.cookieDomain,
        });
        res.status(401).json({
            message: "Session refresh failed",
            code: "REFRESH_FAILED",
            error: "Session refresh failed",
        });
    }
}

interface LogoutSession {
    readonly userId: string;
    readonly tokenVersion: number;
}

/**
 * Collects the sessions behind every correctly signed token sent with the request:
 * the session cookie and/or an `Authorization: Bearer` header. Expired tokens still count,
 * since logging out must revoke them, but unsigned or tampered tokens are ignored so a
 * caller cannot revoke another user's sessions by forging a token.
 */
function collectLogoutSessions(req: Request): LogoutSession[] {
    const sessions = new Map<string, LogoutSession>();

    const rawAuthHeader = req.headers?.authorization;
    const bearerToken = typeof rawAuthHeader === "string" && rawAuthHeader.startsWith("Bearer ")
        ? rawAuthHeader.split(" ")[1]?.trim()
        : undefined;
    const cookieToken = req.cookies?.[ssoConfig.sessionCookieName];

    for (const token of [cookieToken, bearerToken]) {
        if (typeof token !== "string" || token.length === 0) {
            continue;
        }
        try {
            const decoded = verifyToken(token, { ignoreExpiration: true });
            const userId = decoded.userId ? String(decoded.userId) : "";
            if (mongoose.Types.ObjectId.isValid(userId)) {
                // Same default as protect(): tokens issued before versioning count as version 0
                const tokenVersion = typeof decoded.tokenVersion === "number" ? decoded.tokenVersion : 0;
                sessions.set(`${userId}:${tokenVersion}`, { userId, tokenVersion });
            }
        } catch {
            // An unverifiable token identifies nobody; there is nothing to revoke for it
        }
    }

    // A sealed refresh cookie identifies its session too (e.g. a client that only holds that cookie)
    const refreshBinding = openRefreshCookie(req.cookies?.[ssoConfig.refreshCookieName]);
    if (refreshBinding && mongoose.Types.ObjectId.isValid(refreshBinding.uid)) {
        sessions.set(`${refreshBinding.uid}:${refreshBinding.tv}`, { userId: refreshBinding.uid, tokenVersion: refreshBinding.tv });
    }

    return [...sessions.values()];
}

/**
 * Revokes a session by bumping the user's tokenVersion, but only while the presented token
 * is still current. A stale token (already revoked, or from before a deactivation) then
 * cannot be replayed to keep logging its owner out.
 */
async function revokeSession({ userId, tokenVersion }: LogoutSession): Promise<void> {
    await User.updateOne({ _id: userId, tokenVersion }, { $inc: { tokenVersion: 1 } });
    invalidateUserCache(userId);
}

/**
 * Revokes the OIDC refresh token at the identity provider, so a captured
 * `hunting_refresh_token` cannot mint new sessions through POST /auth/refresh after logout.
 * Best effort: logout still succeeds if the provider is unreachable or has no revocation endpoint.
 */
async function revokeRefreshTokenAtProvider(refreshToken: unknown): Promise<void> {
    if (typeof refreshToken !== "string" || refreshToken.length === 0) {
        return;
    }
    try {
        const ssoClient = await getClient();
        await ssoClient.revoke(refreshToken, "refresh_token");
    } catch (revokeErr: unknown) {
        console.warn("Could not revoke the refresh token at the identity provider:", revokeErr);
    }
}

/**
 * Terminates the application session, clears all auth cookies,
 * increments user tokenVersion for server-side revocation (for both cookie
 * and Bearer-header sessions), and provides OIDC RP-initiated logout URL if supported.
 */
export async function logout(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        // 1. Always clear authentication and session cookies first
        res.clearCookie(ssoConfig.sessionCookieName, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: ssoConfig.sameSite,
            path: "/",
            domain: ssoConfig.cookieDomain,
        });
        res.clearCookie(ssoConfig.refreshCookieName, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: "strict",
            path: "/api/auth",
            domain: ssoConfig.cookieDomain,
        });
        res.clearCookie(ssoConfig.stateCookieName, {
            httpOnly: true,
            secure: ssoConfig.cookieSecure,
            sameSite: "lax",
            path: "/api/auth",
            domain: ssoConfig.cookieDomain,
        });

        // 2. Increment tokenVersion for every presented session so the token is revoked server-side,
        //    and revoke the refresh token at the identity provider (req.cookies still holds it)
        await Promise.all([
            ...collectLogoutSessions(req).map((session) =>
                revokeSession(session).catch((dbErr: unknown) => {
                    console.warn("Could not increment tokenVersion on logout:", dbErr);
                }),
            ),
            revokeRefreshTokenAtProvider(openRefreshCookie(req.cookies?.[ssoConfig.refreshCookieName])?.rt),
        ]);

        let logoutUrl: string | undefined;
        try {
            const ssoClient = await getClient();
            if (typeof ssoClient.endSessionUrl === "function") {
                let postLogoutRedirectUri: string;
                try {
                    const parsedUrl = new URL(ssoConfig.redirectUri);
                    parsedUrl.pathname = "/login";
                    parsedUrl.search = "";
                    parsedUrl.hash = "";
                    postLogoutRedirectUri = parsedUrl.toString();
                } catch {
                    postLogoutRedirectUri = ssoConfig.redirectUri.replace(/\/auth\/callback.*$/, "/login");
                }

                logoutUrl = ssoClient.endSessionUrl({
                    post_logout_redirect_uri: postLogoutRedirectUri,
                });
            }
        } catch (endSessionErr) {
            console.warn("Failed to generate OIDC endSessionUrl:", endSessionErr);
        }

        const response: SsoLogoutResponse = {
            success: true,
            message: "Logged out successfully",
            ...(logoutUrl ? { logoutUrl } : {}),
        };
        res.json(response);
    } catch (error: unknown) {
        console.error("Logout error:", error);
        if (typeof next === "function") {
            next(error);
            return;
        }
        res.status(500).json({ message: "Logout failed", code: "INTERNAL_ERROR" });
    }
}

/**
 * Retrieves the currently authenticated user's profile and permissions.
 * Dynamically restores Super Admin group claims if root admin lacks explicit group record.
 * Requires protect middleware.
 */
export async function getMe(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ message: "Not authenticated", code: "UNAUTHORIZED" });
            return;
        }

        const adminGroupName = config.superAdmin.groupName;
        const isSuperAdmin = isSuperAdminUser(user);

        // Response-safe copy: SSO issuer/subject and tokenVersion stay server-side, and so does the
        // vacation balance (only a Shift Manager sees balances, through the group's member list)
        const userObj = toPublicUser(user);
        delete userObj.vacationBalance;

        if (isSuperAdmin) {
            const userGroups = Array.isArray(user.groups) ? [...user.groups] : [];
            const hasAdminGroup = userGroups.some((g) => {
                if (!g) return false;
                const gid = typeof g.groupId === "object" && g.groupId !== null && "_id" in g.groupId
                    ? (g.groupId as { _id?: unknown; name?: string }).name || String((g.groupId as { _id?: unknown })._id)
                    : String(g.groupId);
                const gName = (g as { name?: string; groupName?: string }).name || (g as { groupName?: string }).groupName;
                return gid === adminGroupName || gName === adminGroupName;
            });

            if (!hasAdminGroup) {
                const adminGroup = await Group.findOne({ name: adminGroupName });
                const adminGroupEntry = {
                    groupId: adminGroup ? adminGroup : adminGroupName,
                    role: "shift_manager" as const,
                    name: adminGroupName,
                    groupName: adminGroupName,
                    order: 0,
                };
                userObj.groups = [adminGroupEntry, ...userGroups];
            }
        }

        const finalGroups = Array.isArray(userObj.groups) ? [...userObj.groups] : [];
        userObj.groups = finalGroups.map((g: any) => {
            const gDoc = typeof g?.toObject === "function" ? g.toObject() : { ...g };
            const gid = gDoc?.groupId && typeof gDoc.groupId === "object" && "_id" in gDoc.groupId
                ? (gDoc.groupId as { _id?: unknown; name?: string }).name || String((gDoc.groupId as { _id?: unknown })._id)
                : String(gDoc?.groupId);
            const gName = gDoc?.name || gDoc?.groupName || (gDoc?.groupId && typeof gDoc.groupId === "object" ? gDoc.groupId.name : undefined);
            return {
                ...gDoc,
                isSystemGroup: gid === adminGroupName || gName === adminGroupName,
            };
        });

        userObj.isSuperAdmin = isSuperAdmin;
        userObj.isAdmin = isAdmin(userObj as unknown as AuthUser);

        res.json(userObj);
    } catch (error: unknown) {
        console.error("GetMe Error:", error);
        if (typeof next === "function") {
            next(error);
            return;
        }
        res.status(500).json({ message: "Internal server error", code: "INTERNAL_ERROR" });
    }
}

export default {
    getClient,
    resetClientCache,
    getSsoUrl,
    login,
    refreshToken,
    logout,
    getMe,
};

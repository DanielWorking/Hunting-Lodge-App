/**
 * @module AuthController
 * 
 * Handles user authentication via OpenID Connect (OIDC).
 * Integrates with an external SSO provider to manage user logins,
 * automatic user provisioning, and session identification.
 * Migrated to strict TypeScript with zero `any` and robust claim resolution.
 */

import https from "https";
import { Request, Response, NextFunction } from "express";
import { Issuer, BaseClient, TokenSet, custom } from "openid-client";
import User from "../models/User";
import Group from "../models/Group";
import config from "../config";
import ssoConfig from "../config/sso";
import { generateToken } from "../utils/jwt";
import { isSuperAdminUser } from "../utils/authHelpers";
import type { SsoLoginInput } from "../routes/auth";

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
 * Initializes or retrieves the cached OIDC client.
 * 
 * Performs dynamic discovery of the SSO issuer's configuration 
 * and instantiates a client with the project's credentials.
 * 
 * @returns The initialized OIDC client instance.
 * @throws If issuer discovery or client initialization fails.
 */
async function getClient(): Promise<BaseClient> {
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

        return client;
    } catch (discoveryError: unknown) {
        console.error(`❌ [SSO Error] Failed to connect to SSO server at ${ssoConfig.issuerUrl}:`, discoveryError);
        throw discoveryError;
    }
}

/**
 * Generates the authorization URL for the SSO provider.
 * The frontend uses this URL to redirect the user to the SSO login page.
 */
export async function getSsoUrl(_req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const ssoClient = await getClient();

        const url = ssoClient.authorizationUrl({
            scope: ssoConfig.scope,
        });

        res.json({ url });
    } catch (error: unknown) {
        console.error("Error generating SSO URL:", error);
        if (typeof next === "function") {
            next(error);
            return;
        }
        res.status(500).json({ message: "Failed to generate SSO URL" });
    }
}

export interface SsoLoginRequestBody {
    code?: string;
}

export interface SsoClaimsRecord {
    sub?: string;
    name?: string;
    preferred_username?: string;
    nickname?: string;
    email?: string;
    [key: string]: unknown;
}

/**
 * Completes the SSO authentication flow using an authorization code.
 * Exchanges the code for tokens, retrieves user claims, and manages 
 * user synchronization with the local database.
 */
export async function login(req: Request<unknown, unknown, SsoLoginInput>, res: Response, _next?: NextFunction): Promise<void> {
    try {
        const body = req.body || {};
        const code = typeof body.code === "string" ? body.code.trim() : "";
        if (!code) {
            res.status(400).json({ message: "Authorization code missing" });
            return;
        }

        const ssoClient = await getClient();

        const tokenSet: TokenSet = await ssoClient.callback(
            ssoConfig.redirectUri,
            { code },
            {},
        );

        // Extract user claims safely
        const claims = (tokenSet.claims() || {}) as SsoClaimsRecord;

        // Read configuration from SSO config module
        const identifierMode = ssoConfig.identifierField || "email";

        let dbUsername: string;
        let dbDisplayName: string;
        let dbEmail: string;
        let searchCriteria: Record<string, unknown>;

        // Extract raw string claims with safe fallbacks
        const rawName = typeof claims.name === "string" ? claims.name.trim() : "";
        const rawPrefUsername = typeof claims.preferred_username === "string" ? claims.preferred_username.trim() : "";
        const rawNickname = typeof claims.nickname === "string" ? claims.nickname.trim() : "";
        const rawSub = typeof claims.sub === "string" ? claims.sub.trim() : "";
        const rawEmail = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";

        // Full name display from SSO claims, with fallback to nickname, username, or sub
        dbDisplayName = rawName || rawPrefUsername || rawNickname || rawSub;
        dbEmail = rawEmail;

        if (identifierMode === "username") {
            // Production / Organizational mode (Card / Smartcard / AD SSO)
            dbUsername = rawPrefUsername || rawNickname || rawName || rawSub;
            if (!dbDisplayName) {
                dbDisplayName = dbUsername;
            }
            if (!dbEmail && dbUsername) {
                dbEmail = `${dbUsername.replace(/[^a-zA-Z0-9._-]/g, "")}@organization.local`.toLowerCase();
            }
            searchCriteria = { username: dbUsername };
        } else {
            // Development / Home mode (Auth0 / Google OAuth2)
            dbUsername = rawName || rawEmail || rawNickname || rawPrefUsername || rawSub;
            if (!dbDisplayName) {
                dbDisplayName = rawName || rawNickname || dbUsername;
            }
            if (!dbEmail && dbUsername) {
                dbEmail = `${dbUsername.replace(/[^a-zA-Z0-9._-]/g, "")}@organization.local`.toLowerCase();
            }
            searchCriteria = dbEmail ? { email: dbEmail } : { username: dbUsername };
        }

        if (!dbUsername) {
            res.status(401).json({
                message: "SSO Authentication failed",
                error: "Unable to extract user identity from SSO token claims",
            });
            return;
        }

        let user = await User.findOne(searchCriteria);

        const claimGroups = Array.isArray(claims.groups)
            ? (claims.groups as string[])
            : Array.isArray(claims.roles)
            ? (claims.roles as string[])
            : [];
        const isSuperAdminByClaim = claimGroups.includes(config.superAdmin.groupName) || claimGroups.includes("ADMINISTRATORS") || claimGroups.includes("admin");
        const isSuperAdmin = isSuperAdminByClaim || isSuperAdminUser({ username: dbUsername, email: dbEmail });

        if (user) {
            if (!user.isActive) {
                user.isActive = true;
            }
            if (dbDisplayName && (!user.displayName || user.displayName === user.username)) {
                user.displayName = dbDisplayName;
            }
            if (dbEmail && !user.email) {
                user.email = dbEmail;
            }
            user.lastLogin = new Date().toISOString();

            if (isSuperAdmin) {
                const adminGroup = await Group.findOne({ name: config.superAdmin.groupName });
                if (adminGroup) {
                    const hasAdminGroup = user.groups.some((g) => {
                        const gid = g.groupId && typeof g.groupId === "object" && "_id" in g.groupId
                            ? String((g.groupId as { _id?: unknown })._id)
                            : String(g.groupId);
                        return gid === adminGroup._id.toString();
                    });
                    if (!hasAdminGroup) {
                        user.groups.push({
                            groupId: adminGroup._id,
                            role: "shift_manager",
                            order: 0,
                        });
                        await Group.updateOne(
                            { _id: adminGroup._id },
                            { $addToSet: { members: user._id } }
                        );
                    }
                }
            }

            await user.save();
        } else {
            user = new User({
                username: dbUsername,
                displayName: dbDisplayName,
                email: dbEmail,
                isActive: true,
                groups: [],
                lastLogin: new Date().toISOString(),
            });

            if (isSuperAdmin) {
                const adminGroup = await Group.findOne({ name: config.superAdmin.groupName });
                if (adminGroup) {
                    user.groups.push({
                        groupId: adminGroup._id,
                        role: "shift_manager",
                        order: 0,
                    });
                    await Group.updateOne(
                        { _id: adminGroup._id },
                        { $addToSet: { members: user._id } }
                    );
                }
            }

            await user.save();
        }

        const token = generateToken(user);
        res.json({ user, token });
    } catch (error: unknown) {
        console.error("SSO Login Error:", error);
        res.status(401).json({
            message: "SSO Authentication failed",
            error: config.isProd
                ? "Invalid authorization code or provider error"
                : (error instanceof Error ? error.message : String(error)),
        });
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
            res.status(401).json({ message: "Not authenticated" });
            return;
        }

        const adminGroupName = config.superAdmin.groupName;
        const isSuperAdmin = isSuperAdminUser(user);

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

                const userWithToObject = user as unknown as { toObject?: () => Record<string, unknown> };
                const userObj: Record<string, unknown> = typeof userWithToObject.toObject === "function"
                    ? userWithToObject.toObject()
                    : { ...user };

                userObj.groups = [adminGroupEntry, ...userGroups];
                res.json(userObj);
                return;
            }
        }

        res.json(user);
    } catch (error: unknown) {
        console.error("GetMe Error:", error);
        if (typeof next === "function") {
            next(error);
            return;
        }
        res.status(500).json({ message: "Internal server error" });
    }
}

export default {
    getSsoUrl,
    login,
    getMe,
};

/**
 * @module Utils/SsoIdentity
 * 
 * Provides cryptographic and claim normalization logic for Single Sign-On identities.
 * Binds users to immutable { ssoIssuer, ssoSubject } pairs to prevent account collisions,
 * rogue account takeovers, and cross-provider impersonation.
 */

import User, { UserDocument } from "../models/User";
import Group from "../models/Group";
import config from "../config";
import ssoConfig from "../config/sso";
import { isSuperAdminUser } from "./authHelpers";
import type { SsoClaimsRecord } from "../types/auth";

export interface ResolvedIdentity {
    ssoIssuer: string;
    ssoSubject: string;
    email: string;
    username: string;
    displayName: string;
}

/**
 * Normalizes identity claims from an OpenID Connect TokenSet.
 *
 * The System ID (`username`) and the Name (`displayName`) both depend on SSO_IDENTIFIER_FIELD:
 * - email mode:    System ID = email → name → sub;              Name = username → nickname → System ID
 * - username mode: System ID = preferred_username → email → sub; Name = name → given_name → System ID
 *
 * @param claims - Raw claims dictionary from the IdP.
 * @param fallbackIssuer - Optional fallback issuer URL if iss claim is absent.
 * @param identifierField - "username" for username mode, anything else for email mode (defaults to SSO_IDENTIFIER_FIELD).
 * @returns Cleaned and trimmed ResolvedIdentity.
 */
export function normalizeClaims(
    claims: SsoClaimsRecord,
    fallbackIssuer?: string,
    identifierField: string = ssoConfig.identifierField,
): ResolvedIdentity {
    const ssoIssuer = (typeof claims.iss === "string" ? claims.iss : fallbackIssuer || ssoConfig.issuerUrl || "").trim();
    const ssoSubject = (typeof claims.sub === "string" ? claims.sub : "").trim();
    const rawEmail = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    const rawName = typeof claims.name === "string" ? claims.name.trim() : "";
    const rawPrefUsername = typeof claims.preferred_username === "string" ? claims.preferred_username.trim() : "";
    const rawNickname = typeof claims.nickname === "string" ? claims.nickname.trim() : "";
    const rawGivenName = typeof claims.given_name === "string" ? claims.given_name.trim() : "";
    const rawUsername = typeof claims.username === "string" ? claims.username.trim() : "";

    const isUsernameMode = identifierField === "username";
    const username = isUsernameMode
        ? rawPrefUsername || rawEmail || ssoSubject
        : rawEmail || rawName || ssoSubject;

    const email = rawEmail || (username ? `${username.replace(/[^a-zA-Z0-9._-]/g, "")}@organization.local`.toLowerCase() : "");
    const displayName = (isUsernameMode ? rawName || rawGivenName : rawUsername || rawNickname) || username;

    return { ssoIssuer, ssoSubject, email, username, displayName };
}

/**
 * Resolves an existing user or provisions a new user based on verified SSO claims.
 *
 * Identity binding protocol:
 * 1. Lookup: Match exact { ssoIssuer, ssoSubject }. Accounts are never matched by email or username.
 * 2. New provisioning: Create a new user with ssoIssuer, ssoSubject, and initial tokenVersion: 0.
 *
 * The Super Admin (matched by the SUPER_ADMIN_* settings) is added to the administrators group,
 * at first login and again whenever they are missing from it.
 *
 * @param claims - Claims dictionary from OIDC TokenSet.
 * @param fallbackIssuer - Issuer URL for the current OIDC provider.
 * @returns The hydrated UserDocument.
 */
export async function resolveOrProvisionUser(claims: SsoClaimsRecord, fallbackIssuer?: string): Promise<UserDocument> {
    const identity = normalizeClaims(claims, fallbackIssuer);
    const { ssoIssuer, ssoSubject, email, username, displayName } = identity;

    // Match on the immutable compound provider identity
    let user = (ssoIssuer && ssoSubject) ? await User.findOne({ ssoIssuer, ssoSubject }) : null;

    const isSuperAdmin = isSuperAdminUser({
        username: user ? user.username : username,
        email: user ? user.email : email,
    });

    if (user) {
        if (!user.isActive) {
            user.isActive = true;
        }
        if (displayName && (!user.displayName || user.displayName === user.username)) {
            user.displayName = displayName;
        }
        if (email && !user.email) {
            user.email = email;
        }
        user.lastLogin = new Date().toISOString();
    } else {
        user = new User({
            username,
            displayName,
            email,
            ...(ssoIssuer ? { ssoIssuer } : {}),
            ...(ssoSubject ? { ssoSubject } : {}),
            tokenVersion: 0,
            isActive: true,
            groups: [],
            lastLogin: new Date().toISOString(),
        });
    }

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

    try {
        await user.save();
    } catch (saveErr: unknown) {
        if ((saveErr as { code?: number })?.code === 11000 && ssoIssuer && ssoSubject) {
            const reFound = await User.findOne({ ssoIssuer, ssoSubject });
            if (reFound) {
                return reFound;
            }
        }
        throw saveErr;
    }
    return user;
}

export default {
    normalizeClaims,
    resolveOrProvisionUser,
};

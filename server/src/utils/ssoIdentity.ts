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
 * @param claims - Raw claims dictionary from the IdP.
 * @param fallbackIssuer - Optional fallback issuer URL if iss claim is absent.
 * @returns Cleaned and trimmed ResolvedIdentity.
 */
export function normalizeClaims(claims: SsoClaimsRecord, fallbackIssuer?: string): ResolvedIdentity {
    const ssoIssuer = (typeof claims.iss === "string" ? claims.iss : fallbackIssuer || ssoConfig.issuerUrl || "").trim();
    const ssoSubject = (typeof claims.sub === "string" ? claims.sub : "").trim();
    const rawEmail = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
    const rawName = typeof claims.name === "string" ? claims.name.trim() : "";
    const rawPrefUsername = typeof claims.preferred_username === "string" ? claims.preferred_username.trim() : "";
    const rawNickname = typeof claims.nickname === "string" ? claims.nickname.trim() : "";

    const identifierMode = ssoConfig.identifierField || "email";
    let username = "";
    if (identifierMode === "username") {
        username = rawPrefUsername || rawNickname || ssoSubject;
    } else {
        username = rawPrefUsername || rawEmail || rawNickname || ssoSubject;
    }

    const email = rawEmail || (username ? `${username.replace(/[^a-zA-Z0-9._-]/g, "")}@organization.local`.toLowerCase() : "");
    const displayName = rawName || rawPrefUsername || rawNickname || username || ssoSubject;

    return { ssoIssuer, ssoSubject, email, username, displayName };
}

/**
 * Resolves an existing user or provisions a new user based on verified SSO claims.
 *
 * Identity binding protocol:
 * 1. Primary lookup: Match exact { ssoIssuer, ssoSubject }.
 * 2. Legacy account linking: If no ssoIssuer/ssoSubject match is found, link unlinked
 *    existing accounts matching verified email or username, immutably storing their ssoIssuer and ssoSubject.
 * 3. New provisioning: Create a new user with ssoIssuer, ssoSubject, and initial tokenVersion: 0.
 *
 * @param claims - Claims dictionary from OIDC TokenSet.
 * @param fallbackIssuer - Issuer URL for the current OIDC provider.
 * @returns The hydrated UserDocument.
 */
export async function resolveOrProvisionUser(claims: SsoClaimsRecord, fallbackIssuer?: string): Promise<UserDocument> {
    const identity = normalizeClaims(claims, fallbackIssuer);
    const { ssoIssuer, ssoSubject, email, username, displayName } = identity;

    // 1. Primary match on immutable compound provider identity
    let user = (ssoIssuer && ssoSubject) ? await User.findOne({ ssoIssuer, ssoSubject }) : null;

    // 2. Legacy link: match unlinked user by verified email
    if (!user && email) {
        const existingByEmail = await User.findOne({ email });
        if (existingByEmail && !existingByEmail.ssoIssuer && ssoIssuer && ssoSubject) {
            existingByEmail.ssoIssuer = ssoIssuer;
            existingByEmail.ssoSubject = ssoSubject;
            user = existingByEmail;
        }
    }

    // 3. Legacy link: match unlinked user by username
    if (!user && username) {
        const existingByUsername = await User.findOne({ username });
        if (existingByUsername && !existingByUsername.ssoIssuer && ssoIssuer && ssoSubject) {
            existingByUsername.ssoIssuer = ssoIssuer;
            existingByUsername.ssoSubject = ssoSubject;
            user = existingByUsername;
        }
    }

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

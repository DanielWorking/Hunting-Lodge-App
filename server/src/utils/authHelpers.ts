import mongoose from "mongoose";
import config from "../config";

/**
 * Common shape for Mongoose Group documents.
 */
export interface IGroupDocument {
    readonly _id: mongoose.Types.ObjectId | string;
    readonly name?: string;
    readonly members?: ReadonlyArray<mongoose.Types.ObjectId | string>;
    readonly siteTags?: ReadonlyArray<string>;
    readonly save?: (options?: unknown) => Promise<unknown>;
    readonly [key: string]: unknown;
}

// Minimal Model interface for Group database operations
const Group: mongoose.Model<IGroupDocument> = require("../models/Group");

/**
 * Group document or compatible object shape.
 */
export interface ResolvedGroup {
    readonly _id: mongoose.Types.ObjectId | string;
    readonly name?: string;
    readonly save?: (options?: unknown) => Promise<unknown>;
    readonly [key: string]: unknown;
}

/**
 * Structure representing group membership entry on a User entity.
 */
export interface AuthUserGroup {
    readonly groupId?: { readonly _id?: mongoose.Types.ObjectId | string; readonly name?: string } | mongoose.Types.ObjectId | string | null;
    readonly name?: string;
    readonly groupName?: string;
    readonly role?: string;
    readonly order?: number;
}

/**
 * Minimal user interface required for authentication and authorization checks.
 */
export interface AuthUser {
    readonly _id?: mongoose.Types.ObjectId | string | null;
    readonly username?: string | null;
    readonly email?: string | null;
    readonly groups?: ReadonlyArray<AuthUserGroup | null | undefined> | null;
    readonly isActive?: boolean;
}

function isMongooseDocumentInstance(val: unknown): val is ResolvedGroup {
    if (val instanceof mongoose.Document) {
        return true;
    }
    if (isPlainObject(val) && "_id" in val && "save" in val) {
        return val._id != null && typeof val.save === "function";
    }
    return false;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
    return typeof val === "object" && val !== null;
}

async function resolveFromPlainObject<T extends ResolvedGroup = ResolvedGroup>(
    obj: Record<string, unknown>,
): Promise<T | null> {
    const rawIdVal = obj._id;
    if (typeof rawIdVal === "string" || rawIdVal instanceof mongoose.Types.ObjectId) {
        const rawId = rawIdVal.toString().trim();
        if (mongoose.Types.ObjectId.isValid(rawId)) {
            const byId = await Group.findById(rawId);
            if (byId) {
                return byId as unknown as T;
            }
        }
    }
    return null;
}

const groupCache = new Map<string, { group: ResolvedGroup; expiresAt: number }>();
const CACHE_TTL_MS = 5000;

export function invalidateGroupCache(groupId?: string): void {
    if (groupId) {
        groupCache.delete(groupId.toString());
    } else {
        groupCache.clear();
    }
}

async function resolveFromIdentifier<T extends ResolvedGroup = ResolvedGroup>(
    groupId: unknown,
): Promise<T | null> {
    const strId = typeof groupId === "string" ? groupId.trim() : String(groupId);
    if (!strId || strId === "[object Object]") {
        return null;
    }

    const isTestEnv = process.env.NODE_ENV === "test";
    if (!isTestEnv) {
        const cached = groupCache.get(strId);
        if (cached && Date.now() < cached.expiresAt) {
            return cached.group as unknown as T;
        }
    }

    let result: any = null;
    if (mongoose.Types.ObjectId.isValid(strId)) {
        const byId = await Group.findById(strId);
        if (byId) {
            result = byId;
        }
    }

    if (!result) {
        const byName = await Group.findOne({ name: strId });
        if (byName) {
            result = byName;
        }
    }

    if (result && !isTestEnv) {
        groupCache.set(strId, { group: result, expiresAt: Date.now() + CACHE_TTL_MS });
        if (result._id) {
            groupCache.set(result._id.toString(), { group: result, expiresAt: Date.now() + CACHE_TTL_MS });
        }
        if (result.name) {
            groupCache.set(result.name, { group: result, expiresAt: Date.now() + CACHE_TTL_MS });
        }
    }

    return (result as unknown as T) ?? null;
}

/**
 * Resolves a group from a given string, ObjectId, or document identifier.
 * Matches by MongoDB _id or group name.
 *
 * @template T - Extends ResolvedGroup, defaults to ResolvedGroup.
 * @param groupId - Group identifier or document.
 * @returns The Group document or null.
 */
export async function resolveGroup<T extends ResolvedGroup = ResolvedGroup>(
    groupId: unknown,
): Promise<T | null> {
    if (!groupId) {
        return null;
    }

    if (isMongooseDocumentInstance(groupId)) {
        return groupId as unknown as T;
    }

    if (isPlainObject(groupId) && !(groupId instanceof mongoose.Types.ObjectId)) {
        return resolveFromPlainObject<T>(groupId);
    }

    return resolveFromIdentifier<T>(groupId);
}

function extractGroupId(group: AuthUserGroup | null | undefined): string | undefined {
    if (!group || !group.groupId) {
        return undefined;
    }
    if (typeof group.groupId === "object" && "_id" in group.groupId && group.groupId._id != null) {
        return group.groupId._id.toString();
    }
    return group.groupId.toString();
}

function extractGroupName(group: AuthUserGroup | null | undefined): string | undefined {
    if (!group) {
        return undefined;
    }
    if (
        typeof group.groupId === "object" &&
        group.groupId != null &&
        "name" in group.groupId &&
        typeof group.groupId.name === "string"
    ) {
        return group.groupId.name;
    }
    return group.name || group.groupName;
}

/**
 * Checks if a user is the primary system Super Admin account.
 * Used specifically for preventing deletion/deactivation of the root admin.
 *
 * @param user - User document or object.
 * @returns True if user is the primary Super Admin account.
 */
export function isSuperAdminUser(user: AuthUser | null | undefined): boolean {
    if (!user) {
        return false;
    }

    const matchId = Boolean(config.superAdmin.id && user.username === config.superAdmin.id);
    const matchUsername = Boolean(config.superAdmin.username && user.username === config.superAdmin.username);
    const matchEmail = Boolean(config.superAdmin.email && user.email === config.superAdmin.email);

    return Boolean(matchId || matchUsername || matchEmail);
}

/**
 * Checks if a user has administrative privileges.
 * A user is an Admin if they are the primary Super Admin account OR
 * belong to the designated SUPER_ADMIN_GROUP_NAME group.
 *
 * @param user - User document or object.
 * @returns True if user has administrative privileges.
 */
export function isAdmin(user: AuthUser | null | undefined): boolean {
    if (!user) {
        return false;
    }
    if (isSuperAdminUser(user)) {
        return true;
    }

    const adminGroupName = config.superAdmin.groupName;
    const userGroups = Array.isArray(user.groups) ? user.groups : [];

    return userGroups.some((g) => {
        if (!g) {
            return false;
        }
        const gid = extractGroupId(g);
        const gName = extractGroupName(g);
        return gid === adminGroupName || gName === adminGroupName;
    });
}

/**
 * Checks if a user is explicitly a member of a specific group.
 * Strict check: All users (including Admins) must be explicitly assigned to the group.
 *
 * @param user - User document or object.
 * @param groupId - Group identifier.
 * @returns True if user is an explicit member of the group.
 */
export async function isGroupMember(
    user: AuthUser | null | undefined,
    groupId: unknown,
): Promise<boolean> {
    if (!user || !groupId) {
        return false;
    }

    const group = await resolveGroup(groupId);
    if (!group) {
        return false;
    }

    const targetGroupId = group._id.toString();
    const groupName = group.name;
    const userGroups = Array.isArray(user.groups) ? user.groups : [];

    return userGroups.some((g) => {
        if (!g) {
            return false;
        }
        const gid = extractGroupId(g);
        const gName = extractGroupName(g);
        return gid === targetGroupId || (groupName != null && (gid === groupName || gName === groupName));
    });
}

/**
 * Checks if a user is explicitly a Shift Manager of a specific group.
 * Strict check: All users (including Admins) must be explicitly assigned role === 'shift_manager' in that group.
 *
 * @param user - User document or object.
 * @param groupId - Group identifier.
 * @returns True if user is an explicit shift manager of that group.
 */
export async function isShiftManager(
    user: AuthUser | null | undefined,
    groupId: unknown,
): Promise<boolean> {
    if (!user || !groupId) {
        return false;
    }

    const group = await resolveGroup(groupId);
    if (!group) {
        return false;
    }

    const targetGroupId = group._id.toString();
    const groupName = group.name;
    const userGroups = Array.isArray(user.groups) ? user.groups : [];

    return userGroups.some((g) => {
        if (!g || g.role !== "shift_manager") {
            return false;
        }
        const gid = extractGroupId(g);
        const gName = extractGroupName(g);
        return gid === targetGroupId || (groupName != null && (gid === groupName || gName === groupName));
    });
}

/**
 * Checks if the requesting user is an active Shift Manager in any group
 * to which the target user belongs.
 * Enforces operational group tenancy: only a Shift Manager of the target user's
 * specific group can manage group-scoped properties (such as vacation balance).
 *
 * @param requestingUser - User document or object of the requester.
 * @param targetUser - User document or object of the target.
 * @returns True if requester is a shift_manager in at least one shared group.
 */
export function isShiftManagerForTargetUser(
    requestingUser: AuthUser | null | undefined,
    targetUser: AuthUser | null | undefined,
): boolean {
    if (!requestingUser || !targetUser) {
        return false;
    }

    const requesterGroups = Array.isArray(requestingUser.groups) ? requestingUser.groups : [];
    const requesterManagedGroupIds = requesterGroups
        .filter((g): g is AuthUserGroup => Boolean(g && g.role === "shift_manager"))
        .map(extractGroupId)
        .filter((id): id is string => Boolean(id));

    if (requesterManagedGroupIds.length === 0) {
        return false;
    }

    const targetGroups = Array.isArray(targetUser.groups) ? targetUser.groups : [];
    const targetGroupIds = new Set(
        targetGroups
            .filter((g): g is AuthUserGroup => Boolean(g))
            .map(extractGroupId)
            .filter((id): id is string => Boolean(id)),
    );

    if (targetGroupIds.size === 0) {
        return false;
    }

    return requesterManagedGroupIds.some((managedId) => targetGroupIds.has(managedId));
}

export default {
    resolveGroup,
    invalidateGroupCache,
    isSuperAdminUser,
    isAdmin,
    isGroupMember,
    isShiftManager,
    isShiftManagerForTargetUser,
};


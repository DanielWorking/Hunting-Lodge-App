/**
 * @module UsersController
 * 
 * Handlers for user management, including authentication,
 * profile updates, group synchronization, and administrative controls.
 */

import { Request, Response, NextFunction } from "express";
import mongoose, { Types } from "mongoose";
import type { ClientSession } from "mongoose";
import User, { IUser, toPublicUser } from "../models/User";
import Group, { ITimeSlot } from "../models/Group";
import Site from "../models/Site";
import { removeFromGroupSchedules } from "../services/membershipCleanup";
import {
    isAdmin,
    isSuperAdminUser,
    resolveGroup,
    isGroupMember,
    isShiftManager,
    isShiftManagerForTargetUser,
    AuthUser,
} from "../utils/authHelpers";
import { invalidateUserCache } from "../middleware/authMiddleware";
import { extractMongooseFieldErrors } from "../middleware/errorMiddleware";

function extractParamId(param: string | string[] | undefined): string {
    if (!param) return "";
    return Array.isArray(param) ? param[0] : param;
}

export interface ReorderUpdateItem {
    userId: string;
    order: number;
}

export interface ReorderUsersRequestBody {
    groupId?: string;
    updates?: ReorderUpdateItem[];
}

export interface UpdateUserRequestBody {
    email?: string;
    isActive?: boolean;
    groups?: IUser["groups"];
    favoritePhones?: string[];
    [key: string]: unknown;
}

export interface ManagerUpdateRequestBody {
    isActive?: boolean;
    vacationBalance?: number;
    [key: string]: unknown;
}

export interface GetUsersRequestQuery {
    groupId?: string;
}

/** Contact and activity fields only Administrators may see for other users. */
const ADMIN_ONLY_USER_FIELDS = new Set(["email", "lastLogin"]);

/**
 * Returns the response-safe view of `target` for `requester`: internal SSO/session fields are
 * always removed, `vacationBalance` is kept only for a Shift Manager of one of the target's groups
 * (not for the user themself, unless they manage a group they belong to), and email/lastLogin only
 * for the user themself or an Administrator.
 */
function toVisibleUser(target: unknown, requester: AuthUser | undefined): Record<string, unknown> {
    const targetUser = target as AuthUser;
    const isSelf = Boolean(requester?._id && targetUser?._id && String(requester._id) === String(targetUser._id));
    const canSeeBalance = isShiftManagerForTargetUser(requester, targetUser);
    const canSeeContactDetails = isSelf || isAdmin(requester);
    return Object.fromEntries(
        Object.entries(toPublicUser(target)).filter(([field]) => {
            if (field === "vacationBalance") return canSeeBalance;
            if (ADMIN_ONLY_USER_FIELDS.has(field)) return canSeeContactDetails;
            return true;
        }),
    );
}

/** Awaits a query as a plain object (`lean`) when the query supports it. */
async function leanResult<T>(query: unknown): Promise<T | null> {
    const leanable = query as { lean?: () => unknown } | null;
    return (await (typeof leanable?.lean === "function" ? leanable.lean() : query)) as T | null;
}

/** Ids of the groups in a user's `groups` memberships (populated or not). */
function groupIdsOf(user: unknown): string[] {
    const memberships = (user as { groups?: Array<{ groupId?: unknown }> } | null)?.groups;
    return (Array.isArray(memberships) ? memberships : [])
        .map((membership) => {
            const gid = membership?.groupId;
            if (gid && typeof gid === "object" && "_id" in gid) {
                return (gid as { _id?: unknown })._id?.toString();
            }
            return gid?.toString();
        })
        .filter((id): id is string => Boolean(id));
}

async function timeSlotsOf(groupId: string): Promise<ITimeSlot[] | undefined> {
    const group = await resolveGroup(groupId);
    return (group?.settings as { timeSlots?: ITimeSlot[] } | undefined)?.timeSlots;
}

/**
 * Applies an Administrator's user update that sets `groups`, inside `session`'s transaction:
 * the user write, the Group.members sync, and for each group the user leaves, the removal of their
 * shifts from today onwards with the refund of the vacation charged for them.
 *
 * @returns The updated user (with the refunded balance), or null when the user does not exist.
 */
async function updateUserAndMemberships(
    targetUserId: string,
    updateOperation: Record<string, unknown>,
    session: ClientSession,
): Promise<AuthUser | null> {
    // Read inside the transaction, so the groups left are exactly what this write changes
    const before = await leanResult<AuthUser>(User.findById(targetUserId, null, { session }));
    const updated = await leanResult<AuthUser>(User.findByIdAndUpdate(
        targetUserId,
        updateOperation,
        { returnDocument: "after", runValidators: true, session },
    ));
    if (!before || !updated) {
        return null;
    }

    const oldGroupIds = groupIdsOf(before);
    const newGroupIds = groupIdsOf(updated);
    const groupsToRemove = oldGroupIds.filter((id) => !newGroupIds.includes(id));
    const groupsToAdd = newGroupIds.filter((id) => !oldGroupIds.includes(id));

    // Sequential on purpose: operations of one transaction must not run concurrently on its session
    if (groupsToRemove.length > 0) {
        await Group.updateMany({ _id: { $in: groupsToRemove } }, { $pull: { members: updated._id } }, { session });
    }
    if (groupsToAdd.length > 0) {
        await Group.updateMany({ _id: { $in: groupsToAdd } }, { $addToSet: { members: updated._id } }, { session });
    }

    let refund = 0;
    for (const groupId of groupsToRemove) {
        refund += (await removeFromGroupSchedules(targetUserId, groupId, await timeSlotsOf(groupId), session)).refund;
    }
    if (refund === 0) {
        return updated;
    }
    return leanResult<AuthUser>(User.findByIdAndUpdate(
        targetUserId,
        { $inc: { vacationBalance: refund } },
        { returnDocument: "after", session },
    ));
}

/**
 * Shapes a user for directory listings as seen by `requester`, with role flags added.
 */
function toDirectoryEntry(user: AuthUser, requester: AuthUser | undefined): Record<string, unknown> {
    return {
        ...toVisibleUser(user, requester),
        isSuperAdmin: isSuperAdminUser(user),
        isAdmin: isAdmin(user),
    };
}

/**
 * Retrieves users from the system.
 * 
 * - If `groupId` is provided in query params:
 *   Resolves the group and ensures the requester is an authorized member or an Administrator.
 *   Returns ONLY users who are members of that group.
 * - If `groupId` is omitted:
 *   Returns the full user directory across all groups. Strictly restricted to Administrators.
 */
export async function getUsers(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const query = (req.query || {}) as GetUsersRequestQuery;
        const rawGroupId = typeof query.groupId === "string" ? query.groupId.trim() : undefined;
        const groupId = rawGroupId && rawGroupId.length > 0 ? rawGroupId : undefined;
        const requestingUser = req.user as AuthUser | undefined;

        // Group-scoped user query
        if (groupId) {
            const group = await resolveGroup(groupId);
            if (!group) {
                res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
                return;
            }

            // Authorization: If not an administrator, requester must be a member of the requested group
            if (!isAdmin(requestingUser)) {
                const isMember = await isGroupMember(requestingUser, groupId);
                if (!isMember) {
                    res.status(403).json({
                        message: "Forbidden: You are not a member of this group.",
                        code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
                    });
                    return;
                }
            }

            const usersQuery = User.find({
                "groups.groupId": group._id,
            });
            const users = await (typeof (usersQuery as any).lean === "function"
                ? (usersQuery as any).lean()
                : usersQuery);
            const userDocs = Array.isArray(users) ? users : [];
            res.json(userDocs.map((u: AuthUser) => toDirectoryEntry(u, requestingUser)));
            return;
        }

        // Full directory fetch (no groupId provided)
        // Strictly restricted to Administrators
        if (!isAdmin(requestingUser)) {
            res.status(403).json({
                message: "Forbidden: Administrator privileges required for full user directory.",
                code: "FORBIDDEN_ADMIN_REQUIRED",
            });
            return;
        }

        const usersQuery = User.find();
        const users = await (typeof (usersQuery as any).lean === "function"
            ? (usersQuery as any).lean()
            : usersQuery);
        const userDocs = Array.isArray(users) ? users : [];
        res.json(userDocs.map((u: AuthUser) => toDirectoryEntry(u, requestingUser)));
    } catch (err: unknown) {
        console.error("Get users error:", err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: "Failed to retrieve users", code: "INTERNAL_ERROR" });
    }
}

export async function reorderUsers(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = (req.body || {}) as ReorderUsersRequestBody;
        const { groupId, updates } = body;
        if (!groupId || typeof groupId !== "string" || !updates || !Array.isArray(updates) || updates.length === 0 || updates.length > 200) {
            res.status(400).json({ message: "Invalid payload: groupId and updates array (max 200 items) are required", code: "VALIDATION_ERROR" });
            return;
        }

        // Validate structure and prevent NoSQL injection by ensuring userId is a valid ObjectId string
        const hasInvalidItem = updates.some(
            (u: unknown) => {
                if (!u || typeof u !== "object") return true;
                const item = u as Record<string, unknown>;
                return (
                    typeof item.userId !== "string" ||
                    !Types.ObjectId.isValid(item.userId.trim()) ||
                    typeof item.order !== "number"
                );
            }
        );
        if (hasInvalidItem) {
            res.status(400).json({ message: "Invalid update item format: userId must be a valid ID and order must be numeric", code: "VALIDATION_ERROR" });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
            return;
        }

        const requestingUser = req.user as AuthUser | undefined;
        const isAuthorized = isAdmin(requestingUser) || (await isShiftManager(requestingUser, group._id));
        if (!isAuthorized) {
            res.status(403).json({
                message: "Forbidden: Administrator or Shift Manager permissions required for this group.",
                code: "FORBIDDEN_MANAGER_REQUIRED",
            });
            return;
        }

        const bulkOps = updates.map((update) => {
            const sanitizedUserId = update.userId.trim();
            return {
                updateOne: {
                    filter: { _id: sanitizedUserId, "groups.groupId": group._id },
                    update: { $set: { "groups.$.order": update.order } },
                },
            };
        });

        if (typeof (User as any).bulkWrite === "function") {
            await User.bulkWrite(bulkOps, { ordered: false });
        } else {
            await Promise.all(
                bulkOps.map((op) => User.updateOne(op.updateOne.filter, op.updateOne.update))
            );
        }

        res.json({ message: "Order updated" });
    } catch (err: unknown) {
        console.error("Reorder users error:", err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: "Failed to update user ordering", code: "INTERNAL_ERROR" });
    }
}

export async function updateUser(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const targetUserId = extractParamId(req.params.id);
        const requestingUser = req.user as AuthUser | undefined;

        // 1. Authorization check: Restricted to Administrators
        if (!isAdmin(requestingUser)) {
            res.status(403).json({
                message: "Forbidden: Only Administrators can modify user accounts and profiles.",
                code: "FORBIDDEN_ADMIN_REQUIRED",
            });
            return;
        }

        // 2. Fetch target user
        const oldUserQuery = User.findById(targetUserId);
        const oldUser = await (typeof (oldUserQuery as any).lean === "function"
            ? (oldUserQuery as any).lean()
            : oldUserQuery);
        if (!oldUser) {
            res.status(404).json({ message: "User not found", code: "NOT_FOUND" });
            return;
        }

        const body = (req.body || {}) as UpdateUserRequestBody;

        // System protection: Permanently prevent deactivating the root Super Admin account
        if (isSuperAdminUser(oldUser) && body.isActive === false) {
            res.status(403).json({
                message: "System Security: The root Super Admin account cannot be deactivated.",
                code: "FORBIDDEN_SUPER_ADMIN_PROTECTED",
            });
            return;
        }

        // 3. Whitelist allowed update fields (displayName and vacationBalance are strictly excluded from DB updates)
        const { email, isActive, groups, favoritePhones } = body;
        const updateFields: Record<string, unknown> = {};
        if (email !== undefined) updateFields.email = typeof email === "string" ? email.trim().toLowerCase() : email;
        if (isActive !== undefined) updateFields.isActive = Boolean(isActive);
        if (groups !== undefined && Array.isArray(groups)) updateFields.groups = groups;
        if (favoritePhones !== undefined && Array.isArray(favoritePhones)) updateFields.favoritePhones = favoritePhones;

        // 4. Update user with schema validators
        const updateOperation: Record<string, unknown> = { $set: updateFields };
        if (isActive === false) {
            updateOperation.$inc = { tokenVersion: 1 };
        }

        // 5. A membership change is one transaction: the user, Group.members, and for every group
        // the user leaves, their shifts from today onwards, the refund and the report attendees
        const updatedUser = Array.isArray(body.groups)
            ? await User.db.transaction((session: ClientSession) =>
                updateUserAndMemberships(targetUserId, updateOperation, session))
            : await leanResult<AuthUser>(User.findByIdAndUpdate(
                targetUserId,
                updateOperation,
                { returnDocument: "after", runValidators: true },
            ));
        if (!updatedUser) {
            res.status(404).json({ message: "User not found", code: "NOT_FOUND" });
            return;
        }

        invalidateUserCache(targetUserId);
        res.json(toVisibleUser(updatedUser, requestingUser));
    } catch (err: unknown) {
        console.error("Update user error:", err);

        // Unmask Mongoose Schema Validation errors
        if (
            err instanceof mongoose.Error.ValidationError ||
            (typeof err === "object" && err !== null && (err as { name?: string }).name === "ValidationError")
        ) {
            // Same `{ field, message }` shape as the Zod middleware and the global error handler
            const validationErrors = extractMongooseFieldErrors(err);

            res.status(400).json({
                message: (err as Error).message || "Validation failed",
                code: "VALIDATION_ERROR",
                errors: validationErrors.length > 0 ? validationErrors : undefined,
            });
            return;
        }

        // Unmask Mongoose Invalid ObjectId Cast Error
        if (
            err instanceof mongoose.Error.CastError ||
            (typeof err === "object" && err !== null && (err as { name?: string }).name === "CastError")
        ) {
            const castErr = err as mongoose.Error.CastError;
            if (castErr.path && castErr.value !== undefined) {
                res.status(400).json({
                    message: `Invalid format for field '${castErr.path}'`,
                    code: "INVALID_IDENTIFIER",
                });
                return;
            }
            res.status(400).json({
                message: "Invalid user update request",
                code: "INVALID_IDENTIFIER",
            });
            return;
        }

        if (typeof next === "function") {
            next(err);
            return;
        }

        res.status(400).json({
            message: err instanceof Error ? err.message : "Invalid user update request",
            code: "BAD_REQUEST",
        });
    }
}

export async function deleteUser(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const requestingUser = req.user as AuthUser | undefined;
        if (!isAdmin(requestingUser)) {
            res.status(403).json({
                message: "Forbidden: Administrator privileges required to delete users.",
                code: "FORBIDDEN_ADMIN_REQUIRED",
            });
            return;
        }

        const paramId = extractParamId(req.params.id);

        // Prevent self-deletion by administrators
        const requestingUserId = requestingUser?._id?.toString();
        if (requestingUserId && paramId && requestingUserId === paramId) {
            res.status(403).json({
                message: "Forbidden: Administrators cannot delete their own accounts.",
                code: "FORBIDDEN_SELF_DELETION",
            });
            return;
        }

        const targetUserId = paramId;
        const userToDeleteQuery = User.findById(targetUserId);
        const userToDelete = await (typeof (userToDeleteQuery as any).lean === "function"
            ? (userToDeleteQuery as any).lean()
            : userToDeleteQuery);
        if (!userToDelete) {
            res.status(404).json({ message: "User not found", code: "NOT_FOUND" });
            return;
        }

        // System protection: Permanently prevent deletion of the root Super Admin account
        if (isSuperAdminUser(userToDelete)) {
            res.status(403).json({
                message: "System Security: The root Super Admin account cannot be deleted.",
                code: "FORBIDDEN_SUPER_ADMIN_PROTECTED",
            });
            return;
        }

        // One transaction: the account, its group memberships and favorites, and in every group it
        // belonged to, its shifts from today onwards (no refund: the account no longer exists)
        await User.db.transaction(async (session: ClientSession) => {
            await User.findByIdAndDelete(targetUserId, { session });
            await Group.updateMany(
                { members: targetUserId },
                { $pull: { members: targetUserId } },
                { session },
            );
            await Site.updateMany(
                { favoritedBy: targetUserId },
                { $pull: { favoritedBy: targetUserId } },
                { session },
            );
            for (const groupId of groupIdsOf(userToDelete)) {
                await removeFromGroupSchedules(targetUserId, groupId, await timeSlotsOf(groupId), session);
            }
        });
        invalidateUserCache(targetUserId);

        res.json({ message: "User deleted" });
    } catch (err: unknown) {
        console.error("Delete user error:", err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: "Failed to delete user", code: "INTERNAL_ERROR" });
    }
}

export async function managerUpdate(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const targetUserId = extractParamId(req.params.id);
        const body = (req.body || {}) as ManagerUpdateRequestBody;
        const { isActive, vacationBalance } = body;
        const requestingUser = req.user as AuthUser | undefined;

        // 1. Fetch the target user being modified
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            res.status(404).json({ message: "User not found", code: "NOT_FOUND" });
            return;
        }

        // System protection: Permanently prevent deactivating the root Super Admin account
        if (isSuperAdminUser(targetUser) && isActive === false) {
            res.status(403).json({
                message: "System Security: The root Super Admin account cannot be deactivated.",
                code: "FORBIDDEN_SUPER_ADMIN_PROTECTED",
            });
            return;
        }

        const isModifyingVacation = vacationBalance !== undefined;
        const isModifyingActive = isActive !== undefined;

        // 2. Perform Group Tenancy & Role Authorization Checks
        // Security Constraint: ONLY a Shift Manager of the target user's same operational group can alter vacation days.
        if (isModifyingVacation) {
            const hasShiftManagerTenancy = isShiftManagerForTargetUser(requestingUser, targetUser);
            if (!hasShiftManagerTenancy) {
                res.status(403).json({
                    message: "Forbidden: Only a Shift Manager of this user's group can modify vacation balance.",
                    code: "FORBIDDEN_MANAGER_REQUIRED",
                });
                return;
            }
        }

        // Status (isActive) changes can be performed by Admins or group Shift Managers
        if (isModifyingActive && !isModifyingVacation) {
            const isAuthorizedForStatus = isAdmin(requestingUser) || isShiftManagerForTargetUser(requestingUser, targetUser);
            if (!isAuthorizedForStatus) {
                res.status(403).json({
                    message: "Forbidden: Administrator or group Shift Manager permissions required.",
                    code: "FORBIDDEN_MANAGER_REQUIRED",
                });
                return;
            }
        }

        if (!isModifyingVacation && !isModifyingActive) {
            const isAuthorized = isAdmin(requestingUser) || isShiftManagerForTargetUser(requestingUser, targetUser);
            if (!isAuthorized) {
                res.status(403).json({
                    message: "Forbidden: Administrator or group Shift Manager permissions required.",
                    code: "FORBIDDEN_MANAGER_REQUIRED",
                });
                return;
            }
        }

        // 3. Apply updates (displayName is strictly omitted to preserve SSO immutability)
        if (isModifyingActive) {
            targetUser.isActive = Boolean(isActive);
            if (targetUser.isActive === false) {
                targetUser.tokenVersion = (targetUser.tokenVersion || 0) + 1;
            }
        }

        if (isModifyingVacation) {
            const numVacation = Number(vacationBalance);
            if (isNaN(numVacation) || numVacation < 0) {
                res.status(400).json({ message: "Vacation balance must be a non-negative number", code: "VALIDATION_ERROR" });
                return;
            }
            targetUser.vacationBalance = numVacation;
        }

        const updatedUser = await targetUser.save();
        invalidateUserCache(targetUserId);
        res.json(toVisibleUser(updatedUser, requestingUser));
    } catch (err: unknown) {
        console.error("Manager Update Error:", err);

        // Unmask Mongoose Schema Validation errors
        if (
            err instanceof mongoose.Error.ValidationError ||
            (typeof err === "object" && err !== null && (err as { name?: string }).name === "ValidationError")
        ) {
            // Same `{ field, message }` shape as the Zod middleware and the global error handler
            const validationErrors = extractMongooseFieldErrors(err);

            res.status(400).json({
                message: (err as Error).message || "Validation failed",
                code: "VALIDATION_ERROR",
                errors: validationErrors.length > 0 ? validationErrors : undefined,
            });
            return;
        }

        // Unmask Mongoose Invalid ObjectId Cast Error
        if (
            err instanceof mongoose.Error.CastError ||
            (typeof err === "object" && err !== null && (err as { name?: string }).name === "CastError")
        ) {
            const castErr = err as mongoose.Error.CastError;
            if (castErr.path && castErr.value !== undefined) {
                res.status(400).json({
                    message: `Invalid format for field '${castErr.path}'`,
                    code: "INVALID_IDENTIFIER",
                });
                return;
            }
            res.status(400).json({
                message: "Invalid user update request",
                code: "INVALID_IDENTIFIER",
            });
            return;
        }

        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: "Failed to update user settings", code: "INTERNAL_ERROR" });
    }
}

/**
 * Acknowledges the "What's New" feature modal for the user.
 * Persists hasSeenWhatsNew = true to MongoDB and invalidates the in-memory session cache.
 */
export async function acknowledgeWhatsNew(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const authUser = req.user as AuthUser | undefined;
        if (!authUser || !authUser._id) {
            res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED" });
            return;
        }

        const targetUserId = extractParamId(req.params.id);

        // Enforce RBAC: Caller can only acknowledge for themselves unless Admin
        if (targetUserId !== authUser._id.toString() && !isAdmin(authUser)) {
            res.status(403).json({
                message: "Forbidden: Cannot acknowledge for another user",
                code: "FORBIDDEN",
            });
            return;
        }

        const updatedUser = await User.findByIdAndUpdate(
            targetUserId,
            { $set: { hasSeenWhatsNew: true } },
            { returnDocument: "after" }
        );

        if (!updatedUser) {
            res.status(404).json({ message: "User not found", code: "NOT_FOUND" });
            return;
        }

        invalidateUserCache(targetUserId);

        res.json({
            message: "What's new acknowledged",
            hasSeenWhatsNew: true,
            // An Administrator may acknowledge for someone else: apply the same visibility rules
            user: toVisibleUser(updatedUser, authUser),
        });
    } catch (err: unknown) {
        console.error("Acknowledge What's New error:", err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: "Failed to acknowledge What's New", code: "INTERNAL_ERROR" });
    }
}

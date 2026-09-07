/**
 * @module UsersController
 * 
 * Handlers for user management, including authentication,
 * profile updates, group synchronization, and administrative controls.
 * Migrated to strict TypeScript with strict RBAC enforcement and zero `any`.
 */

import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import User, { IUser } from "../models/User";
import Group from "../models/Group";
import Site from "../models/Site";
import { generateToken } from "../utils/jwt";
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

function extractParamId(param: string | string[] | undefined): string {
    if (!param) return "";
    return Array.isArray(param) ? param[0] : param;
}

export interface UserLoginRequestBody {
    username?: string;
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
    displayName?: string;
    vacationBalance?: number;
    vacationDays?: number;
    [key: string]: unknown;
}

export interface ManagerUpdateRequestBody {
    isActive?: boolean;
    vacationBalance?: number;
    vacationDays?: number;
    displayName?: string;
    [key: string]: unknown;
}

export interface GetUsersRequestQuery {
    groupId?: string;
}

export async function login(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = (req.body || {}) as UserLoginRequestBody;
        const rawUsername = body.username;
        if (!rawUsername || typeof rawUsername !== "string" || !rawUsername.trim()) {
            res.status(400).json({ message: "Valid username is required" });
            return;
        }

        const username = rawUsername.trim();
        const user = await User.findOne({ username });

        if (!user) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        user.lastLogin = new Date().toISOString();
        if (user.isActive === false) {
            user.isActive = true;
        }

        const updatedUser = await user.save();
        const token = generateToken(updatedUser);
        res.json({ user: updatedUser, token });
    } catch (err: unknown) {
        console.error("Login error:", err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: "Login failed" });
    }
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
                res.status(404).json({ message: "Group not found" });
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

            const users = await User.find({
                "groups.groupId": group._id,
            });
            res.json(users);
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

        const users = await User.find();
        res.json(users);
    } catch (err: unknown) {
        console.error("Get users error:", err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: "Failed to retrieve users" });
    }
}

export async function reorderUsers(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = (req.body || {}) as ReorderUsersRequestBody;
        const { groupId, updates } = body;
        if (!groupId || typeof groupId !== "string" || !updates || !Array.isArray(updates) || updates.length === 0 || updates.length > 200) {
            res.status(400).json({ message: "Invalid payload: groupId and updates array (max 200 items) are required" });
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
            res.status(400).json({ message: "Invalid update item format: userId must be a valid ID and order must be numeric" });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found" });
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

        const promises = updates.map((update) => {
            const sanitizedUserId = update.userId.trim();
            return User.updateOne(
                { _id: sanitizedUserId, "groups.groupId": group._id },
                { $set: { "groups.$.order": update.order } },
            );
        });

        await Promise.all(promises);
        res.json({ message: "Order updated" });
    } catch (err: unknown) {
        console.error("Reorder users error:", err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: "Failed to update user ordering" });
    }
}

export async function updateUser(req: Request, res: Response, _next?: NextFunction): Promise<void> {
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
        const oldUser = await User.findById(targetUserId);
        if (!oldUser) {
            res.status(404).json({ message: "User not found" });
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
        const updatedUser = await User.findByIdAndUpdate(
            targetUserId,
            { $set: updateFields },
            { returnDocument: "after", runValidators: true },
        );

        // 5. Group membership synchronization logic
        if (body.groups && updatedUser) {
            const oldGroupIds = (oldUser.groups || [])
                .map((g) => {
                    const gid = g.groupId;
                    if (gid && typeof gid === "object" && "_id" in gid) {
                        return (gid as { _id?: unknown })._id?.toString();
                    }
                    return gid?.toString();
                })
                .filter((id): id is string => Boolean(id));

            const newGroupIds = (updatedUser.groups || [])
                .map((g) => {
                    const gid = g.groupId;
                    if (gid && typeof gid === "object" && "_id" in gid) {
                        return (gid as { _id?: unknown })._id?.toString();
                    }
                    return gid?.toString();
                })
                .filter((id): id is string => Boolean(id));

            const groupsToRemove = oldGroupIds.filter((id) => !newGroupIds.includes(id));
            const groupsToAdd = newGroupIds.filter((id) => !oldGroupIds.includes(id));

            const syncPromises: PromiseLike<unknown>[] = [];
            if (groupsToRemove.length > 0) {
                syncPromises.push(
                    Group.updateMany(
                        { _id: { $in: groupsToRemove } },
                        { $pull: { members: updatedUser._id } },
                    )
                );
            }
            if (groupsToAdd.length > 0) {
                syncPromises.push(
                    Group.updateMany(
                        { _id: { $in: groupsToAdd } },
                        { $addToSet: { members: updatedUser._id } },
                    )
                );
            }
            if (syncPromises.length > 0) {
                await Promise.all(syncPromises);
            }
        }

        invalidateUserCache(targetUserId);
        res.json(updatedUser);
    } catch (err: unknown) {
        console.error("Update user error:", err);
        res.status(400).json({ message: "Invalid user update request" });
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
        const requestingUserId = (requestingUser?._id || req.user?.id || req.auth?.userId || req.auth?.sub)?.toString();
        if (requestingUserId && paramId && requestingUserId === paramId) {
            res.status(403).json({
                message: "Forbidden: Administrators cannot delete their own accounts.",
                code: "FORBIDDEN_SELF_DELETION",
            });
            return;
        }

        const targetUserId = paramId;
        const userToDelete = await User.findById(targetUserId);
        if (!userToDelete) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        // System protection: Permanently prevent deletion of the root Super Admin account
        if (isSuperAdminUser(userToDelete)) {
            res.status(403).json({
                message: "System Security: The root Super Admin account cannot be deleted.",
            });
            return;
        }

        await User.findByIdAndDelete(targetUserId);
        invalidateUserCache(targetUserId);

        // Clean up group memberships and site favorites concurrently
        await Promise.all([
            Group.updateMany(
                { members: targetUserId },
                { $pull: { members: targetUserId } },
            ),
            Site.updateMany(
                { favoritedBy: targetUserId },
                { $pull: { favoritedBy: targetUserId } },
            ),
        ]);

        res.json({ message: "User deleted" });
    } catch (err: unknown) {
        console.error("Delete user error:", err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: "Failed to delete user" });
    }
}

export async function managerUpdate(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const targetUserId = extractParamId(req.params.id);
        const body = (req.body || {}) as ManagerUpdateRequestBody;
        const { isActive, vacationBalance, vacationDays } = body;
        const requestingUser = req.user as AuthUser | undefined;

        // 1. Fetch the target user being modified
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            res.status(404).json({ message: "User not found" });
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

        const requestedVacation = vacationBalance !== undefined ? vacationBalance : vacationDays;
        const isModifyingVacation = requestedVacation !== undefined;
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
        }

        if (isModifyingVacation) {
            const numVacation = Number(requestedVacation);
            if (isNaN(numVacation) || numVacation < 0) {
                res.status(400).json({ message: "Vacation balance must be a non-negative number" });
                return;
            }
            targetUser.vacationBalance = numVacation;
        }

        const updatedUser = await targetUser.save();
        invalidateUserCache(targetUserId);
        res.json(updatedUser);
    } catch (err: unknown) {
        console.error("Manager Update Error:", err);
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: "Failed to update user settings" });
    }
}

export default {
    login,
    getUsers,
    reorderUsers,
    updateUser,
    deleteUser,
    managerUpdate,
};

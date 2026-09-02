/**
 * @module UsersController
 * 
 * Handlers for user management, including authentication,
 * profile updates, group synchronization, and administrative controls.
 */

const mongoose = require("mongoose");
const User = require("../models/User");
const Group = require("../models/Group");
const Site = require("../models/Site");
const config = require("../config");
const { generateToken } = require("../utils/jwt");
const { isAdmin, isSuperAdminUser, resolveGroup, isGroupMember, isShiftManager, isShiftManagerForTargetUser } = require("../utils/authHelpers");
const { invalidateUserCache } = require("../middleware/authMiddleware");

exports.login = async (req, res) => {
    try {
        const { username } = req.body;
        if (!username || typeof username !== "string" || !username.trim()) {
            return res.status(400).json({ message: "Valid username is required" });
        }
        // Username could be an email or a handle depending on registration
        const user = await User.findOne({ username: username.trim() });

        if (!user) return res.status(404).json({ message: "User not found" });

        user.lastLogin = new Date().toISOString();
        if (user.isActive === false) {
            user.isActive = true;
        }

        const updatedUser = await user.save();
        const token = generateToken(updatedUser);
        res.json({ user: updatedUser, token });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Login failed" });
    }
};

/**
 * Retrieves users from the system.
 * 
 * - If `groupId` is provided in query params:
 *   Resolves the group and ensures the requester is an authorized member or an Administrator.
 *   Returns ONLY users who are members of that group (admins are included only if assigned to that group).
 * - If `groupId` is omitted:
 *   Returns the full user directory across all groups. Strictly restricted to Administrators.
 * 
 * @async
 * @function getUsers
 * @param {Object} req - Express request object containing query parameters and authenticated user (`req.user`).
 * @param {Object} res - Express response object.
 * @returns {Promise<void>}
 */
exports.getUsers = async (req, res) => {
    try {
        const { groupId } = req.query;
        const requestingUser = req.user;

        // Group-scoped user query
        if (groupId) {
            const group = await resolveGroup(groupId);
            if (!group) {
                return res.status(404).json({ message: "Group not found" });
            }

            // Authorization: If not an administrator, requester must be a member of the requested group
            if (!isAdmin(requestingUser)) {
                const isMember = await isGroupMember(requestingUser, groupId);
                if (!isMember) {
                    return res.status(403).json({
                        message: "Forbidden: You are not a member of this group.",
                        code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
                    });
                }
            }

            const users = await User.find({
                "groups.groupId": group._id,
            });
            return res.json(users);
        }

        // Full directory fetch (no groupId provided)
        // Strictly restricted to Administrators (members of SUPER_ADMIN_GROUP_NAME or root super admin)
        if (!isAdmin(requestingUser)) {
            return res.status(403).json({
                message: "Forbidden: Administrator privileges required for full user directory.",
                code: "FORBIDDEN_ADMIN_REQUIRED",
            });
        }

        const users = await User.find();
        return res.json(users);
    } catch (err) {
        console.error("Get users error:", err);
        return res.status(500).json({ message: "Failed to retrieve users" });
    }
};

exports.reorderUsers = async (req, res) => {
    try {
        const { groupId, updates } = req.body;
        if (!groupId || !updates || !Array.isArray(updates) || updates.length === 0 || updates.length > 200) {
            return res.status(400).json({ message: "Invalid payload: groupId and updates array (max 200 items) are required" });
        }

        // Validate structure and prevent NoSQL injection by ensuring userId is a valid string
        const hasInvalidItem = updates.some(
            (u) => !u || typeof u.userId !== "string" || !mongoose.Types.ObjectId.isValid(u.userId.trim()) || typeof u.order !== "number"
        );
        if (hasInvalidItem) {
            return res.status(400).json({ message: "Invalid update item format: userId must be a valid ID and order must be numeric" });
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }

        const isAuthorized = isAdmin(req.user) || await isShiftManager(req.user, group._id);
        if (!isAuthorized) {
            return res.status(403).json({
                message: "Forbidden: Administrator or Shift Manager permissions required for this group.",
                code: "FORBIDDEN_MANAGER_REQUIRED",
            });
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
    } catch (err) {
        console.error("Reorder users error:", err);
        res.status(500).json({ message: "Failed to update user ordering" });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const targetUserId = req.params.id;
        const requestingUser = req.user;

        // 1. Authorization check: Restricted to Administrators
        if (!isAdmin(requestingUser)) {
            return res.status(403).json({
                message: "Forbidden: Only Administrators can modify user accounts and profiles.",
                code: "FORBIDDEN_ADMIN_REQUIRED",
            });
        }

        // 2. Fetch target user
        const oldUser = await User.findById(targetUserId);
        if (!oldUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // System protection: Permanently prevent deactivating the root Super Admin account
        if (isSuperAdminUser(oldUser) && req.body.isActive === false) {
            return res.status(403).json({
                message: "System Security: The root Super Admin account cannot be deactivated.",
                code: "FORBIDDEN_SUPER_ADMIN_PROTECTED",
            });
        }

        // 3. Whitelist allowed update fields (displayName and vacationBalance are strictly barred/ignored from DB updates)
        const { email, isActive, groups, favoritePhones } = req.body;
        const updateFields = {};
        if (email !== undefined) updateFields.email = typeof email === "string" ? email.trim().toLowerCase() : email;
        if (isActive !== undefined) updateFields.isActive = Boolean(isActive);
        if (groups !== undefined && Array.isArray(groups)) updateFields.groups = groups;
        if (favoritePhones !== undefined && Array.isArray(favoritePhones)) updateFields.favoritePhones = favoritePhones;

        // 4. Update user with schema validators
        const updatedUser = await User.findByIdAndUpdate(
            targetUserId,
            { $set: updateFields },
            { new: true, runValidators: true },
        );

        // 6. Group membership synchronization logic
        if (req.body.groups) {
            const oldGroupIds = (oldUser.groups || [])
                .map((g) => (g.groupId?._id || g.groupId)?.toString())
                .filter(Boolean);
            const newGroupIds = (updatedUser.groups || [])
                .map((g) => (g.groupId?._id || g.groupId)?.toString())
                .filter(Boolean);

            const groupsToRemove = oldGroupIds.filter(
                (id) => !newGroupIds.includes(id),
            );
            const groupsToAdd = newGroupIds.filter(
                (id) => !oldGroupIds.includes(id),
            );

            const syncPromises = [];
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
    } catch (err) {
        console.error("Update user error:", err);
        res.status(400).json({ message: "Invalid user update request" });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        if (!isAdmin(req.user)) {
            return res.status(403).json({
                message: "Forbidden: Administrator privileges required to delete users.",
                code: "FORBIDDEN_ADMIN_REQUIRED",
            });
        }

        const userToDelete = await User.findById(req.params.id);
        if (!userToDelete) return res.status(404).json({ message: "User not found" });

        // System protection: Permanently prevent deletion of the root Super Admin account
        if (isSuperAdminUser(userToDelete)) {
            return res.status(403).json({
                message: "System Security: The root Super Admin account cannot be deleted.",
            });
        }

        await User.findByIdAndDelete(req.params.id);
        invalidateUserCache(req.params.id);

        // Clean up group memberships and site favorites concurrently
        await Promise.all([
            Group.updateMany(
                { members: req.params.id },
                { $pull: { members: req.params.id } },
            ),
            Site.updateMany(
                { favoritedBy: req.params.id },
                { $pull: { favoritedBy: req.params.id } },
            ),
        ]);

        res.json({ message: "User deleted" });
    } catch (err) {
        console.error("Delete user error:", err);
        res.status(500).json({ message: "Failed to delete user" });
    }
};

exports.managerUpdate = async (req, res) => {
    try {
        const { isActive, vacationBalance, vacationDays } = req.body;
        const requestingUser = req.user;

        // 1. Fetch the target user being modified
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // System protection: Permanently prevent deactivating the root Super Admin account
        if (isSuperAdminUser(targetUser) && isActive === false) {
            return res.status(403).json({
                message: "System Security: The root Super Admin account cannot be deactivated.",
                code: "FORBIDDEN_SUPER_ADMIN_PROTECTED",
            });
        }

        const requestedVacation = vacationBalance !== undefined ? vacationBalance : vacationDays;
        const isModifyingVacation = requestedVacation !== undefined;
        const isModifyingActive = isActive !== undefined;

        // 2. Perform Group Tenancy & Role Authorization Checks
        // Security Constraint: ONLY a Shift Manager of the target user's same operational group can alter vacation days.
        if (isModifyingVacation) {
            const hasShiftManagerTenancy = isShiftManagerForTargetUser(requestingUser, targetUser);
            if (!hasShiftManagerTenancy) {
                return res.status(403).json({
                    message: "Forbidden: Only a Shift Manager of this user's group can modify vacation balance.",
                    code: "FORBIDDEN_MANAGER_REQUIRED",
                });
            }
        }

        // Status (isActive) changes can be performed by Admins or group Shift Managers
        if (isModifyingActive && !isModifyingVacation) {
            const isAuthorizedForStatus = isAdmin(requestingUser) || isShiftManagerForTargetUser(requestingUser, targetUser);
            if (!isAuthorizedForStatus) {
                return res.status(403).json({
                    message: "Forbidden: Administrator or group Shift Manager permissions required.",
                    code: "FORBIDDEN_MANAGER_REQUIRED",
                });
            }
        }

        if (!isModifyingVacation && !isModifyingActive) {
            const isAuthorized = isAdmin(requestingUser) || isShiftManagerForTargetUser(requestingUser, targetUser);
            if (!isAuthorized) {
                return res.status(403).json({
                    message: "Forbidden: Administrator or group Shift Manager permissions required.",
                    code: "FORBIDDEN_MANAGER_REQUIRED",
                });
            }
        }

        // 3. Apply updates (displayName is strictly omitted to preserve SSO immutability)
        if (isModifyingActive) {
            targetUser.isActive = Boolean(isActive);
        }

        if (isModifyingVacation) {
            const numVacation = Number(requestedVacation);
            if (isNaN(numVacation) || numVacation < 0) {
                return res.status(400).json({ message: "Vacation balance must be a non-negative number" });
            }
            targetUser.vacationBalance = numVacation;
        }

        const updatedUser = await targetUser.save();
        invalidateUserCache(req.params.id);
        res.json(updatedUser);
    } catch (err) {
        console.error("Manager Update Error:", err);
        res.status(500).json({ message: "Failed to update user settings" });
    }
};

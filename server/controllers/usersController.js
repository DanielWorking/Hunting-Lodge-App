/**
 * @module UsersController
 * 
 * Handlers for user management, including authentication,
 * profile updates, group synchronization, and administrative controls.
 */

const mongoose = require("mongoose");
const User = require("../models/User");
const Group = require("../models/Group");
const config = require("../config");
const { generateToken } = require("../utils/jwt");
const { isAdmin, isSuperAdminUser, resolveGroup, isGroupMember } = require("../utils/authHelpers");

exports.login = async (req, res) => {
    try {
        const { username } = req.body;
        // Username could be an email or a handle depending on registration
        const user = await User.findOne({ username });

        if (!user) return res.status(404).json({ message: "User not found" });

        user.lastLogin = new Date().toISOString();
        if (user.isActive === false) {
            user.isActive = true;
        }

        const updatedUser = await user.save();
        const token = generateToken(updatedUser);
        res.json({ user: updatedUser, token });
    } catch (err) {
        res.status(500).json({ message: err.message });
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

            const groupIdentifiers = [group._id.toString(), group.id];
            const users = await User.find({
                "groups.groupId": { $in: groupIdentifiers },
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
        return res.status(500).json({ message: err.message });
    }
};

exports.reorderUsers = async (req, res) => {
    try {
        const { groupId, updates } = req.body;
        if (!groupId || !updates || !Array.isArray(updates)) {
            return res.status(400).json({ message: "Invalid payload: groupId and updates array are required" });
        }

        const group = await resolveGroup(groupId);
        const matchingGroupIds = group
            ? [group._id.toString(), group.id]
            : [groupId.toString()];

        const promises = updates.map((update) => {
            return User.updateOne(
                { _id: update.userId, "groups.groupId": { $in: matchingGroupIds } },
                { $set: { "groups.$.order": update.order } },
            );
        });

        await Promise.all(promises);
        res.json({ message: "Order updated" });
    } catch (err) {
        console.error("Reorder users error:", err);
        res.status(500).json({ message: err.message });
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

        // 3. Update user
        const updatedUser = await User.findByIdAndUpdate(
            targetUserId,
            { $set: req.body },
            { new: true },
        );

        // 4. Group membership synchronization logic
        if (req.body.groups) {
            const oldGroupIds = oldUser.groups.map((g) => g.groupId);
            const newGroupIds = updatedUser.groups.map((g) => g.groupId);

            // 4a. Remove user from groups they no longer belong to
            const groupsToRemove = oldGroupIds.filter(
                (id) => !newGroupIds.includes(id),
            );
            if (groupsToRemove.length > 0) {
                await Group.updateMany(
                    {
                        $or: [
                            { id: { $in: groupsToRemove } },
                            { _id: { $in: groupsToRemove } },
                        ],
                    },
                    { $pull: { members: updatedUser._id } },
                );
            }

            // 4b. Add user to new groups they joined
            const groupsToAdd = newGroupIds.filter(
                (id) => !oldGroupIds.includes(id),
            );
            if (groupsToAdd.length > 0) {
                await Group.updateMany(
                    {
                        $or: [
                            { id: { $in: groupsToAdd } },
                            { _id: { $in: groupsToAdd } },
                        ],
                    },
                    { $addToSet: { members: updatedUser._id } },
                );
            }
        }

        res.json(updatedUser);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const userToDelete = await User.findById(req.params.id);
        if (!userToDelete) return res.status(404).json({ message: "User not found" });

        // System protection: Permanently prevent deletion of the root Super Admin account
        if (isSuperAdminUser(userToDelete)) {
            return res.status(403).json({
                message: "System Security: The root Super Admin account cannot be deleted.",
            });
        }

        await User.findByIdAndDelete(req.params.id);

        // Clean up: Remove user from all groups they were members of
        await Group.updateMany(
            { members: req.params.id },
            { $pull: { members: req.params.id } },
        );

        res.json({ message: "User deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.managerUpdate = async (req, res) => {
    try {
        const { isActive, vacationBalance } = req.body;

        // 1. Fetch the target user being modified
        const targetUser = await User.findById(req.params.id);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        // 2. Perform Authorization check
        const requestingUser = req.user;
        let isAuthorized = isAdmin(requestingUser);

        if (!isAuthorized) {
            // Check if requester is a 'shift_manager' in any group the target user belongs to
            const managerGroupIds = requestingUser.groups
                .filter((g) => g.role === "shift_manager")
                .map((g) => g.groupId?.toString());

            const targetGroupIds = targetUser.groups.map((g) =>
                g.groupId?.toString(),
            );

            // Determine if there's an overlap between managed groups and target groups
            const hasCommonGroup = managerGroupIds.some((id) =>
                targetGroupIds.includes(id),
            );

            if (hasCommonGroup) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            return res.status(403).json({
                message: "Not authorized: You must be an Administrator or Shift Manager of this user's group.",
                code: "FORBIDDEN_MANAGER_REQUIRED",
            });
        }

        // 3. Apply updates
        if (isActive !== undefined) targetUser.isActive = isActive;
        if (vacationBalance !== undefined) targetUser.vacationBalance = vacationBalance;

        const updatedUser = await targetUser.save();
        res.json(updatedUser);
    } catch (err) {
        console.error("Manager Update Error:", err);
        res.status(500).json({ message: err.message });
    }
};

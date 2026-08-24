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

exports.getUsers = async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};


exports.reorderUsers = async (req, res) => {
    try {
        const { groupId, updates } = req.body;
        if (!groupId || !updates || !Array.isArray(updates)) {
            return res.status(400).json({ message: "Invalid payload: groupId and updates array are required" });
        }

        // Support matching group by both its ObjectId and custom string id
        const groupQuery = mongoose.Types.ObjectId.isValid(groupId)
            ? { $or: [{ _id: groupId }, { id: groupId }] }
            : { id: groupId };
        const group = await Group.findOne(groupQuery);
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
        // Fetch old user state to detect group membership changes
        const oldUser = await User.findById(req.params.id);
        if (!oldUser)
            return res.status(404).json({ message: "User not found" });

        // Update user fields
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true },
        );

        // Group membership synchronization logic
        if (req.body.groups) {
            const oldGroupIds = oldUser.groups.map((g) => g.groupId);
            const newGroupIds = updatedUser.groups.map((g) => g.groupId);

            // 1. Remove user from groups they no longer belong to
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

            // 2. Add user to new groups they joined
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

        const isSuperAdminUser =
            userToDelete.username === config.superAdmin.id ||
            userToDelete.username === config.superAdmin.username ||
            (config.superAdmin.email && userToDelete.email === config.superAdmin.email);

        // Protection: System prevents deletion of the Super Admin account
        if (isSuperAdminUser) {
            return res
                .status(403)
                .json({ message: "Cannot delete Super Admin" });
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
        const isSuperAdmin =
            requestingUser.username === config.superAdmin.id ||
            requestingUser.username === config.superAdmin.username ||
            (config.superAdmin.email && requestingUser.email === config.superAdmin.email);

        let isAuthorized = isSuperAdmin;

        if (!isAuthorized) {
            // Check if requester is a 'shift_manager' in any group the target user belongs to
            const managerGroupIds = requestingUser.groups
                .filter((g) => g.role === "shift_manager")
                .map((g) => g.groupId.toString());

            const targetGroupIds = targetUser.groups.map((g) =>
                g.groupId.toString(),
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
            return res
                .status(403)
                .json({
                    message:
                        "Not authorized: You must be a Shift Manager of this user's group.",
                });
        }

        // 3. Apply updates
        if (isActive !== undefined) targetUser.isActive = isActive;
        if (vacationBalance !== undefined)
            targetUser.vacationBalance = vacationBalance;

        const updatedUser = await targetUser.save();
        res.json(updatedUser);
    } catch (err) {
        console.error("Manager Update Error:", err);
        res.status(500).json({ message: err.message });
    }
};

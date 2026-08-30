/**
 * @module AuthHelpers
 * 
 * Provides utility functions to check user roles, administrator privileges,
 * group memberships, and shift manager status.
 */

const mongoose = require("mongoose");
const config = require("../config");
const Group = require("../models/Group");

/**
 * Resolves a group from a given string, ObjectId, or document identifier.
 * Matches by MongoDB _id or group name.
 * 
 * @async
 * @function resolveGroup
 * @param {string|mongoose.Types.ObjectId|Object} groupId - Group identifier or document.
 * @returns {Promise<Object|null>} The Group document or null.
 */
async function resolveGroup(groupId) {
    if (!groupId) return null;
    // Only trust groupId directly if it is an authentic Mongoose document instance
    if (groupId instanceof mongoose.Document || (typeof groupId === "object" && groupId._id && typeof groupId.save === "function")) {
        return groupId;
    }
    // For plain object literals (e.g. injected payload { _id: "..." }), safely extract and verify via DB
    if (typeof groupId === "object" && !(groupId instanceof mongoose.Types.ObjectId)) {
        if (groupId._id && (typeof groupId._id === "string" || groupId._id instanceof mongoose.Types.ObjectId)) {
            const rawId = groupId._id.toString().trim();
            if (mongoose.Types.ObjectId.isValid(rawId)) {
                const byId = await Group.findById(rawId);
                if (byId) return byId;
            }
        }
        return null;
    }
    const strId = typeof groupId === "string" ? groupId.trim() : groupId.toString();
    if (!strId || strId === "[object Object]") return null;

    if (mongoose.Types.ObjectId.isValid(strId)) {
        const byId = await Group.findById(strId);
        if (byId) return byId;
    }
    // Fallback: lookup by group name (useful for configuration strings like SUPER_ADMIN_GROUP_NAME)
    return Group.findOne({ name: strId });
}

/**
 * Checks if a user is the primary system Super Admin account.
 * Used specifically for preventing deletion/deactivation of the root admin.
 * 
 * @function isSuperAdminUser
 * @param {Object} user - User document or object.
 * @returns {boolean} True if user is the primary Super Admin account.
 */
function isSuperAdminUser(user) {
    if (!user) return false;
    const matchId = user.username === config.superAdmin.id;
    const matchUsername = user.username === config.superAdmin.username;
    const matchEmail = config.superAdmin.email && user.email === config.superAdmin.email;
    return Boolean(matchId || matchUsername || matchEmail);
}

/**
 * Checks if a user has administrative privileges.
 * A user is an Admin if they are the primary Super Admin account OR
 * belong to the designated SUPER_ADMIN_GROUP_NAME group.
 * 
 * @function isAdmin
 * @param {Object} user - User document or object.
 * @returns {boolean} True if user has administrative privileges.
 */
function isAdmin(user) {
    if (!user) return false;
    if (isSuperAdminUser(user)) return true;

    const adminGroupName = config.superAdmin.groupName;
    const userGroups = user.groups || [];
    return userGroups.some((g) => {
        const gid = (g.groupId?._id || g.groupId)?.toString();
        return gid === adminGroupName;
    });
}

/**
 * Checks if a user is explicitly a member of a specific group.
 * Strict check: All users (including Admins) must be explicitly assigned to the group.
 * 
 * @async
 * @function isGroupMember
 * @param {Object} user - User document or object.
 * @param {string|mongoose.Types.ObjectId} groupId - Group identifier.
 * @returns {Promise<boolean>} True if user is an explicit member of the group.
 */
async function isGroupMember(user, groupId) {
    if (!user || !groupId) return false;

    const group = await resolveGroup(groupId);
    if (!group) return false;

    const targetGroupId = group._id.toString();
    const userGroups = user.groups || [];

    return userGroups.some((g) => {
        const gid = (g.groupId?._id || g.groupId)?.toString();
        return gid === targetGroupId;
    });
}

/**
 * Checks if a user is explicitly a Shift Manager of a specific group.
 * Strict check: All users (including Admins) must be explicitly assigned role === 'shift_manager' in that group.
 * 
 * @async
 * @function isShiftManager
 * @param {Object} user - User document or object.
 * @param {string|mongoose.Types.ObjectId} groupId - Group identifier.
 * @returns {Promise<boolean>} True if user is an explicit shift manager of that group.
 */
async function isShiftManager(user, groupId) {
    if (!user || !groupId) return false;

    const group = await resolveGroup(groupId);
    if (!group) return false;

    const targetGroupId = group._id.toString();
    const userGroups = user.groups || [];

    return userGroups.some((g) => {
        const gid = (g.groupId?._id || g.groupId)?.toString();
        return gid === targetGroupId && g.role === "shift_manager";
    });
}

/**
 * Checks if the requesting user is an active Shift Manager in any group
 * to which the target user belongs.
 * Enforces operational group tenancy: only a Shift Manager of the target user's
 * specific group can manage group-scoped properties (such as vacation balance).
 *
 * @function isShiftManagerForTargetUser
 * @param {Object} requestingUser - User document or object of the requester.
 * @param {Object} targetUser - User document or object of the target.
 * @returns {boolean} True if requester is a shift_manager in at least one shared group.
 */
function isShiftManagerForTargetUser(requestingUser, targetUser) {
    if (!requestingUser || !targetUser) return false;

    const requesterManagedGroupIds = (requestingUser.groups || [])
        .filter((g) => g && g.role === "shift_manager")
        .map((g) => (g.groupId?._id || g.groupId)?.toString())
        .filter(Boolean);

    if (requesterManagedGroupIds.length === 0) return false;

    const targetGroupIds = (targetUser.groups || [])
        .map((g) => (g && (g.groupId?._id || g.groupId))?.toString())
        .filter(Boolean);

    if (targetGroupIds.length === 0) return false;

    return requesterManagedGroupIds.some((managedId) => targetGroupIds.includes(managedId));
}

module.exports = {
    resolveGroup,
    isSuperAdminUser,
    isAdmin,
    isGroupMember,
    isShiftManager,
    isShiftManagerForTargetUser,
};


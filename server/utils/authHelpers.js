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
 * Resolves a group from a given string or ObjectId identifier.
 * Matches by MongoDB _id or custom string id.
 * 
 * @async
 * @function resolveGroup
 * @param {string|mongoose.Types.ObjectId} groupId - Group identifier.
 * @returns {Promise<Object|null>} The Group document or null.
 */
async function resolveGroup(groupId) {
    if (!groupId) return null;
    const strId = groupId.toString();
    const isObjectId = mongoose.Types.ObjectId.isValid(strId);
    
    if (isObjectId) {
        return Group.findOne({
            $or: [{ _id: strId }, { id: strId }],
        });
    }
    return Group.findOne({ id: strId });
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
        const gid = g.groupId?.toString();
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

    const validGroupIdentifiers = [group._id.toString(), group.id];
    const userGroups = user.groups || [];

    return userGroups.some((g) => {
        const gid = g.groupId?.toString();
        return validGroupIdentifiers.includes(gid);
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

    const validGroupIdentifiers = [group._id.toString(), group.id];
    const userGroups = user.groups || [];

    return userGroups.some((g) => {
        const gid = g.groupId?.toString();
        return validGroupIdentifiers.includes(gid) && g.role === "shift_manager";
    });
}

module.exports = {
    resolveGroup,
    isSuperAdminUser,
    isAdmin,
    isGroupMember,
    isShiftManager,
};

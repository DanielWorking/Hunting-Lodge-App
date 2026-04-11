/**
 * @module UserRoutes
 * 
 * Provides API endpoints for user management, including authentication,
 * profile updates, group synchronization, and administrative controls.
 */

const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Group = require("../models/Group");
const { protect } = require("../middleware/authMiddleware");

// --- Public Routes ---

/**
 * POST /login
 * 
 * Handles local user login.
 * Note: This is primarily for backward compatibility or local development;
 * the main authentication flow uses the OIDC /auth/login route.
 * 
 * @name login
 * @route {POST} /login
 * @bodyparam {string} username - The identifier used for login (username or email).
 * @returns {Object} 200 - The authenticated User document.
 * @returns {Error}  404 - If the user is not found.
 * @returns {Error}  500 - Internal server error.
 */
router.post("/login", async (req, res) => {
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
        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Protected Routes ---
router.use(protect);

/**
 * GET /
 * 
 * Retrieves all registered users.
 * 
 * @name getUsers
 * @route {GET} /
 * @authentication Requires valid JWT.
 * @returns {Array<Object>} 200 - List of all User documents.
 * @returns {Error}  500 - Internal server error.
 */
router.get("/", async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * POST /
 * 
 * Creates a new user (Pre-provisioning).
 * Synchronizes the new user's membership across the specified groups.
 * 
 * @name createUser
 * @route {POST} /
 * @authentication Requires valid JWT.
 * @bodyparam {string} username - Unique organizational identifier.
 * @bodyparam {string} email - Verified email address.
 * @bodyparam {string} [displayName] - Full name for display.
 * @bodyparam {Object[]} [groups] - List of initial group assignments.
 * @bodyparam {boolean} [isActive=true] - Initial account status.
 * @returns {Object} 201 - The newly created User document.
 * @returns {Error}  400 - If user already exists or validation fails.
 */
router.post("/", async (req, res) => {
    try {
        const { username, email, displayName, groups, isActive } = req.body;

        // Check for existing user by username or email
        const existingUser = await User.findOne({
            $or: [{ username }, { email }],
        });

        if (existingUser) {
            return res
                .status(400)
                .json({ message: "User already exists (username or email)" });
        }

        const newUser = new User({
            username,
            email,
            displayName: displayName || username, // Default to username if not provided
            groups: groups || [],
            isActive: isActive !== undefined ? isActive : true,
            vacationBalance: 18, // System default balance
        });

        const savedUser = await newUser.save();

        // Group synchronization: Add user to the specified groups' member lists
        if (groups && groups.length > 0) {
            const groupIds = groups.map((g) => g.groupId);
            // Update groups to include the new user's ObjectId
            await Group.updateMany(
                {
                    $or: [
                        { id: { $in: groupIds } },
                        { _id: { $in: groupIds } }, // Support both ID types
                    ],
                },
                { $addToSet: { members: savedUser._id } },
            );
        }

        res.status(201).json(savedUser);
    } catch (err) {
        console.error("Create user error:", err);
        res.status(400).json({ message: err.message });
    }
});

/**
 * PUT /:id
 * 
 * Updates user profile and synchronizes group memberships.
 * Manages adding/removing the user from Group member lists based on changes.
 * 
 * @name updateUser
 * @route {PUT} /:id
 * @authentication Requires valid JWT.
 * @routeparam {string} id - The ObjectId of the user.
 * @bodyparam {Object} - Updated user fields.
 * @returns {Object} 200 - The updated User document.
 * @returns {Error}  404 - If user is not found.
 * @returns {Error}  400 - If update logic fails.
 */
router.put("/:id", async (req, res) => {
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
});

/**
 * DELETE /:id
 * 
 * Deletes a user and removes them from all group memberships.
 * Includes protection against deleting the Super Admin.
 * 
 * @name deleteUser
 * @route {DELETE} /:id
 * @authentication Requires valid JWT.
 * @routeparam {string} id - The ObjectId of the user to delete.
 * @returns {Object} 200 - Success message.
 * @returns {Error}  403 - If attempting to delete the Super Admin.
 * @returns {Error}  500 - Internal server error.
 */
router.delete("/:id", async (req, res) => {
    try {
        const userToDelete = await User.findById(req.params.id);

        const superAdminName = process.env.SUPER_ADMIN_USERNAME;

        // Protection: System prevents deletion of the Super Admin account
        if (userToDelete && userToDelete.username === superAdminName) {
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
});

/**
 * PUT /reorder/group
 * 
 * Updates the display order of users within a specific group.
 * 
 * @name reorderUsers
 * @route {PUT} /reorder/group
 * @authentication Requires valid JWT.
 * @bodyparam {string} groupId - The ID of the target group.
 * @bodyparam {Object[]} updates - List of {userId, order} objects.
 * @returns {Object} 200 - Success message.
 * @returns {Error}  500 - Internal server error.
 */
router.put("/reorder/group", async (req, res) => {
    try {
        const { groupId, updates } = req.body;
        const promises = updates.map((update) => {
            return User.updateOne(
                { _id: update.userId, "groups.groupId": groupId },
                { $set: { "groups.$.order": update.order } },
            );
        });

        await Promise.all(promises);
        res.json({ message: "Order updated" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * PATCH /:id/manager-update
 * 
 * Performs administrative updates on a user (Status & Vacation Balance).
 * Authorization: Restricted to Super Admins or Shift Managers of the user's groups.
 * 
 * @name managerUpdate
 * @route {PATCH} /:id/manager-update
 * @authentication Requires valid JWT.
 * @routeparam {string} id - The ObjectId of the target user.
 * @bodyparam {boolean} [isActive] - New active status.
 * @bodyparam {number} [vacationBalance] - New vacation day count.
 * @returns {Object} 200 - The updated User document.
 * @returns {Error}  403 - If the requester is not authorized for this user.
 * @returns {Error}  404 - If the target user is not found.
 * @returns {Error}  500 - Internal server error.
 */
router.patch("/:id/manager-update", async (req, res) => {
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
            requestingUser.username === process.env.SUPER_ADMIN_USERNAME;

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
});

module.exports = router;

/**
 * @module UserRoutes
 * 
 * Provides API endpoints for user management, including authentication,
 * profile updates, group synchronization, and administrative controls.
 */

const express = require("express");
const router = express.Router();
const usersController = require("../controllers/usersController");
const { protect, requireAdmin, requireShiftManager } = require("../middleware/authMiddleware");

// --- Public Routes ---

/**
 * POST /login
 * 
 * Handles local user login.
 * 
 * @name login
 * @route {POST} /login
 */
router.post("/login", usersController.login);

// --- Protected Routes ---
router.use(protect);

/**
 * GET /
 * 
 * Retrieves users.
 * - With `groupId` query parameter: returns only members of that specific group (requires membership or Administrator privileges).
 * - Without `groupId` query parameter: returns the full user directory across all groups (strictly restricted to Administrators).
 * 
 * @name getUsers
 * @route {GET} /
 * @authentication Requires valid JWT.
 */
router.get("/", usersController.getUsers);

/**
 * PUT /reorder/group
 * 
 * Updates the display order of users within a specific group.
 * Authorization: Restricted to Shift Managers of the group.
 * 
 * @name reorderUsers
 * @route {PUT} /reorder/group
 * @authentication Requires valid JWT and Shift Manager role in the target group.
 */
router.put(
    "/reorder/group",
    requireShiftManager((req) => req.body.groupId),
    usersController.reorderUsers,
);

/**
 * PUT /:id
 * 
 * Updates user profile and synchronizes group memberships.
 * Authorization: Restricted to Administrators. Regular users cannot alter profile data.
 * 
 * @name updateUser
 * @route {PUT} /:id
 * @authentication Requires valid JWT with Administrator privileges.
 */
router.put("/:id", requireAdmin, usersController.updateUser);

/**
 * DELETE /:id
 * 
 * Deletes a user and removes them from all group memberships.
 * Authorization: Restricted to Administrators.
 * System permanently blocks deletion of the root Super Admin account.
 * 
 * @name deleteUser
 * @route {DELETE} /:id
 * @authentication Requires valid JWT with Administrator privileges.
 */
router.delete("/:id", requireAdmin, usersController.deleteUser);

/**
 * PATCH /:id/manager-update
 * 
 * Performs administrative updates on a user (Status & Vacation Balance).
 * Authorization: Restricted to Admins or Shift Managers of the user's groups.
 * 
 * @name managerUpdate
 * @route {PATCH} /:id/manager-update
 * @authentication Requires valid JWT.
 */
router.patch("/:id/manager-update", usersController.managerUpdate);

module.exports = router;

/**
 * @module UserRoutes
 * 
 * Provides API endpoints for user management, including authentication,
 * profile updates, group synchronization, and administrative controls.
 */

const express = require("express");
const router = express.Router();
const usersController = require("../controllers/usersController");
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
 */
router.post("/login", usersController.login);

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
 */
router.get("/", usersController.getUsers);

/**
 * POST /
 * 
 * Creates a new user (Pre-provisioning).
 * Synchronizes the new user's membership across the specified groups.
 * 
 * @name createUser
 * @route {POST} /
 * @authentication Requires valid JWT.
 */
router.post("/", usersController.createUser);

/**
 * PUT /reorder/group
 * 
 * Updates the display order of users within a specific group.
 * 
 * @name reorderUsers
 * @route {PUT} /reorder/group
 * @authentication Requires valid JWT.
 */
router.put("/reorder/group", usersController.reorderUsers);

/**
 * PUT /:id
 * 
 * Updates user profile and synchronizes group memberships.
 * Manages adding/removing the user from Group member lists based on changes.
 * 
 * @name updateUser
 * @route {PUT} /:id
 * @authentication Requires valid JWT.
 */
router.put("/:id", usersController.updateUser);

/**
 * DELETE /:id
 * 
 * Deletes a user and removes them from all group memberships.
 * Includes protection against deleting the Super Admin.
 * 
 * @name deleteUser
 * @route {DELETE} /:id
 * @authentication Requires valid JWT.
 */
router.delete("/:id", usersController.deleteUser);

/**
 * PATCH /:id/manager-update
 * 
 * Performs administrative updates on a user (Status & Vacation Balance).
 * Authorization: Restricted to Super Admins or Shift Managers of the user's groups.
 * 
 * @name managerUpdate
 * @route {PATCH} /:id/manager-update
 * @authentication Requires valid JWT.
 */
router.patch("/:id/manager-update", usersController.managerUpdate);

module.exports = router;

/**
 * @module GroupRoutes
 * 
 * Provides API endpoints for managing groups, including their metadata,
 * shift settings, site tags, and member synchronization.
 */

const router = require("express").Router();
const groupsController = require("../controllers/groupsController");
const { protect } = require("../middleware/authMiddleware");

/**
 * GET /
 * 
 * Retrieves all groups with a real-time count of active members.
 * Uses a manual count from the User collection to ensure accuracy.
 * 
 * @name getGroups
 * @route {GET} /
 * @authentication This route requires a valid JWT.
 */
router.get("/", protect, groupsController.getGroups);

/**
 * POST /
 * 
 * Creates a new organizational group.
 * 
 * @name createGroup
 * @route {POST} /
 * @authentication This route requires a valid JWT.
 */
router.post("/", protect, groupsController.createGroup);

// === TAG MANAGEMENT ROUTES ===

/**
 * POST /:id/tags
 * 
 * Adds a new tag to the group for categorizing sites.
 * 
 * @name addTag
 * @route {POST} /:id/tags
 * @authentication This route requires a valid JWT.
 */
router.post("/:id/tags", protect, groupsController.addTag);

/**
 * PUT /:id/tags/:tagName
 * 
 * Renames an existing tag and updates all associated sites.
 * 
 * @name renameTag
 * @route {PUT} /:id/tags/:tagName
 * @authentication This route requires a valid JWT.
 */
router.put("/:id/tags/:tagName", protect, groupsController.renameTag);

/**
 * DELETE /:id/tags/:tagName
 * 
 * Deletes a tag and moves all associated sites to the "General" tag.
 * 
 * @name deleteTag
 * @route {DELETE} /:id/tags/:tagName
 * @authentication This route requires a valid JWT.
 */
router.delete("/:id/tags/:tagName", protect, groupsController.deleteTag);

// === SETTINGS UPDATE ROUTE (Specific) ===

/**
 * PUT /:id/settings
 * 
 * Updates specific group settings like shift types and time slots.
 * Validates that no duplicate shift type names are provided.
 * 
 * @name updateSettings
 * @route {PUT} /:id/settings
 * @authentication This route requires a valid JWT.
 */
router.put("/:id/settings", protect, groupsController.updateSettings);

// === GENERAL GROUP UPDATE (with Member Synchronization) ===

/**
 * PUT /:id
 * 
 * Updates general group metadata.
 * Includes security checks to prevent modification of system-protected groups.
 * 
 * @name updateGroup
 * @route {PUT} /:id
 * @authentication This route requires a valid JWT.
 */
router.put("/:id", protect, groupsController.updateGroup);

// === DELETE GROUP (Protected) ===

/**
 * DELETE /:id
 * 
 * Deletes a group and cleans up all related resources (sites, user memberships).
 * Prevents deletion if the group still has active members.
 * 
 * @name deleteGroup
 * @route {DELETE} /:id
 * @authentication This route requires a valid JWT.
 */
router.delete("/:id", protect, groupsController.deleteGroup);

module.exports = router;

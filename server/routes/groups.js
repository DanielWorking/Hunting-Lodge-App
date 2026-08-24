/**
 * @module GroupRoutes
 * 
 * Provides API endpoints for managing groups, including their metadata,
 * shift settings, site tags, and member synchronization.
 */

const router = require("express").Router();
const groupsController = require("../controllers/groupsController");
const {
    protect,
    requireAdmin,
    requireGroupMember,
    requireShiftManager,
} = require("../middleware/authMiddleware");

// Ensure all group routes require authentication
router.use(protect);

/**
 * GET /
 * 
 * Retrieves groups. Administrators receive all groups; regular users receive only their assigned groups.
 * 
 * @name getGroups
 * @route {GET} /
 * @authentication Requires valid JWT.
 */
router.get("/", groupsController.getGroups);

/**
 * POST /
 * 
 * Creates a new organizational group.
 * Authorization: Restricted to Administrators.
 * 
 * @name createGroup
 * @route {POST} /
 * @authentication Requires valid JWT with Administrator privileges.
 */
router.post("/", requireAdmin, groupsController.createGroup);

// === TAG MANAGEMENT ROUTES ===
// Only explicit members of that specific group can create, rename, and delete tags

/**
 * POST /:id/tags
 * 
 * Adds a new tag to the group for categorizing sites.
 * 
 * @name addTag
 * @route {POST} /:id/tags
 * @authentication Requires explicit group membership.
 */
router.post(
    "/:id/tags",
    requireGroupMember((req) => req.params.id),
    groupsController.addTag,
);

/**
 * PUT /:id/tags/:tagName
 * 
 * Renames an existing tag and updates all associated sites.
 * 
 * @name renameTag
 * @route {PUT} /:id/tags/:tagName
 * @authentication Requires explicit group membership.
 */
router.put(
    "/:id/tags/:tagName",
    requireGroupMember((req) => req.params.id),
    groupsController.renameTag,
);

/**
 * DELETE /:id/tags/:tagName
 * 
 * Deletes a tag and moves all associated sites to the "General" tag.
 * 
 * @name deleteTag
 * @route {DELETE} /:id/tags/:tagName
 * @authentication Requires explicit group membership.
 */
router.delete(
    "/:id/tags/:tagName",
    requireGroupMember((req) => req.params.id),
    groupsController.deleteTag,
);

// === SETTINGS UPDATE ROUTE ===

/**
 * PUT /:id/settings
 * 
 * Updates group settings like shift types and time slots.
 * Authorization: Strictly restricted to the Shift Manager of this group.
 * 
 * @name updateSettings
 * @route {PUT} /:id/settings
 * @authentication Requires Shift Manager role in the target group.
 */
router.put(
    "/:id/settings",
    requireShiftManager((req) => req.params.id),
    groupsController.updateSettings,
);

// === GENERAL GROUP UPDATE (Admin Only) ===

/**
 * PUT /:id
 * 
 * Updates general group metadata.
 * Authorization: Restricted to Administrators.
 * 
 * @name updateGroup
 * @route {PUT} /:id
 * @authentication Requires valid JWT with Administrator privileges.
 */
router.put("/:id", requireAdmin, groupsController.updateGroup);

// === DELETE GROUP (Admin Only) ===

/**
 * DELETE /:id
 * 
 * Deletes a group and cleans up all related resources.
 * Authorization: Restricted to Administrators.
 * 
 * @name deleteGroup
 * @route {DELETE} /:id
 * @authentication Requires valid JWT with Administrator privileges.
 */
router.delete("/:id", requireAdmin, groupsController.deleteGroup);

module.exports = router;

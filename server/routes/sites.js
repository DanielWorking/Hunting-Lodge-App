/**
 * @module SiteRoutes
 * 
 * Provides API endpoints for managing group-specific web resources and links.
 * Includes features for resource creation, duplicate URL validation within groups,
 * and user-specific favoriting.
 */

const router = require("express").Router();
const sitesController = require("../controllers/sitesController");
const { protect, requireGroupMember } = require("../middleware/authMiddleware");

// Ensure all site routes are protected by authentication
router.use(protect);

/**
 * GET /
 * 
 * Retrieves sites/resources accessible to the user based on group membership.
 * 
 * @name getSites
 * @route {GET} /
 * @authentication Requires valid JWT.
 */
router.get("/", sitesController.getSites);

/**
 * POST /
 * 
 * Creates a new web resource entry for a specific group.
 * Authorization: User must be a member of the target group or an Administrator.
 * 
 * @name createSite
 * @route {POST} /
 * @authentication Requires valid JWT and membership in req.body.groupId.
 */
router.post(
    "/",
    requireGroupMember((req) => req.body.groupId),
    sitesController.createSite,
);

/**
 * PUT /:id
 * 
 * Updates an existing resource entry.
 * Authorization: User must be a member of the site's group or an Administrator.
 * 
 * @name updateSite
 * @route {PUT} /:id
 * @authentication Requires valid JWT and membership in the site's group.
 */
router.put("/:id", sitesController.updateSite);

/**
 * DELETE /:id
 * 
 * Deletes a resource from the repository.
 * Authorization: User must be a member of the site's group or an Administrator.
 * 
 * @name deleteSite
 * @route {DELETE} /:id
 * @authentication Requires valid JWT and membership in the site's group.
 */
router.delete("/:id", sitesController.deleteSite);

/**
 * PUT /:id/favorite
 * 
 * Toggles the favorite status of a resource for the authenticated user.
 * 
 * @name toggleFavorite
 * @route {PUT} /:id/favorite
 * @authentication Requires valid JWT and membership in the site's group.
 */
router.put("/:id/favorite", sitesController.toggleFavorite);

module.exports = router;

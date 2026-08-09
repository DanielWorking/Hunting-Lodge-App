/**
 * @module SiteRoutes
 * 
 * Provides API endpoints for managing group-specific web resources and links.
 * Includes features for resource creation, duplicate URL validation within groups,
 * and user-specific favoriting.
 */

const router = require("express").Router();
const sitesController = require("../controllers/sitesController");
const { protect } = require("../middleware/authMiddleware");

/**
 * GET /
 * 
 * Retrieves all registered sites/resources.
 * 
 * @name getSites
 * @route {GET} /
 * @authentication Requires valid JWT.
 */
router.get("/", protect, sitesController.getSites);

/**
 * POST /
 * 
 * Creates a new web resource entry for a specific group.
 * Validates that the URL is unique within the context of the target group.
 * 
 * @name createSite
 * @route {POST} /
 * @authentication Requires valid JWT.
 */
router.post("/", protect, sitesController.createSite);

/**
 * PUT /:id
 * 
 * Updates an existing resource entry.
 * If the URL is changed, it performs a duplicate check within the group scope.
 * 
 * @name updateSite
 * @route {PUT} /:id
 * @authentication Requires valid JWT.
 */
router.put("/:id", protect, sitesController.updateSite);

/**
 * DELETE /:id
 * 
 * Deletes a resource from the repository.
 * 
 * @name deleteSite
 * @route {DELETE} /:id
 * @authentication Requires valid JWT.
 */
router.delete("/:id", protect, sitesController.deleteSite);

/**
 * PUT /:id/favorite
 * 
 * Toggles the favorite status of a resource for the authenticated user.
 * 
 * @name toggleFavorite
 * @route {PUT} /:id/favorite
 * @authentication Requires valid JWT.
 */
router.put("/:id/favorite", protect, sitesController.toggleFavorite);

module.exports = router;

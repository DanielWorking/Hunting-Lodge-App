/**
 * @module PhoneRoutes
 * 
 * Provides API endpoints for managing a shared contact directory.
 * Includes features for contact creation, duplicate number validation,
 * and user-specific favorite phone lists.
 */

const express = require("express");
const router = express.Router();
const phonesController = require("../controllers/phonesController");
const { protect } = require("../middleware/authMiddleware");

// Ensure all routes are protected by authentication
router.use(protect);

/**
 * GET /
 * 
 * Retrieves all phone contacts, sorted alphabetically by name.
 * Dynamically adds an `isFavorite` flag based on the current user's preferences.
 * 
 * @name getPhones
 * @route {GET} /
 * @authentication Requires valid JWT.
 */
router.get("/", phonesController.getPhones);

/**
 * POST /
 * 
 * Creates a new phone contact entry.
 * Validates that the provided numbers do not already exist in the directory.
 * 
 * @name createPhone
 * @route {POST} /
 * @authentication Requires valid JWT.
 */
router.post("/", phonesController.createPhone);

/**
 * PUT /:id
 * 
 * Updates an existing phone contact entry.
 * Ensures that updated numbers do not conflict with other existing contacts.
 * 
 * @name updatePhone
 * @route {PUT} /:id
 * @authentication Requires valid JWT.
 */
router.put("/:id", phonesController.updatePhone);

/**
 * PATCH /:id/favorite
 * 
 * Toggles the favorite status of a specific phone contact for the current user.
 * 
 * @name toggleFavorite
 * @route {PATCH} /:id/favorite
 * @authentication Requires valid JWT.
 */
router.patch("/:id/favorite", phonesController.toggleFavorite);

/**
 * DELETE /:id
 * 
 * Removes a phone contact from the directory.
 * 
 * @name deletePhone
 * @route {DELETE} /:id
 * @authentication Requires valid JWT.
 */
router.delete("/:id", phonesController.deletePhone);

module.exports = router;

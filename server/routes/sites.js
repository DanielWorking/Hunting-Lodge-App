/**
 * @module SiteRoutes
 * 
 * Provides API endpoints for managing group-specific web resources and links.
 * Includes features for resource creation, duplicate URL validation within groups,
 * and user-specific favoriting.
 */

const router = require("express").Router();
const Site = require("../models/Site");
const { protect } = require("../middleware/authMiddleware");

/**
 * GET /
 * 
 * Retrieves all registered sites/resources.
 * 
 * @name getSites
 * @route {GET} /
 * @authentication Requires valid JWT.
 * @returns {Array<Object>} 200 - List of all Site documents.
 * @returns {Error}  500 - Internal server error.
 */
router.get("/", protect, async (req, res) => {
    try {
        const sites = await Site.find();
        res.json(sites);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * POST /
 * 
 * Creates a new web resource entry for a specific group.
 * Validates that the URL is unique within the context of the target group.
 * 
 * @name createSite
 * @route {POST} /
 * @authentication Requires valid JWT.
 * @bodyparam {string} title - The display name of the resource.
 * @bodyparam {string} url - The web address of the resource.
 * @bodyparam {string} [imageUrl] - Optional thumbnail URL.
 * @bodyparam {string} [description] - Optional resource description.
 * @bodyparam {string} groupId - The ObjectId of the group this site belongs to.
 * @bodyparam {string} [tag] - Category tag (defaults to "General").
 * @returns {Object} 201 - The newly created Site document.
 * @returns {Error}  400 - If a duplicate URL exists in the group or validation fails.
 */
router.post("/", protect, async (req, res) => {
    const { title, url, imageUrl, description, groupId, tag } = req.body;

    // --- Duplicate Check ---
    // Verify if a site with the same URL already exists within this specific group
    const existingSite = await Site.findOne({ url, groupId });

    if (existingSite) {
        return res
            .status(400)
            .json({ message: "A resource with this link already exists in this group." });
    }

    const site = new Site({
        title,
        url,
        imageUrl,
        description,
        groupId,
        tag: tag || "General",
    });

    try {
        const newSite = await site.save();
        res.status(201).json(newSite);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

/**
 * PUT /:id
 * 
 * Updates an existing resource entry.
 * If the URL is changed, it performs a duplicate check within the group scope.
 * 
 * @name updateSite
 * @route {PUT} /:id
 * @authentication Requires valid JWT.
 * @routeparam {string} id - The ObjectId of the site to update.
 * @bodyparam {Object} - Updated site fields.
 * @returns {Object} 200 - The updated Site document.
 * @returns {Error}  400 - If the new URL conflicts with another resource in the group.
 */
router.put("/:id", protect, async (req, res) => {
    try {
        // If updating the URL, perform a duplicate check within the same group
        if (req.body.url) {
            // Fetch the current site to identify its groupId
            const currentSite = await Site.findById(req.params.id);

            if (currentSite) {
                // Check for other sites (excluding current) with the same URL and GroupId
                const duplicateSite = await Site.findOne({
                    url: req.body.url,
                    groupId: currentSite.groupId,
                    _id: { $ne: req.params.id }, // Ensure we aren't comparing the site to itself
                });

                if (duplicateSite) {
                    return res.status(400).json({
                        message: "A resource with this link already exists in this group.",
                    });
                }
            }
        }

        const updatedSite = await Site.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true },
        );
        res.json(updatedSite);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

/**
 * DELETE /:id
 * 
 * Deletes a resource from the repository.
 * 
 * @name deleteSite
 * @route {DELETE} /:id
 * @authentication Requires valid JWT.
 * @routeparam {string} id - The ObjectId of the site to delete.
 * @returns {Object} 200 - Success message.
 * @returns {Error}  500 - Internal server error.
 */
router.delete("/:id", protect, async (req, res) => {
    try {
        await Site.findByIdAndDelete(req.params.id);
        res.json({ message: "Site deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * PUT /:id/favorite
 * 
 * Toggles the favorite status of a resource for the authenticated user.
 * 
 * @name toggleFavorite
 * @route {PUT} /:id/favorite
 * @authentication Requires valid JWT.
 * @routeparam {string} id - The ObjectId of the site to toggle.
 * @returns {Object} 200 - The updated Site document with the modified favoritedBy array.
 * @returns {Error}  404 - If the site is not found.
 * @returns {Error}  500 - Internal server error.
 */
router.put("/:id/favorite", protect, async (req, res) => {
    try {
        const site = await Site.findById(req.params.id);
        if (!site) {
            return res.status(404).json({ message: "Site not found" });
        }

        // Retrieve user ID from the authentication middleware
        const userId = req.user._id;

        // Check if the user has already favorited this site
        const index = site.favoritedBy.indexOf(userId);

        if (index === -1) {
            // User has not favorited yet - add them to the array
            site.favoritedBy.push(userId);
        } else {
            // User already favorited - remove them from the array
            site.favoritedBy.splice(index, 1);
        }

        const updatedSite = await site.save();
        res.json(updatedSite);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

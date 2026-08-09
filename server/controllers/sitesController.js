/**
 * @module SitesController
 * 
 * Handlers for managing group-specific web resources and links.
 * Includes features for resource creation, duplicate URL validation within groups,
 * and user-specific favoriting.
 */

const Site = require("../models/Site");

exports.getSites = async (req, res) => {
    try {
        const sites = await Site.find();
        res.json(sites);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createSite = async (req, res) => {
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
};

exports.updateSite = async (req, res) => {
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
        if (!updatedSite) return res.status(404).json({ message: "Site not found" });
        res.json(updatedSite);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.deleteSite = async (req, res) => {
    try {
        const deletedSite = await Site.findByIdAndDelete(req.params.id);
        if (!deletedSite) return res.status(404).json({ message: "Site not found" });
        res.json({ message: "Site deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.toggleFavorite = async (req, res) => {
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
};

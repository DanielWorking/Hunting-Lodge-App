const router = require("express").Router();
const Site = require("../models/Site");
const { protect } = require("../middleware/authMiddleware");

// Get all sites
router.get("/", protect, async (req, res) => {
    try {
        const sites = await Site.find();
        res.json(sites);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Create a new site
router.post("/", protect, async (req, res) => {
    // הסרנו את isTacti מה-destructuring
    const { title, url, imageUrl, description, groupId, tag } = req.body;

    const site = new Site({
        title,
        url,
        imageUrl,
        description,
        groupId,
        // isTacti הוסר
        tag: tag || "General",
    });

    try {
        const newSite = await site.save();
        res.status(201).json(newSite);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Update a site
router.put("/:id", protect, async (req, res) => {
    try {
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

// Delete a site
router.delete("/:id", protect, async (req, res) => {
    try {
        await Site.findByIdAndDelete(req.params.id);
        res.json({ message: "Site deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

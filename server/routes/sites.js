const express = require("express");
const router = express.Router();
const Site = require("../models/Site");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

// קבלת כל האתרים
router.get("/", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Login required" });

    try {
        const sites = await Site.find().sort({ createdAt: -1 });
        res.json(sites);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// יצירת אתר חדש
router.post("/", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    const site = new Site(req.body);
    try {
        const newSite = await site.save();
        res.status(201).json(newSite);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// עדכון אתר
router.put("/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const updatedSite = await Site.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(updatedSite);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// מחיקת אתר
router.delete("/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        await Site.findByIdAndDelete(req.params.id);
        res.json({ message: "Site deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

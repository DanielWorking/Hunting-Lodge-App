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
    const { title, url, imageUrl, description, groupId, tag } = req.body;

    // --- בדיקת כפילות ---
    // בודק אם קיים כבר אתר עם אותו ה-URL באותה הקבוצה
    const existingSite = await Site.findOne({ url, groupId });

    if (existingSite) {
        return res
            .status(400)
            .json({ message: "קיים כבר כרטיס עם קישור זה בקבוצה זו." });
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

// Update a site
router.put("/:id", protect, async (req, res) => {
    try {
        // אם מנסים לעדכן את ה-URL, נבדוק כפילות
        if (req.body.url) {
            // שולפים את האתר הנוכחי כדי לדעת מה ה-groupId שלו
            const currentSite = await Site.findById(req.params.id);

            if (currentSite) {
                // בודקים אם קיים אתר אחר (לא הנוכחי) עם אותו URL ואותו GroupId
                const duplicateSite = await Site.findOne({
                    url: req.body.url,
                    groupId: currentSite.groupId,
                    _id: { $ne: req.params.id }, // מוודאים שאנחנו לא משווים לאתר עצמו
                });

                if (duplicateSite) {
                    return res.status(400).json({
                        message: "קיים כבר כרטיס עם קישור זה בקבוצה זו.",
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

// Delete a site
router.delete("/:id", protect, async (req, res) => {
    try {
        await Site.findByIdAndDelete(req.params.id);
        res.json({ message: "Site deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Toggle favorite for a site (Per User)
router.put("/:id/favorite", protect, async (req, res) => {
    try {
        const site = await Site.findById(req.params.id);
        if (!site) {
            return res.status(404).json({ message: "Site not found" });
        }

        // שולפים את מזהה המשתמש מתוך הטוקן (middleware)
        const userId = req.user._id;

        // בודקים אם המשתמש כבר נמצא במערך הלייקים
        const index = site.favoritedBy.indexOf(userId);

        if (index === -1) {
            // המשתמש עדיין לא עשה לייק - נוסיף אותו
            site.favoritedBy.push(userId);
        } else {
            // המשתמש כבר עשה לייק - נסיר אותו מהמערך
            site.favoritedBy.splice(index, 1);
        }

        const updatedSite = await site.save();
        res.json(updatedSite);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

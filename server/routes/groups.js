const router = require("express").Router();
const Group = require("../models/Group");
const User = require("../models/User");
const Site = require("../models/Site");
const { protect } = require("../middleware/authMiddleware");

// Get all groups with REAL-TIME user count check
router.get("/", protect, async (req, res) => {
    try {
        // שימוש ב-lean() כדי לקבל אובייקטים רגילים שניתן להוסיף להם שדות
        const groups = await Group.find().lean();

        // ביצוע שאילתה לטבלת המשתמשים עבור כל קבוצה כדי לקבל מספר אמת
        const groupsWithCounts = await Promise.all(
            groups.map(async (group) => {
                const realCount = await User.countDocuments({
                    "groups.groupId": group.id,
                });

                // אנחנו דורסים או מוסיפים את השדה userCount עם הנתון האמיתי מהשטח
                return {
                    ...group,
                    userCount: realCount,
                    // אופציונלי: אם הקליינט מסתמך על members.length, אפשר "לרמות" כאן,
                    // אבל עדיף להסתמך על userCount החדש שיצרנו.
                };
            }),
        );

        res.json(groupsWithCounts);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Create a new group
router.post("/", protect, async (req, res) => {
    const { id, name } = req.body;
    try {
        const existingGroup = await Group.findOne({ id });
        if (existingGroup)
            return res.status(400).json({ message: "Group ID already exists" });

        const newGroup = new Group({
            id,
            name,
            settings: { shiftTypes: [], timeSlots: [] },
            siteTags: ["General"],
        });

        const savedGroup = await newGroup.save();
        res.status(201).json(savedGroup);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// === TAG MANAGEMENT ROUTES ===

// Add a new tag
router.post("/:id/tags", protect, async (req, res) => {
    const { tagName } = req.body;
    if (!tagName || !tagName.trim()) {
        return res.status(400).json({ message: "Tag name is required" });
    }

    try {
        const group = await Group.findOne({ id: req.params.id });
        if (!group) return res.status(404).json({ message: "Group not found" });

        if (group.siteTags.includes(tagName.trim())) {
            return res.status(400).json({ message: "Tag already exists" });
        }

        group.siteTags.push(tagName.trim());
        await group.save();
        res.json(group.siteTags);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Rename a tag
router.put("/:id/tags/:tagName", protect, async (req, res) => {
    const { tagName } = req.params;
    const { newTagName } = req.body;

    if (!newTagName || !newTagName.trim()) {
        return res.status(400).json({ message: "New tag name is required" });
    }

    if (tagName === "General") {
        return res.status(400).json({ message: "Cannot rename General tag" });
    }

    try {
        const group = await Group.findOne({ id: req.params.id });
        if (!group) return res.status(404).json({ message: "Group not found" });

        const tagIndex = group.siteTags.indexOf(tagName);
        if (tagIndex === -1) {
            return res.status(404).json({ message: "Tag not found" });
        }

        if (group.siteTags.includes(newTagName.trim())) {
            return res
                .status(400)
                .json({ message: "New tag name already exists" });
        }

        // 1. Update tag in group
        group.siteTags[tagIndex] = newTagName.trim();
        await group.save();

        // 2. Update sites (using group._id for relationship)
        await Site.updateMany(
            { groupId: group._id, tag: tagName },
            { $set: { tag: newTagName.trim() } },
        );

        res.json({
            message: "Tag renamed successfully",
            siteTags: group.siteTags,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete a tag
router.delete("/:id/tags/:tagName", protect, async (req, res) => {
    const { tagName } = req.params;

    if (tagName === "General") {
        return res.status(400).json({ message: "Cannot delete General tag" });
    }

    try {
        const group = await Group.findOne({ id: req.params.id });
        if (!group) return res.status(404).json({ message: "Group not found" });

        group.siteTags = group.siteTags.filter((t) => t !== tagName);
        await group.save();

        await Site.updateMany(
            { groupId: group._id, tag: tagName },
            { $set: { tag: "General" } },
        );

        res.json({
            message: "Tag deleted and sites moved to General",
            siteTags: group.siteTags,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// === SETTINGS UPDATE ROUTE (Specific) ===
router.put("/:id/settings", protect, async (req, res) => {
    try {
        const { shiftTypes, timeSlots } = req.body;

        let group;
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            group = await Group.findById(req.params.id);
        } else {
            group = await Group.findOne({ id: req.params.id });
        }

        if (!group) return res.status(404).json({ message: "Group not found" });

        if (shiftTypes) {
            // בדיקה שאין שמות כפולים ברשימה החדשה שנשלחה
            const names = shiftTypes.map((t) => t.name.trim());
            const uniqueNames = new Set(names);

            if (names.length !== uniqueNames.size) {
                return res.status(400).json({
                    message:
                        "Validation Error: Duplicate shift type names are not allowed.",
                });
            }
            group.settings.shiftTypes = shiftTypes;
        }

        if (timeSlots) group.settings.timeSlots = timeSlots;

        // Fallback if settings object is sent directly
        if (req.body.settings) {
            group.settings = req.body.settings;
        }
        if (
            !shiftTypes &&
            !timeSlots &&
            (req.body.shiftTypes || req.body.timeSlots)
        ) {
            group.settings = req.body;
        }

        const updatedGroup = await group.save();
        res.json(updatedGroup);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// === GENERAL GROUP UPDATE (with Member Synchronization) ===
// Update a group
router.put("/:id", protect, async (req, res) => {
    const { name, settings, siteTags } = req.body;
    let query;

    // בדיקה האם ה-ID הוא מזהה מונגו או ID טקסטואלי
    if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
        query = { _id: req.params.id };
    } else {
        query = { id: req.params.id };
    }

    try {
        const group = await Group.findOne(query);

        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }

        // === SECURITY LAYER: הגנה על קבוצת האדמינים ===
        // מונע שינוי שם או הגדרות לקבוצת המערכת
        if (group.id === process.env.SUPER_ADMIN_GROUP_NAME) {
            return res.status(403).json({
                message: `System Security: The '${process.env.SUPER_ADMIN_GROUP_NAME}' group cannot be modified.`,
            });
        }

        // עדכון השדות רק אם נשלחו
        if (name) group.name = name;
        if (settings) group.settings = settings;
        if (siteTags) group.siteTags = siteTags;

        const updatedGroup = await group.save();
        res.json(updatedGroup);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// === DELETE GROUP (Protected) ===
router.delete("/:id", protect, async (req, res) => {
    try {
        let query = {};
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            query = { _id: req.params.id };
        } else {
            query = { id: req.params.id };
        }

        const group = await Group.findOne(query);
        if (!group) return res.status(404).json({ message: "Group not found" });

        // === הגנה וניקוי ===

        // 1. בדיקה האם הקבוצה עצמה חושבת שיש לה חברים (המקור האמין)
        if (group.members && group.members.length > 0) {
            return res.status(400).json({
                message:
                    "Cannot delete group with active members. Please remove members first.",
            });
        }

        // 2. אם הגענו לפה, הקבוצה ריקה. מבצעים ניקוי "שאריות" אצל המשתמשים
        const groupIdentifiers = [group.id, group._id.toString()].filter(
            Boolean,
        );

        await User.updateMany(
            { "groups.groupId": { $in: groupIdentifiers } },
            { $pull: { groups: { groupId: { $in: groupIdentifiers } } } },
        );

        // כעת בטוח למחוק

        await Group.findOneAndDelete(query);

        // ניקוי שאריות (אתרים וכו') - נשאר אותו דבר, אך סנכרון המשתמשים מיותר כי וידאנו שהם 0
        await Site.deleteMany({ groupId: group._id });

        res.json({ message: "Group deleted successfully" });
    } catch (err) {
        console.error("Delete group error:", err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

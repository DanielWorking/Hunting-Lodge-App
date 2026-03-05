const router = require("express").Router();
const Group = require("../models/Group");
const User = require("../models/User");
const Site = require("../models/Site");
const { protect } = require("../middleware/authMiddleware");

// Get all groups
router.get("/", protect, async (req, res) => {
    try {
        const groups = await Group.find();
        res.json(groups);
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

        // Update settings fields specifically
        if (shiftTypes) group.settings.shiftTypes = shiftTypes;
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
router.put("/:id", protect, async (req, res) => {
    try {
        let groupIdToFind = req.params.id;
        let query = {};

        // זיהוי האם זה ObjectId או ID מותאם
        if (groupIdToFind.match(/^[0-9a-fA-F]{24}$/)) {
            query = { _id: groupIdToFind };
        } else {
            query = { id: groupIdToFind };
        }

        // 1. שליפת הקבוצה הנוכחית (לפני השינוי) כדי להשוות חברים
        const oldGroup = await Group.findOne(query);
        if (!oldGroup)
            return res.status(404).json({ message: "Group not found" });

        // 2. עדכון הקבוצה עצמה
        // אנו משתמשים ב-req.body.members אם הוא קיים
        const updatedGroup = await Group.findOneAndUpdate(
            query,
            req.body,
            { new: true }, // מחזיר את המסמך החדש
        );

        // 3. לוגיקת סנכרון משתמשים (רק אם נשלח שדה members)
        if (req.body.members) {
            const oldMembers = oldGroup.members.map((m) => m.toString());
            const newMembers = req.body.members.map((m) => m.toString());

            // A. משתמשים שנוספו לקבוצה -> צריך לעדכן את ה-User שלהם
            const usersAdded = newMembers.filter(
                (id) => !oldMembers.includes(id),
            );
            if (usersAdded.length > 0) {
                await User.updateMany(
                    { _id: { $in: usersAdded } },
                    {
                        $addToSet: {
                            groups: {
                                groupId: updatedGroup.id, // משתמשים ב-ID המותאם (String) לקשר
                                role: "member",
                                order: 99,
                            },
                        },
                    },
                );
            }

            // B. משתמשים שהוסרו מהקבוצה -> צריך לעדכן את ה-User שלהם
            const usersRemoved = oldMembers.filter(
                (id) => !newMembers.includes(id),
            );
            if (usersRemoved.length > 0) {
                // כאן אנחנו חייבים להיזהר: למחוק רק את האובייקט הספציפי במערך groups
                // שמכיל את ה-groupId של הקבוצה הזו.

                // נחפש גם לפי ה-ID הרגיל וגם לפי ה-ObjectId למקרה של אי תאימות היסטורית
                const groupIdentifiers = [
                    updatedGroup.id,
                    updatedGroup._id.toString(),
                ];

                await User.updateMany(
                    { _id: { $in: usersRemoved } },
                    {
                        $pull: {
                            groups: { groupId: { $in: groupIdentifiers } },
                        },
                    },
                );
            }
        }

        res.json(updatedGroup);
    } catch (err) {
        console.error("Update group error:", err);
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

        // === הגנה: בדיקה האם יש משתמשים המקושרים לקבוצה זו ===
        // אנו בודקים האם קיים משתמש כלשהו שיש לו את הקבוצה הזו ברשימת ה-groups שלו
        const groupIdentifiers = [group.id, group._id.toString()].filter(
            Boolean,
        );

        const activeUserCount = await User.countDocuments({
            "groups.groupId": { $in: groupIdentifiers },
        });

        if (activeUserCount > 0) {
            return res.status(400).json({
                message:
                    "Cannot delete group with active members. Please remove members first.",
            });
        }
        // === סוף הגנה ===

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

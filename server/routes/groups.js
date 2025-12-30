const express = require("express");
const router = express.Router();
const Group = require("../models/Group");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");

// הפעלת ה-Middleware על כל הנתיבים בקובץ זה
router.use(protect);

// Get All
router.get("/", async (req, res) => {
    try {
        const groups = await Group.find();
        res.json(groups);
    } catch (err) {
        console.error("❌ ERROR in GET /api/groups:", err);
        res.status(500).json({ message: err.message });
    }
});

// Create Group + Sync Users
router.post("/", async (req, res) => {
    // הגנה: רק משתמש מחובר יכול ליצור קבוצה
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const group = new Group(req.body);
        const newGroup = await group.save();

        if (newGroup.members && newGroup.members.length > 0) {
            const membership = { groupId: newGroup._id, role: "member" };

            await User.updateMany(
                { _id: { $in: newGroup.members } },
                { $push: { groups: membership } }
            );
        }

        res.status(201).json(newGroup);
    } catch (err) {
        console.error("❌ ERROR in POST /api/groups:", err);
        res.status(400).json({ message: err.message });
    }
});

// Update Group + Sync Users
router.put("/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const updatedGroup = await Group.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        await User.updateMany(
            { "groups.groupId": req.params.id },
            { $pull: { groups: { groupId: req.params.id } } }
        );

        if (updatedGroup.members && updatedGroup.members.length > 0) {
            const membership = { groupId: updatedGroup._id, role: "member" };

            await User.updateMany(
                { _id: { $in: updatedGroup.members } },
                { $push: { groups: membership } }
            );
        }

        res.json(updatedGroup);
    } catch (err) {
        console.error("❌ ERROR in PUT /api/groups:", err);
        res.status(400).json({ message: err.message });
    }
});

// Update Settings
router.put("/:id/settings", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const { shiftTypes, timeSlots, reportEmails } = req.body;

        const updateData = {
            "settings.shiftTypes": shiftTypes,
            "settings.timeSlots": timeSlots,
        };

        if (reportEmails !== undefined) {
            updateData["reportEmails"] = reportEmails;
        }

        const updatedGroup = await Group.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true }
        );

        res.json(updatedGroup);
    } catch (err) {
        console.error(err);
        res.status(400).json({ message: err.message });
    }
});

// Delete Group
router.delete("/:id", async (req, res) => {
    if (!req.user) return res.status(401).json({ message: "Unauthorized" });

    try {
        const groupToDelete = await Group.findById(req.params.id);

        if (
            groupToDelete &&
            groupToDelete.name.toLowerCase() === "administrators"
        ) {
            return res
                .status(403)
                .json({ message: "Cannot delete administrators group" });
        }

        await Group.findByIdAndDelete(req.params.id);

        await User.updateMany(
            { "groups.groupId": req.params.id },
            { $pull: { groups: { groupId: req.params.id } } }
        );

        res.json({ message: "Group deleted" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;

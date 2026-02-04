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

// === TAG MANAGEMENT ROUTES (Fixed to use custom 'id') ===

// Add a new tag
router.post("/:id/tags", protect, async (req, res) => {
    const { tagName } = req.body;
    if (!tagName || !tagName.trim()) {
        return res.status(400).json({ message: "Tag name is required" });
    }

    try {
        // FIX: Using findOne with 'id' field instead of findById
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
        // FIX: Using findOne with 'id' field
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
        // FIX: Using findOne with 'id' field
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

// Update group settings (Logic: assumes ID is _id for standard updates, or use logic based on your frontend calls)
// If frontend sends _id for settings, keep findById. If it sends 'noc', use findOne.
// Usually settings updates use the _id.
router.put("/:id", protect, async (req, res) => {
    try {
        // Try by _id first (standard), if fails/invalid, try custom id
        let group;
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            group = await Group.findByIdAndUpdate(req.params.id, req.body, {
                new: true,
            });
        } else {
            group = await Group.findOneAndUpdate(
                { id: req.params.id },
                req.body,
                { new: true },
            );
        }
        res.json(group);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

module.exports = router;

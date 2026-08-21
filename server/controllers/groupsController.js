/**
 * @module GroupsController
 * 
 * Handlers for managing groups, including their metadata,
 * shift settings, site tags, and member synchronization.
 */

const Group = require("../models/Group");
const User = require("../models/User");
const Site = require("../models/Site");
const config = require("../config");

exports.getGroups = async (req, res) => {
    try {
        // Use lean() to get plain JavaScript objects for easier modification
        const groups = await Group.find().lean();

        // Query the User collection for each group to get the actual member count
        const groupsWithCounts = await Promise.all(
            groups.map(async (group) => {
                const realCount = await User.countDocuments({
                    "groups.groupId": group.id,
                });

                // Override or add the userCount field with the real-time data
                return {
                    ...group,
                    userCount: realCount,
                    // Note: Clients should rely on userCount rather than members.length
                };
            }),
        );

        res.json(groupsWithCounts);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createGroup = async (req, res) => {
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
};

exports.addTag = async (req, res) => {
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
};

exports.renameTag = async (req, res) => {
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

        // 1. Update tag in group configuration
        group.siteTags[tagIndex] = newTagName.trim();
        await group.save();

        // 2. Update all sites associated with this group and old tag
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
};

exports.deleteTag = async (req, res) => {
    const { tagName } = req.params;

    if (tagName === "General") {
        return res.status(400).json({ message: "Cannot delete General tag" });
    }

    try {
        const group = await Group.findOne({ id: req.params.id });
        if (!group) return res.status(404).json({ message: "Group not found" });

        group.siteTags = group.siteTags.filter((t) => t !== tagName);
        await group.save();

        // Relocate all sites under the deleted tag to "General"
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
};

exports.updateSettings = async (req, res) => {
    try {
        const { shiftTypes, timeSlots } = req.body;

        let group;
        // Check if the ID is a MongoDB ObjectId or a textual ID
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            group = await Group.findById(req.params.id);
        } else {
            group = await Group.findOne({ id: req.params.id });
        }

        if (!group) return res.status(404).json({ message: "Group not found" });

        if (shiftTypes) {
            // Validate that there are no duplicate names in the new list
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
};

exports.updateGroup = async (req, res) => {
    const { name, settings, siteTags, reportEmails } = req.body;
    let query;

    // Determine if ID is a MongoDB ObjectId or a textual identifier
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

        // === SECURITY LAYER: Protect the System Admin Group ===
        // Prevents renaming or changing settings for the core administrative group
        if (group.id === config.superAdmin.groupName) {
            return res.status(403).json({
                message: `System Security: The '${config.superAdmin.groupName}' group cannot be modified.`,
            });
        }

        // Update fields only if they were provided in the request
        if (name) group.name = name;
        if (settings) group.settings = settings;
        if (siteTags) group.siteTags = siteTags;
        if (reportEmails) group.reportEmails = reportEmails;

        const updatedGroup = await group.save();
        res.json(updatedGroup);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.deleteGroup = async (req, res) => {
    try {
        let query = {};
        if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
            query = { _id: req.params.id };
        } else {
            query = { id: req.params.id };
        }

        const group = await Group.findOne(query);
        if (!group) return res.status(404).json({ message: "Group not found" });

        // === VALIDATION & CLEANUP ===

        // 1. Check if the group itself thinks it has members (primary source of truth)
        if (group.members && group.members.length > 0) {
            return res.status(400).json({
                message:
                    "Cannot delete group with active members. Please remove members first.",
            });
        }

        // 2. If we reached here, the group is empty. Clean up "orphan" references in User documents
        const groupIdentifiers = [group.id, group._id.toString()].filter(
            Boolean,
        );

        await User.updateMany(
            { "groups.groupId": { $in: groupIdentifiers } },
            { $pull: { groups: { groupId: { $in: groupIdentifiers } } } },
        );

        // Safe to proceed with deletion
        await Group.findOneAndDelete(query);

        // Cleanup associated resources (sites, etc.)
        await Site.deleteMany({ groupId: group._id });

        res.json({ message: "Group deleted successfully" });
    } catch (err) {
        console.error("Delete group error:", err);
        res.status(500).json({ message: err.message });
    }
};

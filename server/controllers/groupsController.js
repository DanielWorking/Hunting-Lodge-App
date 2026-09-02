/**
 * @module GroupsController
 * 
 * Handlers for managing groups, including their metadata,
 * shift settings, site tags, and member synchronization.
 */

const mongoose = require("mongoose");
const Group = require("../models/Group");
const User = require("../models/User");
const Site = require("../models/Site");
const config = require("../config");
const { resolveGroup, isAdmin } = require("../utils/authHelpers");

const ShiftSchedule = require("../models/ShiftSchedule");
const ShiftReport = require("../models/ShiftReport");

exports.getGroups = async (req, res) => {
    try {
        let groups;

        if (isAdmin(req.user)) {
            // Administrators receive all groups in the system
            groups = await Group.find().lean();
        } else {
            // Regular users receive only the groups they are assigned to
            const userGroupIds = (req.user.groups || []).map((g) => (g.groupId?._id || g.groupId)).filter(Boolean);
            groups = await Group.find({ _id: { $in: userGroupIds } }).lean();
        }

        // Query the User collection using an optimized aggregation pipeline (with fallback for unit test mocks)
        let groupsWithCounts;
        if (mongoose.connection && mongoose.connection.readyState === 1 && typeof User.aggregate === "function") {
            try {
                const groupIds = groups.map((g) => g._id);
                const userCounts = await User.aggregate([
                    { $match: { "groups.groupId": { $in: groupIds } } },
                    { $unwind: "$groups" },
                    { $match: { "groups.groupId": { $in: groupIds } } },
                    { $group: { _id: "$groups.groupId", count: { $sum: 1 } } },
                ]);

                if (Array.isArray(userCounts)) {
                    const countMap = new Map(
                        userCounts.map((item) => [item._id ? item._id.toString() : "", item.count]),
                    );

                    groupsWithCounts = groups.map((group) => ({
                        ...group,
                        userCount: countMap.get(group._id ? group._id.toString() : "") || 0,
                    }));
                } else {
                    throw new Error("Aggregation returned non-array");
                }
            } catch {
                groupsWithCounts = await Promise.all(
                    groups.map(async (group) => {
                        const realCount = await User.countDocuments({
                            "groups.groupId": group._id,
                        });
                        return {
                            ...group,
                            userCount: realCount,
                        };
                    }),
                );
            }
        } else {
            groupsWithCounts = await Promise.all(
                groups.map(async (group) => {
                    const realCount = await User.countDocuments({
                        "groups.groupId": group._id,
                    });
                    return {
                        ...group,
                        userCount: realCount,
                    };
                }),
            );
        }

        res.json(groupsWithCounts);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createGroup = async (req, res) => {
    const groupName = req.body.name || req.body.id;
    if (!groupName || !groupName.trim()) {
        return res.status(400).json({ message: "Group name is required" });
    }
    const name = groupName.trim();
    try {
        const existingGroup = await Group.findOne({ name });
        if (existingGroup)
            return res.status(400).json({ message: "Group name already exists" });

        const newGroup = new Group({
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
        const group = await resolveGroup(req.params.id);
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
        const group = await resolveGroup(req.params.id);
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
        const group = await resolveGroup(req.params.id);
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

        const group = await resolveGroup(req.params.id);
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
    const { name, settings, siteTags } = req.body;

    try {
        const group = await resolveGroup(req.params.id);

        if (!group) {
            return res.status(404).json({ message: "Group not found" });
        }

        // === SECURITY LAYER: Protect the System Admin Group ===
        if (group.name === config.superAdmin.groupName) {
            return res.status(403).json({
                message: `System Security: The '${config.superAdmin.groupName}' group cannot be modified.`,
            });
        }

        // Update fields only if they were provided in the request
        if (name) group.name = name;
        if (settings) group.settings = settings;
        if (siteTags) group.siteTags = siteTags;

        const updatedGroup = await group.save();
        res.json(updatedGroup);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.deleteGroup = async (req, res) => {
    try {
        const group = await resolveGroup(req.params.id);
        if (!group) return res.status(404).json({ message: "Group not found" });

        // === SECURITY LAYER: Protect System Admin Group ===
        if (group.name === config.superAdmin.groupName) {
            return res.status(403).json({
                message: `System Security: The '${config.superAdmin.groupName}' group cannot be deleted.`,
            });
        }

        // === VALIDATION & CLEANUP ===

        // 1. Check if the group itself thinks it has members
        if (group.members && group.members.length > 0) {
            return res.status(400).json({
                message:
                    "Cannot delete group with active members. Please remove members first.",
            });
        }

        // 2. Clean up references in User documents
        await User.updateMany(
            { "groups.groupId": group._id },
            { $pull: { groups: { groupId: group._id } } },
        );

        // Safe to proceed with deletion
        await Group.findByIdAndDelete(group._id);

        // Cleanup associated resources (sites, schedules, reports)
        await Site.deleteMany({ groupId: group._id });
        await ShiftSchedule.deleteMany({ groupId: group._id });
        await ShiftReport.deleteMany({ groupId: group._id });

        res.json({ message: "Group deleted successfully" });
    } catch (err) {
        console.error("Delete group error:", err);
        res.status(500).json({ message: err.message });
    }
};

/**
 * @module SitesController
 * 
 * Handlers for managing group-specific web resources and links.
 * Enforces strict group isolation: all users (including Admins) must be
 * explicit members of a group to view, create, edit, or delete its resources.
 */

const Site = require("../models/Site");
const Group = require("../models/Group");
const { isGroupMember, resolveGroup } = require("../utils/authHelpers");

exports.getSites = async (req, res) => {
    try {
        const { groupId } = req.query;

        if (groupId) {
            // Check explicit access to specific group
            const hasAccess = await isGroupMember(req.user, groupId);
            if (!hasAccess) {
                return res.status(403).json({
                    message: "Forbidden: You are not a member of this group.",
                    code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
                });
            }

            const group = await resolveGroup(groupId);
            if (!group) return res.json([]);

            const sites = await Site.find({ groupId: group._id });
            return res.json(sites);
        }

        // Global fetch (filtered strictly to groups the requesting user is a member of)
        const userGroupIds = (req.user.groups || []).map((g) => g.groupId);
        const userGroups = await Group.find({
            $or: [
                { _id: { $in: userGroupIds } },
                { id: { $in: userGroupIds } },
            ],
        });
        const groupObjectIds = userGroups.map((g) => g._id);

        const sites = await Site.find({ groupId: { $in: groupObjectIds } });
        res.json(sites);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.createSite = async (req, res) => {
    const { title, url, imageUrl, description, groupId, tag } = req.body;

    try {
        const group = await resolveGroup(groupId);
        if (!group) {
            return res.status(404).json({ message: "Target group not found." });
        }

        // --- Duplicate Check ---
        // Verify if a site with the same URL already exists within this specific group
        const existingSite = await Site.findOne({ url, groupId: group._id });

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
            groupId: group._id,
            tag: tag || "General",
        });

        const newSite = await site.save();
        res.status(201).json(newSite);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.updateSite = async (req, res) => {
    try {
        const currentSite = await Site.findById(req.params.id);
        if (!currentSite) {
            return res.status(404).json({ message: "Site not found" });
        }

        // Authorization: Verify user is an explicit member of the site's group
        const hasAccess = await isGroupMember(req.user, currentSite.groupId);
        if (!hasAccess) {
            return res.status(403).json({
                message: "Forbidden: You are not a member of this group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
        }

        let targetGroupId = currentSite.groupId;
        if (req.body.groupId) {
            const newGroup = await resolveGroup(req.body.groupId);
            if (!newGroup) return res.status(404).json({ message: "Group not found" });
            const hasNewGroupAccess = await isGroupMember(req.user, newGroup._id);
            if (!hasNewGroupAccess) {
                return res.status(403).json({
                    message: "Forbidden: You are not a member of the destination group.",
                });
            }
            targetGroupId = newGroup._id;
            req.body.groupId = newGroup._id;
        }

        // If updating the URL, perform a duplicate check within the target group
        if (req.body.url) {
            const duplicateSite = await Site.findOne({
                url: req.body.url,
                groupId: targetGroupId,
                _id: { $ne: req.params.id },
            });

            if (duplicateSite) {
                return res.status(400).json({
                    message: "A resource with this link already exists in this group.",
                });
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
};

exports.deleteSite = async (req, res) => {
    try {
        const currentSite = await Site.findById(req.params.id);
        if (!currentSite) {
            return res.status(404).json({ message: "Site not found" });
        }

        // Authorization: Verify user is an explicit member of the site's group
        const hasAccess = await isGroupMember(req.user, currentSite.groupId);
        if (!hasAccess) {
            return res.status(403).json({
                message: "Forbidden: You are not a member of this group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
        }

        await Site.findByIdAndDelete(req.params.id);
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

        // Authorization: Verify user is an explicit member of the site's group
        const hasAccess = await isGroupMember(req.user, site.groupId);
        if (!hasAccess) {
            return res.status(403).json({
                message: "Forbidden: You are not a member of this group.",
                code: "FORBIDDEN_GROUP_MEMBER_REQUIRED",
            });
        }

        const userId = req.user._id;
        const index = site.favoritedBy.indexOf(userId);

        if (index === -1) {
            site.favoritedBy.push(userId);
        } else {
            site.favoritedBy.splice(index, 1);
        }

        const updatedSite = await site.save();
        res.json(updatedSite);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

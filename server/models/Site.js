/**
 * @module Site
 * 
 * Manages the repository of group-specific links and resources.
 * Resources can be categorized by tags and personalized by individual users.
 */

const mongoose = require("mongoose");

/**
 * Represents a web resource or tool accessible to a group.
 * 
 * @class Site
 * @property {string} title - The display name of the resource.
 * @property {string} url - The web address of the site.
 * @property {string} [imageUrl] - Optional URL for a preview thumbnail.
 * @property {string} [description] - Optional brief overview of the resource.
 * @property {mongoose.Schema.Types.ObjectId[]} favoritedBy - List of users who have starred this site.
 * @property {mongoose.Schema.Types.ObjectId} groupId - Reference to the Group this site belongs to.
 * @property {string} tag - Category label for filtering (e.g., "Tools", "General").
 * @property {Date} createdAt - Timestamp of when the site was added.
 */
const SiteSchema = new mongoose.Schema({
    title: { type: String, required: true },
    url: { type: String, required: true },
    imageUrl: { type: String },
    description: { type: String },
    favoritedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group",
        required: true,
    },
    createdAt: { type: Date, default: Date.now },
    tag: { type: String, default: "General" },
});

module.exports = mongoose.model("Site", SiteSchema);

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
 * @property {string} tag - Category label for filtering (defaults to "General").
 * @property {Date} createdAt - Automatically managed timestamp.
 * @property {Date} updatedAt - Automatically managed timestamp.
 */
const SiteSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Site title is required"],
            trim: true,
        },
        url: {
            type: String,
            required: [true, "Site URL is required"],
            trim: true,
        },
        imageUrl: {
            type: String,
            trim: true,
            default: "",
        },
        description: {
            type: String,
            trim: true,
            default: "",
        },
        favoritedBy: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
            ],
            default: [],
        },
        groupId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Group",
            required: [true, "Group reference is required"],
        },
        tag: {
            type: String,
            default: "General",
            trim: true,
        },
    },
    { timestamps: true },
);

// Compound indexes for group tag filtering and duplicate URL checks within a group
SiteSchema.index({ groupId: 1, tag: 1 });
SiteSchema.index({ groupId: 1, url: 1 });

module.exports = mongoose.model("Site", SiteSchema);

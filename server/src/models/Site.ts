/**
 * @module Site
 * 
 * Manages the repository of group-specific links and resources.
 * Resources can be categorized by tags and personalized by individual users.
 */

import mongoose, { Schema, Model, HydratedDocument, Types, PopulatedDoc } from "mongoose";
import type { IUser } from "./User";
import type { IGroup } from "./Group";

/**
 * Represents a web resource or tool accessible to a group.
 */
export interface ISite {
    title: string;
    url: string;
    imageUrl?: string;
    description?: string;
    favoritedBy: (PopulatedDoc<IUser, Types.ObjectId> | string)[];
    groupId: PopulatedDoc<IGroup, Types.ObjectId>;
    tag: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export type SiteDocument = HydratedDocument<ISite>;
export type SiteModel = Model<ISite>;

const SiteSchema = new Schema<ISite>(
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
                    type: Schema.Types.ObjectId,
                    ref: "User",
                },
            ],
            default: [],
        },
        groupId: {
            type: Schema.Types.ObjectId,
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

const Site: SiteModel = (mongoose.models.Site as SiteModel) || mongoose.model<ISite, SiteModel>("Site", SiteSchema);

export { Site, SiteSchema };
export default Site;

// CommonJS compatibility for require("../models/Site")
module.exports = Site;
module.exports.default = Site;
module.exports.Site = Site;
module.exports.SiteSchema = SiteSchema;

/**
 * @module User
 * 
 * Manages user identities, cross-group memberships, and personal preferences.
 * Handles roles within groups and tracks resource-related metrics like vacation balance.
 */

import mongoose, { Schema, Model, HydratedDocument, Types, PopulatedDoc } from "mongoose";
import type { IGroup } from "./Group";
import type { IPhone } from "./Phone";

export type UserRole = "member" | "shift_manager";

/**
 * Sub-document interface for a user's group membership.
 */
export interface IUserGroup {
    _id?: Types.ObjectId;
    groupId: PopulatedDoc<IGroup, Types.ObjectId>;
    role: UserRole;
    order: number;
}

/**
 * Interface representing a User document.
 */
export interface IUser {
    username: string;
    displayName?: string;
    email: string;
    groups: IUserGroup[];
    isActive: boolean;
    lastLogin?: string;
    vacationBalance: number;
    favoritePhones: (PopulatedDoc<IPhone, Types.ObjectId> | string)[];
    createdAt?: Date;
    updatedAt?: Date;
}

export type UserDocument = HydratedDocument<IUser>;
export type UserModel = Model<IUser>;

const UserSchema = new Schema<IUser>(
    {
        username: {
            type: String,
            required: [true, "Username is required"],
            unique: true,
            trim: true,
            minlength: [1, "Username cannot be empty"],
        },
        displayName: {
            type: String,
            trim: true,
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            trim: true,
            lowercase: true,
            match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
        },
        groups: [
            {
                groupId: {
                    type: Schema.Types.ObjectId,
                    ref: "Group",
                    required: true,
                },
                role: {
                    type: String,
                    enum: ["member", "shift_manager"],
                    default: "member",
                    required: true,
                },
                order: {
                    type: Number,
                    default: 0,
                },
            },
        ],
        isActive: {
            type: Boolean,
            default: true,
        },
        lastLogin: {
            type: String,
        },
        vacationBalance: {
            type: Number,
            default: 18,
            min: [0, "Vacation balance cannot be negative"],
        },
        favoritePhones: {
            type: [
                {
                    type: Schema.Types.ObjectId,
                    ref: "Phone",
                },
            ],
            default: [],
        },
    },
    { timestamps: true },
);

// Optimize multi-key lookups for group-filtered user listings and member count aggregations
UserSchema.index({ "groups.groupId": 1 });
UserSchema.index({ "groups.groupId": 1, "groups.order": 1 });

const User: UserModel = (mongoose.models.User as UserModel) || mongoose.model<IUser, UserModel>("User", UserSchema);

export { User, UserSchema };
export default User;

// CommonJS compatibility for require("../models/User")
module.exports = User;
module.exports.default = User;
module.exports.User = User;
module.exports.UserSchema = UserSchema;

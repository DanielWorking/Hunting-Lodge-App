/**
 * @module User
 * 
 * Manages user identities, cross-group memberships, and personal preferences.
 * Handles roles within groups and tracks resource-related metrics like vacation balance.
 */

const mongoose = require("mongoose");

/**
 * Represents an authenticated user in the system.
 * 
 * @class User
 * @property {string} username - Unique identifier for the user.
 * @property {string} [displayName] - Human-readable name for UI display.
 * @property {string} email - Verified email address (unique, trimmed, lowercase).
 * @property {Object[]} groups - List of groups the user belongs to.
 * @property {mongoose.Schema.Types.ObjectId} groups.groupId - Reference to the Group document.
 * @property {string} groups.role - User's authority level in the group ("member", "shift_manager").
 * @property {number} groups.order - Sorting preference for groups in the UI.
 * @property {boolean} isActive - Toggle for account access and visibility.
 * @property {string} [lastLogin] - ISO string or timestamp of the most recent login.
 * @property {number} vacationBalance - Remaining vacation days (defaults to 18, min 0).
 * @property {mongoose.Schema.Types.ObjectId[]} favoritePhones - References to Phone entries for quick access.
 */
const UserSchema = new mongoose.Schema(
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
                    type: mongoose.Schema.Types.ObjectId,
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

        // List of favorite phones
        favoritePhones: {
            type: [
                {
                    type: mongoose.Schema.Types.ObjectId,
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

module.exports = mongoose.model("User", UserSchema);

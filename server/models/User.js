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
 * @property {string} email - Verified email address (unique, sparse index).
 * @property {Object[]} groups - List of groups the user belongs to.
 * @property {string} groups.groupId - The ID of the group.
 * @property {string} groups.role - User's authority level in the group ("member", "shift_manager").
 * @property {number} groups.order - Sorting preference for groups in the UI.
 * @property {boolean} isActive - Toggle for account access and visibility.
 * @property {string} [lastLogin] - ISO string or timestamp of the most recent login.
 * @property {number} vacationBalance - Remaining vacation days (defaults to 18).
 * @property {mongoose.Schema.Types.ObjectId[]} favoritePhones - References to Phone entries for quick access.
 */
const UserSchema = new mongoose.Schema(
    {
        username: { type: String, required: true, unique: true },
        displayName: { type: String },
        email: { type: String, required: true, unique: true, sparse: true },
        groups: [
            {
                groupId: { type: String },
                role: { type: String, enum: ["member", "shift_manager"] },
                order: { type: Number, default: 0 },
            },
        ],
        isActive: { type: Boolean, default: true },
        lastLogin: { type: String },
        vacationBalance: { type: Number, default: 18 },

        // List of favorite phones
        favoritePhones: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Phone",
            },
        ],
    },
    { timestamps: true },
);

module.exports = mongoose.model("User", UserSchema);

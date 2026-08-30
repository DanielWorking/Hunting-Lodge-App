/**
 * @module Phone
 * 
 * Defines the Phone model for a shared contact directory.
 * Used to store and categorize frequently used contact numbers across the organization.
 */

const mongoose = require("mongoose");

/**
 * Represents a contact entry in the directory.
 * 
 * @class Phone
 * @property {string} name - The name or title of the contact/office.
 * @property {string[]} numbers - Array of phone numbers associated with this contact.
 * @property {string} type - Category of the phone ("Black", "Red", "Mobile", "Landline").
 * @property {string} [description] - Optional notes or context for the contact.
 * @property {Date} createdAt - Automatically managed timestamp.
 * @property {Date} updatedAt - Automatically managed timestamp.
 */
const PhoneSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Contact name is required"],
            trim: true,
        },
        numbers: {
            type: [String],
            required: [true, "At least one phone number is required"],
            validate: [
                (val) =>
                    Array.isArray(val) &&
                    val.length > 0 &&
                    val.every((n) => typeof n === "string" && n.trim().length > 0),
                "Must have at least one valid non-empty phone number",
            ],
        },
        type: {
            type: String,
            enum: {
                values: ["Black", "Red", "Mobile", "Landline"],
                message: "{VALUE} is not a valid phone classification type",
            },
            required: [true, "Phone classification type is required"],
        },
        description: {
            type: String,
            trim: true,
            default: "",
        },
    },
    {
        timestamps: true,
    },
);

// Indexes for duplicate number lookups, alphabetical directory sorting, and type filtering
PhoneSchema.index({ numbers: 1 });
PhoneSchema.index({ name: 1 });
PhoneSchema.index({ type: 1, name: 1 });

module.exports = mongoose.model("Phone", PhoneSchema);

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
 * @property {string} type - Category of the phone (e.g., "Black" for secure lines, "Red" for emergency).
 * @property {string} [description] - Optional notes or context for the contact.
 * @property {Date} createdAt - Automatically managed timestamp.
 * @property {Date} updatedAt - Automatically managed timestamp.
 */
const PhoneSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        numbers: {
            type: [String],
            required: true,
            validate: [
                (val) => val.length > 0,
                "Must have at least one phone number",
            ],
        },
        type: {
            type: String,
            enum: ["Black", "Red", "Mobile", "Landline"],
            required: true,
        },
        description: { type: String },
    },
    {
        timestamps: true,
    },
);

module.exports = mongoose.model("Phone", PhoneSchema);

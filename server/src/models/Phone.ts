/**
 * @module Phone
 * 
 * Defines the Phone model for a shared contact directory.
 * Used to store and categorize frequently used contact numbers across the organization.
 */

import mongoose, { Schema, Model, HydratedDocument } from "mongoose";

export type PhoneType = "Black" | "Red" | "Mobile" | "Landline";

export interface IPhone {
    name: string;
    numbers: string[];
    type: PhoneType;
    description?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export type PhoneDocument = HydratedDocument<IPhone>;
export type PhoneModel = Model<IPhone>;

/**
 * Represents a contact entry in the directory.
 */
const PhoneSchema = new Schema<IPhone>(
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
                (val: string[]) =>
                    Array.isArray(val) &&
                    val.length > 0 &&
                    val.every((n: string) => typeof n === "string" && n.trim().length > 0),
                "Must have at least one valid non-empty phone number",
            ],
        },
        type: {
            type: String,
            enum: {
                values: ["Black", "Red", "Mobile", "Landline"] as PhoneType[],
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

const Phone: PhoneModel = (mongoose.models.Phone as PhoneModel) || mongoose.model<IPhone, PhoneModel>("Phone", PhoneSchema);

export { Phone, PhoneSchema };
export default Phone;

// CommonJS compatibility for require("../models/Phone")
module.exports = Phone;
module.exports.default = Phone;
module.exports.Phone = Phone;
module.exports.PhoneSchema = PhoneSchema;

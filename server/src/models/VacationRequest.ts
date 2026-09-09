/**
 * @module VacationRequest
 * 
 * Manages employee vacation requests with support for half-day (0.5) and full-day (1.0) values.
 */

import mongoose, { Schema, Model, HydratedDocument, Types, PopulatedDoc } from "mongoose";
import type { IUser } from "./User";
import type { IGroup } from "./Group";
import type { VacationValue } from "./Shift";

export type VacationRequestStatus = "pending" | "approved" | "rejected";

export interface IVacationRequest {
    _id?: Types.ObjectId;
    userId: PopulatedDoc<IUser, Types.ObjectId>;
    groupId: PopulatedDoc<IGroup, Types.ObjectId>;
    date: Date;
    vacationValue: VacationValue;
    status: VacationRequestStatus;
    notes?: string;
    reviewedBy?: PopulatedDoc<IUser, Types.ObjectId>;
    reviewedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

export type VacationRequestDocument = HydratedDocument<IVacationRequest>;
export type VacationRequestModel = Model<IVacationRequest>;

export const VacationRequestSchema = new Schema<IVacationRequest>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "VacationRequest userId is required"],
            index: true,
        },
        groupId: {
            type: Schema.Types.ObjectId,
            ref: "Group",
            required: [true, "VacationRequest groupId is required"],
            index: true,
        },
        date: {
            type: Date,
            required: [true, "VacationRequest date is required"],
            index: true,
        },
        vacationValue: {
            type: Number,
            enum: {
                values: [0.5, 1.0],
                message: "vacationValue must be either 0.5 or 1.0",
            },
            default: 1.0,
            required: [true, "vacationValue is required"],
        },
        status: {
            type: String,
            enum: {
                values: ["pending", "approved", "rejected"],
                message: "status must be pending, approved, or rejected",
            },
            default: "pending",
            required: true,
            index: true,
        },
        notes: {
            type: String,
            trim: true,
            maxlength: 500,
        },
        reviewedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        reviewedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

// Optimize lookups and prevent overlapping duplicate requests for the same date/user
VacationRequestSchema.index({ groupId: 1, date: 1 });
VacationRequestSchema.index({ userId: 1, status: 1 });
VacationRequestSchema.index({ userId: 1, date: 1 });

const VacationRequest: VacationRequestModel =
    (mongoose.models.VacationRequest as VacationRequestModel) ||
    mongoose.model<IVacationRequest, VacationRequestModel>("VacationRequest", VacationRequestSchema);

export { VacationRequest };
export default VacationRequest;

// CommonJS compatibility
module.exports = VacationRequest;
module.exports.default = VacationRequest;
module.exports.VacationRequest = VacationRequest;
module.exports.VacationRequestSchema = VacationRequestSchema;

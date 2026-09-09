/**
 * @module Shift
 * 
 * Defines the Shift model representing individual shift assignments.
 * Supports half-day (0.5) and full-day (1.0) vacation tracking.
 */

import mongoose, { Schema, Model, HydratedDocument, Types, PopulatedDoc } from "mongoose";
import type { IUser } from "./User";
import type { IGroup } from "./Group";

export type VacationValue = 0.5 | 1.0;

export interface IShift {
    _id?: Types.ObjectId;
    userId: PopulatedDoc<IUser, Types.ObjectId>;
    groupId?: PopulatedDoc<IGroup, Types.ObjectId>;
    date: Date;
    shiftTypeId: Types.ObjectId;
    vacationDeducted?: boolean;
    vacationValue?: VacationValue;
    createdAt?: Date;
    updatedAt?: Date;
}

export type ShiftDocument = HydratedDocument<IShift>;
export type ShiftModel = Model<IShift>;

export const ShiftSchema = new Schema<IShift>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Shift userId is required"],
            index: true,
        },
        groupId: {
            type: Schema.Types.ObjectId,
            ref: "Group",
            index: true,
        },
        date: {
            type: Date,
            required: [true, "Shift date is required"],
            index: true,
        },
        shiftTypeId: {
            type: Schema.Types.ObjectId,
            required: [true, "Shift shiftTypeId is required"],
        },
        vacationDeducted: {
            type: Boolean,
            default: false,
        },
        vacationValue: {
            type: Number,
            enum: {
                values: [0.5, 1.0],
                message: "vacationValue must be either 0.5 or 1.0",
            },
            default: 1.0,
        },
    },
    { timestamps: true }
);

// Compound indexes for user shift queries and calendar lookups
ShiftSchema.index({ userId: 1, date: 1 });
ShiftSchema.index({ groupId: 1, date: 1 });

const Shift: ShiftModel =
    (mongoose.models.Shift as ShiftModel) ||
    mongoose.model<IShift, ShiftModel>("Shift", ShiftSchema);

export { Shift };
export default Shift;

// CommonJS compatibility
module.exports = Shift;
module.exports.default = Shift;
module.exports.Shift = Shift;
module.exports.ShiftSchema = ShiftSchema;

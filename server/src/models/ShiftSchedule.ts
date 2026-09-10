/**
 * @module ShiftSchedule
 * 
 * Manages the planned assignments for a group over a specific period.
 * Handles publishing status and tracks vacation day consumption for shift assignments.
 */

import mongoose, { Schema, Model, HydratedDocument, Types, PopulatedDoc } from "mongoose";
import type { IGroup } from "./Group";
import type { IUser } from "./User";

/**
 * Interface representing a single shift assignment within a schedule.
 */
export interface IShiftAssignment {
    _id?: Types.ObjectId;
    userId: PopulatedDoc<IUser, Types.ObjectId>;
    date: Date;
    shiftTypeId: Types.ObjectId;
    vacationDeducted?: boolean;
    vacationValue?: 0.5 | 1.0;
}

/**
 * Interface representing a ShiftSchedule document.
 */
export interface IShiftSchedule {
    groupId: PopulatedDoc<IGroup, Types.ObjectId>;
    startDate: Date;
    endDate: Date;
    isPublished?: boolean;
    shifts: IShiftAssignment[];
    createdAt?: Date;
    updatedAt?: Date;
}

export type ShiftScheduleDocument = HydratedDocument<IShiftSchedule>;
export type ShiftScheduleModel = Model<IShiftSchedule>;

const ShiftAssignmentSchema = new Schema<IShiftAssignment>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Shift userId is required"],
        },
        date: {
            type: Date,
            required: [true, "Shift date is required"],
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
    { _id: true },
);

const ShiftScheduleSchema = new Schema<IShiftSchedule>(
    {
        groupId: {
            type: Schema.Types.ObjectId,
            ref: "Group",
            required: [true, "Group reference is required"],
        },
        startDate: {
            type: Date,
            required: [true, "Start date is required"],
        },
        endDate: {
            type: Date,
            required: [true, "End date is required"],
        },
        isPublished: {
            type: Boolean,
            default: false,
        },
        shifts: {
            type: [ShiftAssignmentSchema],
            default: [],
        },
    },
    {
        timestamps: true,
    },
);

// Ensures each group has only one schedule starting on a given date.
ShiftScheduleSchema.index({ groupId: 1, startDate: 1 }, { unique: true });

// Optimizes queries looking for active published schedules covering a specific date range
ShiftScheduleSchema.index({ groupId: 1, isPublished: 1, startDate: 1, endDate: 1 });

// Multikey index for shift assignment lookup and vacation balance calculations
ShiftScheduleSchema.index({ groupId: 1, isPublished: 1, "shifts.userId": 1 });

const ShiftSchedule: ShiftScheduleModel =
    (mongoose.models.ShiftSchedule as ShiftScheduleModel) ||
    mongoose.model<IShiftSchedule, ShiftScheduleModel>("ShiftSchedule", ShiftScheduleSchema);

export { ShiftSchedule, ShiftScheduleSchema, ShiftAssignmentSchema };
export default ShiftSchedule;

// CommonJS compatibility for require("../models/ShiftSchedule")
module.exports = ShiftSchedule;
module.exports.default = ShiftSchedule;
module.exports.ShiftSchedule = ShiftSchedule;
module.exports.ShiftScheduleSchema = ShiftScheduleSchema;
module.exports.ShiftAssignmentSchema = ShiftAssignmentSchema;

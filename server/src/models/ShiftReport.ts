/**
 * @module ShiftReport
 * 
 * Captures the operational history and tasks completed during a specific shift.
 * Reports are used for knowledge transfer between shifts and historical logging.
 */

import mongoose, { Schema, Model, HydratedDocument, Types, PopulatedDoc } from "mongoose";
import type { IGroup } from "./Group";
import type { IUser } from "./User";

/**
 * Interface representing an attendee in a shift report.
 */
export interface IShiftReportAttendee {
    _id?: Types.ObjectId;
    userId?: PopulatedDoc<IUser, Types.ObjectId>;
    name?: string;
    isManual?: boolean;
}

/**
 * Interface representing a ShiftReport document.
 */
export interface IShiftReport {
    groupId: PopulatedDoc<IGroup, Types.ObjectId>;
    title: string;
    date: Date;
    startTime: string;
    endTime: string;
    previousTasks?: string;
    currentTasks?: string;
    attendees: IShiftReportAttendee[];
    isLocked?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

export type ShiftReportDocument = HydratedDocument<IShiftReport>;
export type ShiftReportModel = Model<IShiftReport>;

const ShiftReportAttendeeSchema = new Schema<IShiftReportAttendee>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        name: {
            type: String,
            trim: true,
        },
        isManual: {
            type: Boolean,
            default: false,
        },
    },
    { _id: true },
);

const ShiftReportSchema = new Schema<IShiftReport>(
    {
        groupId: {
            type: Schema.Types.ObjectId,
            ref: "Group",
            required: [true, "Group reference is required"],
        },
        title: {
            type: String,
            required: [true, "Report title is required"],
            trim: true,
        },
        date: {
            type: Date,
            required: [true, "Report date is required"],
        },
        startTime: {
            type: String,
            required: [true, "Start time is required"],
        },
        endTime: {
            type: String,
            required: [true, "End time is required"],
        },
        previousTasks: {
            type: String,
            default: "",
        },
        currentTasks: {
            type: String,
            default: "",
        },
        attendees: {
            type: [ShiftReportAttendeeSchema],
            default: [],
        },
        isLocked: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    },
);

// Compound indexes for temporal report filtering, latest report inheritance, and cron idempotency
ShiftReportSchema.index({ groupId: 1, date: -1, startTime: -1 });
ShiftReportSchema.index({ groupId: 1, date: -1, _id: -1 });
ShiftReportSchema.index({ groupId: 1, date: -1 });
ShiftReportSchema.index({ groupId: 1, startTime: -1 });
ShiftReportSchema.index({ groupId: 1, title: 1 });

const ShiftReport: ShiftReportModel =
    (mongoose.models.ShiftReport as ShiftReportModel) ||
    mongoose.model<IShiftReport, ShiftReportModel>("ShiftReport", ShiftReportSchema);

export { ShiftReport, ShiftReportSchema, ShiftReportAttendeeSchema };
export default ShiftReport;

// CommonJS compatibility for require("../models/ShiftReport")
module.exports = ShiftReport;
module.exports.default = ShiftReport;
module.exports.ShiftReport = ShiftReport;
module.exports.ShiftReportSchema = ShiftReportSchema;
module.exports.ShiftReportAttendeeSchema = ShiftReportAttendeeSchema;

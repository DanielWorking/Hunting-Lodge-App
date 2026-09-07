/**
 * @module Group
 * 
 * Defines the Group model which represents an organizational unit or team.
 * Groups have their own settings, such as shift types, time slots, and members.
 * They also manage their own reporting configurations and resource tags.
 */

import mongoose, { Schema, Model, HydratedDocument, Types, PopulatedDoc } from "mongoose";
import type { IUser } from "./User";

/**
 * Interface for Shift Types within a group.
 */
export interface IShiftType {
    _id?: Types.ObjectId;
    name: string;
    color: string;
    isVacation?: boolean;
}

/**
 * Interface for Time Slots within a group.
 */
export interface ITimeSlot {
    _id?: Types.ObjectId;
    name: string;
    startTime: string;
    endTime: string;
    linkedShiftTypes: Types.ObjectId[];
}

/**
 * Interface for Group Settings.
 */
export interface IGroupSettings {
    shiftTypes: IShiftType[];
    timeSlots: ITimeSlot[];
}

/**
 * Interface representing a Group document.
 */
export interface IGroup {
    name: string;
    members: (PopulatedDoc<IUser, Types.ObjectId> | string)[];
    settings: IGroupSettings;
    siteTags: string[];
    createdAt?: Date;
    updatedAt?: Date;
}

export type GroupDocument = HydratedDocument<IGroup>;
export type GroupModel = Model<IGroup>;

/**
 * Schema for Shift Types within a group.
 */
const ShiftTypeSchema = new Schema<IShiftType>({
    name: {
        type: String,
        required: [true, "Shift type name is required"],
        trim: true,
    },
    color: {
        type: String,
        required: [true, "Shift type color is required"],
        default: "#1976d2",
        match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Invalid hex color format (e.g. #1976d2)"],
    },
    isVacation: {
        type: Boolean,
        default: false,
    },
});

/**
 * Schema for Time Slots within a group.
 */
const TimeSlotSchema = new Schema<ITimeSlot>({
    name: {
        type: String,
        required: [true, "Time slot name is required"],
        trim: true,
    },
    startTime: {
        type: String,
        required: [true, "Start time is required"],
        match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid start time format. Must be 24-hour HH:mm (e.g. 08:00)"],
    },
    endTime: {
        type: String,
        required: [true, "End time is required"],
        match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid end time format. Must be 24-hour HH:mm (e.g. 16:00)"],
    },
    linkedShiftTypes: [
        {
            type: Schema.Types.ObjectId,
        },
    ],
});

/**
 * Main Group Schema.
 */
const GroupSchema = new Schema<IGroup>(
    {
        name: {
            type: String,
            required: [true, "Group name is required"],
            unique: true,
            trim: true,
        },
        members: {
            type: [
                {
                    type: Schema.Types.ObjectId,
                    ref: "User",
                },
            ],
            default: [],
        },
        settings: {
            shiftTypes: {
                type: [ShiftTypeSchema],
                default: [],
            },
            timeSlots: {
                type: [TimeSlotSchema],
                default: [],
            },
        },
        siteTags: {
            type: [String],
            default: ["General"],
        },
    },
    { timestamps: true },
);

const Group: GroupModel = (mongoose.models.Group as GroupModel) || mongoose.model<IGroup, GroupModel>("Group", GroupSchema);

export { Group, GroupSchema, ShiftTypeSchema, TimeSlotSchema };
export default Group;

// CommonJS compatibility for require("../models/Group")
module.exports = Group;
module.exports.default = Group;
module.exports.Group = Group;
module.exports.GroupSchema = GroupSchema;
module.exports.ShiftTypeSchema = ShiftTypeSchema;
module.exports.TimeSlotSchema = TimeSlotSchema;

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

/**
 * No time slot may link a vacation shift type. A report's automatic attendees are the members on
 * a shift type linked to its time slot, so a linked vacation type would list people who are off
 * as on duty. Checked on every save, whichever request changed the settings: linking a vacation
 * type to a slot, or marking an already linked shift type as vacation.
 */
GroupSchema.pre("validate", function () {
    const shiftTypes = this.settings?.shiftTypes ?? [];
    const vacationTypeNames = new Map(
        shiftTypes.filter((type) => type.isVacation && type._id).map((type) => [String(type._id), type.name]),
    );
    if (vacationTypeNames.size === 0) return;

    (this.settings?.timeSlots ?? []).forEach((slot, index) => {
        const linkedVacationTypes = (slot.linkedShiftTypes ?? [])
            .map(String)
            .filter((id) => vacationTypeNames.has(id))
            .map((id) => `"${vacationTypeNames.get(id)}"`);
        if (linkedVacationTypes.length > 0) {
            this.invalidate(
                `settings.timeSlots.${index}.linkedShiftTypes`,
                `Time slot "${slot.name}" cannot be linked to the vacation shift type ${linkedVacationTypes.join(", ")}`,
            );
        }
    });
});

const Group: GroupModel = (mongoose.models.Group as GroupModel) || mongoose.model<IGroup, GroupModel>("Group", GroupSchema);

export { Group, GroupSchema, ShiftTypeSchema, TimeSlotSchema };
export default Group;

/**
 * @module Types
 *
 * Defines the core data structures and types used throughout the client application.
 * Fully synchronized with MongoDB Mongoose Backend Schemas.
 * This includes user profiles, group management, shift configurations, reports, schedules, and site/phone data.
 */

/**
 * Defines the available roles a user can hold within a group.
 * - 'member': Standard group participant.
 * - 'shift_manager': Participant with administrative permissions for shift management.
 */
export type GroupRole = 'member' | 'shift_manager';

/**
 * Represents a user's membership within a specific group.
 *
 * This object is embedded within the User profile to track which groups
 * they belong to and their respective permissions.
 */
export interface GroupMembership {
    /** The unique identifier of the group. */
    groupId: string;
    /** The role assigned to the user in this group. */
    role: GroupRole;
    /** Optional sorting order for the group in the user's view. */
    order?: number;
    /** Optional group display name when populated or aliased. */
    name?: string;
    /** Optional group name alias. */
    groupName?: string;
}

/**
 * Represents a registered user in the system.
 */
export interface User {
    /** MongoDB primary key identifier. */
    _id: string;
    /** Legacy identifier alias. */
    id?: string;
    /** The user's system username. */
    username: string;
    /** The display name shown in the UI. */
    displayName?: string;
    /** The user's contact email address. */
    email?: string;
    /** List of groups the user is a member of. */
    groups: GroupMembership[];
    /** ISO timestamp of the last login (optional for new accounts). */
    lastLogin?: string;
    /** Whether the account is currently enabled. */
    isActive: boolean;
    /** Remaining vacation days/hours. */
    vacationBalance: number;
    /** List of favorite phone IDs. */
    favoritePhones?: string[];
    /** ISO timestamp of creation. */
    createdAt?: string;
    /** ISO timestamp of last update. */
    updatedAt?: string;
}

/**
 * Defines a type of shift that can be scheduled.
 */
export interface ShiftType {
    /** Unique ID of the shift type. */
    _id: string;
    /** Descriptive name (e.g., 'Morning', 'Night'). */
    name: string;
    /** Hex color code for UI representation. */
    color: string;
    /** If true, this shift type counts as vacation time. */
    isVacation: boolean;
}

/**
 * Represents a specific time window within a day for scheduling.
 */
export interface TimeSlot {
    /** Unique ID of the time slot. */
    _id: string;
    /** Descriptive name (e.g., '08:00 - 16:00'). */
    name: string;
    /** ISO 8601 or HH:mm formatted start time. */
    startTime: string;
    /** ISO 8601 or HH:mm formatted end time. */
    endTime: string;
    /** IDs of ShiftTypes that are applicable to this time slot. */
    linkedShiftTypes: string[];
}

/**
 * Configuration settings specific to a group's scheduling logic.
 */
export interface GroupSettings {
    /** Custom shift types defined by the group. */
    shiftTypes: ShiftType[];
    /** Custom time slots defined by the group. */
    timeSlots: TimeSlot[];
}

/**
 * Represents a group (or "Lodge") within the system.
 */
export interface Group {
    /** MongoDB primary key identifier. */
    _id: string;
    /** Legacy identifier alias. */
    id?: string;
    /** Name of the group. */
    name: string;
    /** Array of user IDs belonging to this group. */
    members: string[];
    /** Dynamic count of users assigned to this group. */
    userCount?: number;
    /** ISO timestamp of when the group was created. */
    createdAt: string;
    /** ISO timestamp of last update. */
    updatedAt?: string;
    /** Group-specific configuration for shifts and slots. */
    settings?: GroupSettings;
    /** Array of tags used for categorizing group-specific content. */
    siteTags?: string[];
}

/**
 * Represents an attendee in a shift report.
 */
export interface ShiftReportAttendee {
    /** Reference to the User ID. */
    userId?: string;
    /** Name of the attendee stored for historical records. */
    name?: string;
    /** Indicates if attendee was added manually or pulled from the schedule. */
    isManual?: boolean;
}

/**
 * Represents an operational shift report.
 */
export interface ShiftReport {
    /** MongoDB primary key identifier. */
    _id: string;
    /** Legacy identifier alias. */
    id?: string;
    /** Reference to the Group this report belongs to. */
    groupId: string;
    /** Descriptive title for the shift report. */
    title: string;
    /** Date the shift occurred. */
    date: string | Date;
    /** Start time in ISO format or HH:mm. */
    startTime: string;
    /** End time in ISO format or HH:mm. */
    endTime: string;
    /** Unfinished tasks inherited from the prior shift. */
    previousTasks: string;
    /** Rich text / HTML content detailing work performed. */
    currentTasks: string;
    /** List of personnel present during the shift. */
    attendees: ShiftReportAttendee[];
    /** If true, the report is locked against further editing. */
    isLocked: boolean;
    /** ISO timestamp of creation. */
    createdAt?: string;
    /** ISO timestamp of last update. */
    updatedAt?: string;
}

/**
 * Represents an individual shift assignment in a schedule.
 */
export interface ShiftAssignment {
    /** Unique identifier for the assignment subdocument. */
    _id?: string;
    /** Reference to the assigned User ID. */
    userId: string;
    /** Date of the shift assignment. */
    date: string | Date;
    /** Reference to the ShiftType ID from Group settings. */
    shiftTypeId: string;
    /** Tracks if this assignment has already deducted a vacation day. */
    vacationDeducted?: boolean;
}

/**
 * Represents a shift schedule period for a group.
 */
export interface ShiftSchedule {
    /** MongoDB primary key identifier. */
    _id: string;
    /** Legacy identifier alias. */
    id?: string;
    /** Reference to the Group this schedule belongs to. */
    groupId: string;
    /** The beginning of the schedule period. */
    startDate: string | Date;
    /** The end of the schedule period. */
    endDate: string | Date;
    /** If true, the schedule is published and visible to members. */
    isPublished: boolean;
    /** Array of assignment objects. */
    shifts: ShiftAssignment[];
    /** ISO timestamp of creation. */
    createdAt?: string;
    /** ISO timestamp of last update. */
    updatedAt?: string;
}

/**
 * Represents a bookmarked or managed website/resource.
 */
export interface SiteCard {
    /** MongoDB primary key identifier. */
    _id: string;
    /** Legacy identifier alias. */
    id?: string;
    /** The title of the site/resource. */
    title: string;
    /** The destination URL. */
    url: string;
    /** URL to an icon or representative image. */
    imageUrl?: string;
    /** Short explanation of what the resource is. */
    description: string;
    /** List of user IDs who have favorited this site. */
    favoritedBy?: string[];
    /** Transient flag for UI display of favorite status. */
    isFavorite?: boolean;
    /** The ID of the group this site belongs to. */
    groupId: string;
    /** ISO timestamp of creation. */
    createdAt: string;
    /** ISO timestamp of last update. */
    updatedAt?: string;
    /** Category tag assigned to this site. */
    tag?: string;
}

/**
 * Categorization of phone types supported by the directory.
 */
export type PhoneType = 'Black' | 'Red' | 'Mobile' | 'Landline';

/**
 * Represents an entry in the phone directory.
 */
export interface PhoneRow {
    /** MongoDB primary key identifier. */
    _id: string;
    /** Legacy identifier alias. */
    id?: string;
    /** List of phone numbers associated with this entry. */
    numbers: string[];
    /** The security or functional classification of the phone. */
    type: PhoneType;
    /** Detailed description of the phone's location or purpose. */
    description: string;
    /** Name of the person or entity associated with the number. */
    name: string;
    /** Whether the current user has favorited this entry. */
    isFavorite: boolean;
    /** ISO timestamp of creation. */
    createdAt?: string;
    /** ISO timestamp of last update. */
    updatedAt?: string;
}
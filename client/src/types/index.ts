/**
 * @module Types
 *
 * Defines the core data structures and types used throughout the client application.
 * This includes user profiles, group management, shift configurations, and site/phone data.
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
}

/**
 * Represents a registered user in the system.
 */
export interface User {
    /** Internal database ID. */
    _id?: string;
    /** Unique application ID. */
    id: string;
    /** The user's system username. */
    username: string;
    /** The display name shown in the UI. */
    displayName?: string;
    /** The user's contact email address. */
    email?: string;
    /** List of groups the user is a member of. */
    groups: GroupMembership[];
    /** ISO timestamp of the last login. */
    lastLogin: string;
    /** Whether the account is currently enabled. */
    isActive: boolean;
    /** Remaining vacation days/hours. */
    vacationBalance: number;
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
    /** Internal database ID. */
    _id?: string;
    /** Unique application ID. */
    id: string;
    /** Name of the group. */
    name: string;
    /** Array of user IDs belonging to this group. */
    members: string[];
    /** ISO timestamp of when the group was created. */
    createdAt: string;
    /** Group-specific configuration for shifts and slots. */
    settings?: GroupSettings;
    /** Email addresses that receive group reports. */
    reportEmails?: string[];
    /** Array of tags used for categorizing group-specific content. */
    siteTags?: string[];
}

/**
 * Represents a bookmarked or managed website/resource.
 */
export interface SiteCard {
    /** Internal database ID. */
    _id?: string;
    /** Unique application ID. */
    id: string;
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
    /** Internal database ID. */
    _id?: string;
    /** Unique application ID. */
    id: string;
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
}
// הגדרת תפקידים בתוך קבוצה
export type GroupRole = 'member' | 'shift_manager';

// אובייקט שמייצג חברות בקבוצה (בתוך המשתמש)
export interface GroupMembership {
    groupId: string;
    role: GroupRole;
    order?: number;
}

export interface User {
    _id?: string;
    id: string;
    username: string;
    groups: GroupMembership[];
    lastLogin: string;
    isActive: boolean;
    vacationBalance: number;
}

export interface ShiftType {
    _id: string;
    name: string;
    color: string;
    isVacation: boolean;
}

export interface TimeSlot {
    _id: string;
    name: string;
    startTime: string;
    endTime: string;
    linkedShiftTypes: string[];
}

export interface GroupSettings {
    shiftTypes: ShiftType[];
    timeSlots: TimeSlot[];
}

export interface Group {
    _id?: string;
    id: string;
    name: string;
    members: string[];
    createdAt: string;
    settings?: GroupSettings;
    reportEmails?: string[];
    siteTags?: string[]; // מערך התגיות של הקבוצה
}

export interface SiteCard {
    _id?: string;
    id: string;
    title: string;
    url: string;
    imageUrl: string;
    description: string;
    isFavorite: boolean;
    groupId: string;
    createdAt: string;
    tag?: string;
}

export type PhoneType = 'Black' | 'Red' | 'Mobile' | 'Landline';

export interface PhoneRow {
    _id?: string;
    id: string;
    numbers: string[];
    type: PhoneType;
    description: string;
    name: string;
    isFavorite: boolean;
}
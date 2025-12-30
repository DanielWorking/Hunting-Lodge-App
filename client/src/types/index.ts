export interface User {
    _id: string;
    id?: string; // לתמיכה לאחור
    name: string; // שדה חדש (במקום או בנוסף ל-username)
    email: string;
    username?: string; // אופציונלי - ייתכן שנשמור לתמיכה לאחור
    role: 'guest' | 'user' | 'admin' | string; // התפקיד במערכת
    group?: string | null; // מזהה הקבוצה (Singular) - המבנה החדש
    groups?: GroupMember[]; // המבנה הישן - נשאיר אותו אופציונלי כדי לא לשבור לוגיקה קיימת של Shift Manager
    ssoId?: string;
    phoneNumber?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface GroupMember {
    groupId: string;
    role: 'member' | 'shift_manager' | 'admin';
}

export interface Group {
    _id: string;
    id?: string; // לתמיכה לאחור
    name: string;
    description?: string;
    members?: string[]; // מערך של User IDs
    admins?: string[];
    sites?: string[];
    createdAt?: string;
    updatedAt?: string;
}

export interface Site {
    _id: string;
    id?: string;
    name: string;
    type: 'regular' | 'tactical'; // הוספנו תמיכה בטקטי
    coordinates?: {
        lat: number;
        lng: number;
    };
    description?: string;
    groupId?: string;
}

export interface Phone {
    _id: string;
    name: string;
    number: string;
    role: string; // e.g., "Mali", "Hamal"
    groupId?: string;
}

export interface Shift {
    _id: string;
    userId: string;
    userName: string;
    siteId: string;
    siteName: string;
    startTime: string; // ISO date string
    endTime: string;   // ISO date string
    type: string;      // e.g., "Morning", "Evening"
    groupId?: string;
}

export interface ShiftReport {
    _id: string;
    shiftId?: string;
    userId: string;
    reporterName: string;
    siteId: string;
    siteName: string;
    description: string;
    timestamp: string;
    status: 'normal' | 'incident' | 'maintenance';
    groupId?: string;
}
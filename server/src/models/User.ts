/**
 * @module User
 * 
 * Manages user identities, cross-group memberships, and personal preferences.
 * Handles roles within groups and tracks resource-related metrics like vacation balance.
 * 
 * Authentication Architecture:
 * User authentication and credentials (including passwords) are managed exclusively
 * via external SSO (Auth0 / OIDC). Passwords are never stored or hashed in MongoDB.
 * Local seed and test users (e.g. dov-member | member@test.local | Auth0 password: dov-member123)
 * map directly through OIDC token claims matching username/email.
 */

import mongoose, { Schema, Model, HydratedDocument, Types, PopulatedDoc } from "mongoose";
import type { IGroup } from "./Group";
import type { IPhone } from "./Phone";

export type UserRole = "member" | "shift_manager";

/**
 * Sub-document interface for a user's group membership.
 */
export interface IUserGroup {
    _id?: Types.ObjectId;
    groupId: PopulatedDoc<IGroup, Types.ObjectId>;
    role: UserRole;
    order: number;
}

/**
 * Interface representing a User document.
 */
export interface IUser {
    username: string;
    displayName?: string;
    email: string;
    ssoIssuer?: string;
    ssoSubject?: string;
    tokenVersion: number;
    groups: IUserGroup[];
    isActive: boolean;
    lastLogin?: string;
    vacationBalance: number;
    favoritePhones: (PopulatedDoc<IPhone, Types.ObjectId> | string)[];
    hasSeenWhatsNew?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

export type UserDocument = HydratedDocument<IUser>;
export type UserModel = Model<IUser>;

/**
 * Internal identity and session-revocation fields that must never leave the server:
 * the SSO issuer/subject pair fingerprints the identity-provider account, and
 * tokenVersion is the server-side revocation counter.
 */
export const SENSITIVE_USER_FIELDS = ["ssoIssuer", "ssoSubject", "tokenVersion"] as const;

const SENSITIVE_USER_FIELD_SET = new Set<string>(SENSITIVE_USER_FIELDS);

/**
 * Returns a response-safe copy of a user (hydrated document or plain/lean object)
 * without the SENSITIVE_USER_FIELDS. The input is not modified.
 */
export function toPublicUser(user: unknown): Record<string, unknown> {
    if (!user || typeof user !== "object") {
        return {};
    }
    const withToObject = user as { toObject?: () => Record<string, unknown> };
    const source: Record<string, unknown> = typeof withToObject.toObject === "function"
        ? withToObject.toObject()
        : { ...(user as Record<string, unknown>) };
    return Object.fromEntries(Object.entries(source).filter(([key]) => !SENSITIVE_USER_FIELD_SET.has(key)));
}

const UserSchema = new Schema<IUser>(
    {
        username: {
            type: String,
            required: [true, "Username is required"],
            unique: true,
            trim: true,
            minlength: [1, "Username cannot be empty"],
        },
        displayName: {
            type: String,
            trim: true,
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            trim: true,
            lowercase: true,
            match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
        },
        groups: [
            {
                groupId: {
                    type: Schema.Types.ObjectId,
                    ref: "Group",
                    required: true,
                },
                role: {
                    type: String,
                    enum: ["member", "shift_manager"],
                    default: "member",
                    required: true,
                },
                order: {
                    type: Number,
                    default: 0,
                },
            },
        ],
        isActive: {
            type: Boolean,
            default: true,
        },
        lastLogin: {
            type: String,
        },
        vacationBalance: {
            type: Number,
            default: 18,
            min: [0, "Vacation balance cannot be negative"],
        },
        favoritePhones: {
            type: [
                {
                    type: Schema.Types.ObjectId,
                    ref: "Phone",
                },
            ],
            default: [],
        },
        hasSeenWhatsNew: {
            type: Boolean,
            default: false,
        },
        ssoIssuer: {
            type: String,
            trim: true,
        },
        ssoSubject: {
            type: String,
            trim: true,
        },
        tokenVersion: {
            type: Number,
            default: 0,
            required: true,
        },
    },
    {
        timestamps: true,
        // Defense in depth: hydrated user documents passed to res.json() never serialize internal fields
        toJSON: {
            transform: (_doc, ret: Record<string, unknown>) => {
                for (const field of SENSITIVE_USER_FIELDS) {
                    delete ret[field];
                }
                return ret;
            },
        },
    },
);

// Optimize multi-key lookups for group-filtered user listings and member count aggregations
UserSchema.index({ "groups.groupId": 1 });
UserSchema.index({ "groups.groupId": 1, "groups.order": 1 });
UserSchema.index(
    { ssoIssuer: 1, ssoSubject: 1 },
    {
        unique: true,
        partialFilterExpression: {
            ssoIssuer: { $type: "string", $gt: "" },
            ssoSubject: { $type: "string", $gt: "" },
        },
    }
);

const User: UserModel = (mongoose.models.User as UserModel) || mongoose.model<IUser, UserModel>("User", UserSchema);

export { User, UserSchema };
export default User;

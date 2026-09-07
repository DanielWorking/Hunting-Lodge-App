/**
 * @module Types/Express
 *
 * Declaration merging for Express namespace.
 * Strongly types `req.user` with OIDC identity profile attributes
 * and `req.auth` with decoded JWT token payload.
 */

import { DecodedTokenPayload } from "../utils/jwt";
import { Types } from "mongoose";
import type { AuthUser } from "../utils/authHelpers";

export interface OidcGroupMembership {
    readonly groupId?: Types.ObjectId | string | { readonly _id?: Types.ObjectId | string; readonly name?: string };
    readonly role?: "member" | "shift_manager" | string;
    readonly order?: number;
}

export interface OidcUserProfile extends AuthUser {
    readonly _id?: Types.ObjectId | string;
    readonly id?: string;
    readonly username: string;
    readonly displayName?: string;
    readonly email: string;
    readonly groups?: ReadonlyArray<OidcGroupMembership>;
    readonly isActive?: boolean;
    readonly lastLogin?: string;
    readonly vacationBalance?: number;
    readonly favoritePhones?: ReadonlyArray<Types.ObjectId | string>;
    readonly [key: string]: unknown;
}

declare global {
    namespace Express {
        interface User extends OidcUserProfile {}
        interface Request {
            user?: Express.User;
            auth?: DecodedTokenPayload;
        }
    }
}



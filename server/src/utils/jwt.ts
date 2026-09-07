import jwt from "jsonwebtoken";
import config from "../config";

/**
 * Input interface representing user attributes required for token creation.
 */
export interface UserTokenInput {
    readonly _id?: { toString(): string } | string | null;
    readonly id?: string | null;
    readonly username: string;
    readonly email?: string | null;
}

/**
 * Payload encoded inside the generated JSON Web Token.
 */
export interface UserTokenPayload {
    readonly userId: string;
    readonly username: string;
    readonly email: string;
}

/**
 * Decoded payload returned when verifying a signed JSON Web Token.
 */
export interface DecodedTokenPayload extends jwt.JwtPayload {
    readonly userId?: string;
    readonly username?: string;
    readonly email?: string;
}

/**
 * Generates a signed JSON Web Token for an authenticated user.
 *
 * @param user - The user entity or payload containing identification details.
 * @returns The signed JWT string.
 * @throws {Error} If user object is missing.
 */
export function generateToken(user: UserTokenInput): string {
    if (!user) {
        throw new Error("Cannot generate token: user object is required");
    }

    const userId = user._id != null ? user._id.toString() : (user.id ?? "");
    const payload: UserTokenPayload = {
        userId,
        username: user.username || "",
        email: user.email || "",
    };

    const secret = config.jwt.secret;
    const expiresIn = (config.jwt.expiresIn || "7d") as jwt.SignOptions["expiresIn"];

    return jwt.sign(payload, secret, {
        expiresIn,
    });
}

/**
 * Verifies and decodes a signed JSON Web Token.
 *
 * @template T - Extends jwt.JwtPayload, defaults to DecodedTokenPayload.
 * @param token - The JWT string to verify.
 * @returns The decoded token payload.
 * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError} If verification fails.
 */
export function verifyToken<T extends jwt.JwtPayload = DecodedTokenPayload>(token: string): T {
    const decoded = jwt.verify(token, config.jwt.secret);
    if (typeof decoded === "string") {
        throw new jwt.JsonWebTokenError("Invalid token payload format");
    }
    return decoded as T;
}

export default {
    generateToken,
    verifyToken,
};

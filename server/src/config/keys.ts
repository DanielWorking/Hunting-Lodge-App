/**
 * @module Config/Keys
 *
 * Cryptographic secret keys and authentication token lifespan settings.
 */

import "./env";
import { isProd, deepFreeze } from "./env";
import type { JwtConfig } from "../types/config";

if (isProd && !process.env.JWT_SECRET) {
    console.error("❌ CRITICAL CONFIGURATION ERROR: MISSING JWT_SECRET IN PRODUCTION");
    process.exit(1);
} else if (!isProd && !process.env.JWT_SECRET) {
    console.warn("⚠️  [Dev Warning] JWT_SECRET is not set. Using fallback development secret.");
}

const rawJwtConfig: JwtConfig = {
    secret: process.env.JWT_SECRET || (isProd ? "" : "dev-jwt-secret-hunting-lodge-change-in-production"),
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
};

type ExportedJwtConfig = JwtConfig & {
    readonly default: JwtConfig;
    readonly jwtConfig: JwtConfig;
    readonly keys: JwtConfig;
    readonly secret: string;
    readonly expiresIn: string;
};

const combinedKeys: ExportedJwtConfig = {
    ...rawJwtConfig,
    default: rawJwtConfig,
    jwtConfig: rawJwtConfig,
    keys: rawJwtConfig,
    secret: rawJwtConfig.secret,
    expiresIn: rawJwtConfig.expiresIn,
};

const exportedKeys: ExportedJwtConfig = deepFreeze(combinedKeys);

export = exportedKeys;

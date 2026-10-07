/**
 * @module Config/Keys
 *
 * Cryptographic secret keys and authentication token lifespan settings.
 */

import "./env";
import { isProd, isPreProd, isNonProd, deepFreeze, validatedEnv } from "./env";
import type { JwtConfig } from "../types/config";

if ((isProd || isPreProd) && !validatedEnv.JWT_SECRET) {
    console.error("❌ CRITICAL CONFIGURATION ERROR: MISSING JWT_SECRET IN PREPROD/PROD");
    process.exit(1);
} else if (isNonProd && !process.env.JWT_SECRET) {
    console.warn("⚠️  [Nonprod Warning] JWT_SECRET is not set. Using fallback development secret.");
}

const rawJwtConfig: JwtConfig = {
    secret: validatedEnv.JWT_SECRET || (isProd || isPreProd ? "" : "nonprod-jwt-secret-hunting-lodge-change-in-preprod-prod"),
    expiresIn: validatedEnv.JWT_EXPIRES_IN || "7d",
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

/**
 * @module Config/Env
 *
 * Environment bootstrap and initialization module.
 * Loads appropriate .env files with hierarchical precedence (.env.development.local > .env.development > .env)
 * before any consumer configuration objects are instantiated.
 */

import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// Determine execution environment
export const nodeEnv: string = process.env.NODE_ENV || "development";
export const isProd: boolean = nodeEnv === "production";
export const isDev: boolean = nodeEnv === "development";
export const isTest: boolean = nodeEnv === "test";

// Base server root directory (two levels up from src/config)
export const rootServerDir: string = path.resolve(__dirname, "../..");

// Environment file resolution paths
const customEnvPath: string | null = process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : null;
const devEnvPath: string = path.join(rootServerDir, ".env.development");
const prodEnvPath: string = path.join(rootServerDir, ".env.production");
const standardEnvPath: string = path.join(rootServerDir, ".env");

if (customEnvPath && fs.existsSync(customEnvPath)) {
    dotenv.config({ path: customEnvPath });
} else if (isDev && fs.existsSync(devEnvPath)) {
    dotenv.config({ path: devEnvPath });
    const localDevEnvPath: string = path.join(rootServerDir, ".env.development.local");
    if (fs.existsSync(localDevEnvPath)) {
        dotenv.config({ path: localDevEnvPath, override: true });
    }
} else if (isProd && fs.existsSync(prodEnvPath)) {
    dotenv.config({ path: prodEnvPath });
} else if (fs.existsSync(standardEnvPath)) {
    dotenv.config({ path: standardEnvPath });
} else {
    dotenv.config();
}

/**
 * Parses the TRUST_PROXY environment variable into a valid Express 'trust proxy' setting.
 * Correctly handles whitespace-only strings, booleans, numeric hop counts, and CIDR ranges.
 */
export function parseTrustProxy(val: string | undefined | null): boolean | number | string {
    if (val === undefined || val === null) {
        return 1;
    }
    const trimmed = String(val).trim();
    if (trimmed === "") {
        return 1;
    }
    if (trimmed.toLowerCase() === "true") return true;
    if (trimmed.toLowerCase() === "false") return false;
    const num = Number(trimmed);
    if (!isNaN(num) && Number.isInteger(num) && num >= 0) return num;
    return trimmed;
}

/**
 * Deeply freezes an object to enforce strict runtime immutability.
 * Uses a WeakSet to guard against cyclic structures and prevents stack overflows.
 */
export function deepFreeze<T extends object>(obj: T, seen = new WeakSet<object>()): Readonly<T> {
    if (seen.has(obj)) {
        return obj;
    }
    seen.add(obj);
    Object.freeze(obj);
    for (const key of Object.getOwnPropertyNames(obj)) {
        const val = (obj as Record<string, unknown>)[key];
        if (val !== null && (typeof val === "object" || typeof val === "function") && !Object.isFrozen(val)) {
            deepFreeze(val as object, seen);
        }
    }
    return obj;
}

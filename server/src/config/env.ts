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
const devConfigPath: string = path.join(rootServerDir, ".env.config.development");
const devSecretPath: string = path.join(rootServerDir, ".env.development");
const prodConfigPath: string = path.join(rootServerDir, ".env.config.production");
const prodSecretPath: string = path.join(rootServerDir, ".env.production");
const standardConfigPath: string = path.join(rootServerDir, ".env.config");
const standardSecretPath: string = path.join(rootServerDir, ".env");

if (customEnvPath && fs.existsSync(customEnvPath)) {
    dotenv.config({ path: customEnvPath });
} else if (isDev) {
    // 1. Load non-sensitive configuration defaults (ConfigMap)
    if (fs.existsSync(devConfigPath)) {
        dotenv.config({ path: devConfigPath });
    }
    // 2. Load sensitive credentials (Secret), overriding or supplementing config
    if (fs.existsSync(devSecretPath)) {
        dotenv.config({ path: devSecretPath, override: true });
    }
    // 3. Optional local developer overrides (.env.development.local)
    const localDevEnvPath: string = path.join(rootServerDir, ".env.development.local");
    if (fs.existsSync(localDevEnvPath)) {
        dotenv.config({ path: localDevEnvPath, override: true });
    }
} else if (isProd) {
    if (fs.existsSync(prodConfigPath)) {
        dotenv.config({ path: prodConfigPath });
    }
    if (fs.existsSync(prodSecretPath)) {
        dotenv.config({ path: prodSecretPath, override: true });
    }
} else {
    if (fs.existsSync(standardConfigPath)) {
        dotenv.config({ path: standardConfigPath });
    }
    if (fs.existsSync(standardSecretPath)) {
        dotenv.config({ path: standardSecretPath, override: true });
    }
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

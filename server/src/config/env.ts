/**
 * @module Config/Env
 *
 * Environment bootstrap, hierarchical loading, and Zod schema validation.
 * Supports tri-environment architecture (nonprod, preprod, prod) with deterministic
 * precedence and runtime immutability.
 */

import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { z } from "zod";
import type { AppEnv } from "../types/config";

export type { AppEnv };

// Base server root directory (two levels up from src/config)
export const rootServerDir: string = path.resolve(__dirname, "../..");

/**
 * Detects the normalized tri-environment AppEnv ("nonprod" | "preprod" | "prod")
 * from APP_ENV or falls back to NODE_ENV.
 */
export function detectAppEnv(rawAppEnv?: string, rawNodeEnv?: string): AppEnv {
    const candidate = (rawAppEnv || "").trim().toLowerCase();
    if (candidate === "prod" || candidate === "production") return "prod";
    if (candidate === "preprod" || candidate === "staging" || candidate === "stage") return "preprod";
    if (candidate === "nonprod" || candidate === "dev" || candidate === "development" || candidate === "test") return "nonprod";

    if (rawNodeEnv === "production") {
        return "prod";
    }
    return "nonprod";
}

// Initial environment detection before loading files
const initialAppEnv = detectAppEnv(process.env.APP_ENV, process.env.NODE_ENV);
// An explicitly set NODE_ENV (shell, container, test runner) wins over the env files
const explicitNodeEnv = process.env.NODE_ENV;

// Hierarchical .env file loading:
// 1. Explicit process.env.ENV_FILE takes highest precedence
const customEnvPath = process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : null;

if (customEnvPath && fs.existsSync(customEnvPath)) {
    dotenv.config({ path: customEnvPath });
} else {
    // 2. Base fallback file (lowest precedence)
    const envServerDir = path.join(rootServerDir, "../env/server");
    const standardSecret = path.join(envServerDir, ".env");
    if (fs.existsSync(standardSecret)) dotenv.config({ path: standardSecret });

    // 3. Tri-environment config/secrets (.env.config.<env>, .env.secret.<env>)
    const envConfig = path.join(envServerDir, `.env.config.${initialAppEnv}`);
    if (fs.existsSync(envConfig)) dotenv.config({ path: envConfig, override: true });

    const envSecret = path.join(envServerDir, `.env.secret.${initialAppEnv}`);
    if (fs.existsSync(envSecret)) dotenv.config({ path: envSecret, override: true });

    // 4. Local developer overrides (.env.<env>.local)
    const envLocal = path.join(envServerDir, `.env.${initialAppEnv}.local`);
    if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal, override: true });
}

if (explicitNodeEnv) {
    (process.env as Record<string, string | undefined>).NODE_ENV = explicitNodeEnv;
}

// Final resolved environment variables after loading
export const nodeEnv: string = process.env.NODE_ENV || "development";
export const appEnv: AppEnv = detectAppEnv(process.env.APP_ENV, nodeEnv);

// Tri-environment helper flags
export const isNonProd: boolean = appEnv === "nonprod";
export const isPreProd: boolean = appEnv === "preprod";
export const isProd: boolean = appEnv === "prod";

/**
 * Zod schema for validating server environment variables.
 */
export const serverEnvSchema = z.object({
    APP_ENV: z.enum(["nonprod", "preprod", "prod"]).default("nonprod"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    // No defaults: every environment must provide its own database and signing secret
    MONGO_URI: z.string().optional(),
    JWT_SECRET: z.string().optional(),
    JWT_EXPIRES_IN: z.string().default("7d"),
    SSO_ISSUER_URL: z.string().optional(),
    SSO_CLIENT_ID: z.string().optional(),
    SSO_CLIENT_SECRET: z.string().optional(),
    SSO_REDIRECT_URI: z.string().optional(),
    SSO_IDENTIFIER_FIELD: z.string().default("email"),
    SSO_COOKIE_SECRET: z.string().optional(),
    SSO_USE_PKCE: z.string().default("true"),
    SSO_COOKIE_SECURE: z.string().optional(),
    SSO_SAME_SITE: z.string().default("lax"),
    // No defaults: these identify the privileged root account and admin group, so a guessable
    // default (e.g. a user named "Super Admin") must never grant administrator rights
    SUPER_ADMIN_ID: z.string().optional(),
    SUPER_ADMIN_USERNAME: z.string().optional(),
    SUPER_ADMIN_EMAIL: z.string().optional(),
    SUPER_ADMIN_GROUP_NAME: z.string().optional(),
    CORS_ORIGIN: z.string().optional(),
    RATE_LIMIT_MAX: z.coerce.number().default(100),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
    TRUST_PROXY: z.string().optional(),
    // Developer diagnostics in 5xx bodies; validateServerEnv refuses it outside nonprod
    EXPOSE_ERROR_DETAILS: z.string().optional(),
    LOG_FORMAT: z.string().optional(),
    STATIC_FILES_PATH: z.string().optional(),
    SHIFT_REPORT_CRON_SCHEDULE: z.string().default("*/10 * * * *"),
    MONGO_AUTO_INDEX: z.string().optional(),
    MONGO_MAX_POOL_SIZE: z.string().optional(),
    MONGO_MIN_POOL_SIZE: z.string().optional(),
    MONGO_SERVER_SELECTION_TIMEOUT_MS: z.string().optional(),
    MONGO_SOCKET_TIMEOUT_MS: z.string().optional(),
    MONGO_HEARTBEAT_FREQUENCY_MS: z.string().optional(),
    MONGO_CONNECT_TIMEOUT_MS: z.string().optional(),
    MONGO_MAX_IDLE_TIME_MS: z.string().optional(),
});

export type ValidatedServerEnv = z.infer<typeof serverEnvSchema>;

export interface EnvValidationResult {
    valid: boolean;
    errors: string[];
    parsed?: ValidatedServerEnv;
}

/**
 * True for an http URL on this machine (localhost / 127.0.0.1). Local development has no TLS,
 * so this is the only place where nonprod may differ from preprod/prod.
 */
function isLocalHttpUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    } catch {
        return false;
    }
}

/** True when a boolean-like env value is switched on ("true", case-insensitive). */
export function isEnabledFlag(value: unknown): boolean {
    return typeof value === "string" && value.trim().toLowerCase() === "true";
}

/**
 * Validates the runtime environment. Every environment has the same requirements, so nonprod
 * behaves like production (no fallback secrets or databases); the exceptions are that nonprod
 * may use an http://localhost redirect URI for local development and may expose error details.
 * Missing or invalid variables halt execution when exitOnError is true.
 */
export function validateServerEnv(
    rawEnv: Record<string, unknown> = process.env,
    currentAppEnv: AppEnv = appEnv,
    exitOnError: boolean = true
): EnvValidationResult {
    const parseResult = serverEnvSchema.safeParse(rawEnv);
    const errors: string[] = [];

    if (!parseResult.success) {
        parseResult.error.issues.forEach((issue) => {
            errors.push(`${issue.path.join(".")}: ${issue.message}`);
        });
    }

    const mongoUri = typeof rawEnv.MONGO_URI === "string" ? rawEnv.MONGO_URI.trim() : "";
    if (!mongoUri) {
        errors.push("MONGO_URI: Database connection string is required");
    }
    const jwtSecret = typeof rawEnv.JWT_SECRET === "string" ? rawEnv.JWT_SECRET : "";
    if (!jwtSecret || jwtSecret.length < 32) {
        errors.push("JWT_SECRET: Must be at least 32 characters");
    }
    const ssoIssuer = typeof rawEnv.SSO_ISSUER_URL === "string" ? rawEnv.SSO_ISSUER_URL.trim() : "";
    if (!ssoIssuer || !ssoIssuer.startsWith("https://")) {
        errors.push("SSO_ISSUER_URL: Valid HTTPS URL is required");
    }
    if (!rawEnv.SSO_CLIENT_ID) {
        errors.push("SSO_CLIENT_ID: SSO Client ID is required");
    }
    if (!rawEnv.SSO_CLIENT_SECRET) {
        errors.push("SSO_CLIENT_SECRET: SSO Client Secret is required");
    }
    const ssoRedirect = typeof rawEnv.SSO_REDIRECT_URI === "string" ? rawEnv.SSO_REDIRECT_URI.trim() : "";
    const isAllowedLocalRedirect = currentAppEnv === "nonprod" && isLocalHttpUrl(ssoRedirect);
    if (!ssoRedirect || (!ssoRedirect.startsWith("https://") && !isAllowedLocalRedirect)) {
        errors.push("SSO_REDIRECT_URI: Valid HTTPS redirect URI is required (nonprod may use http://localhost)");
    }
    if (!rawEnv.SUPER_ADMIN_ID) {
        errors.push("SUPER_ADMIN_ID: Initial Super Admin ID is required");
    }
    if (!rawEnv.SUPER_ADMIN_GROUP_NAME) {
        errors.push("SUPER_ADMIN_GROUP_NAME: Super Admin group name is required");
    }
    // Like the localhost redirect above, error details are a nonprod-only allowance
    if (isEnabledFlag(rawEnv.EXPOSE_ERROR_DETAILS) && currentAppEnv !== "nonprod") {
        errors.push("EXPOSE_ERROR_DETAILS: Must not be enabled in preprod or prod");
    }

    if (errors.length > 0 && exitOnError) {
        console.error("\n==================================================================");
        console.error(`❌ CRITICAL CONFIGURATION ERROR: MISSING ${currentAppEnv.toUpperCase()} ENV VARIABLES`);
        console.error("==================================================================");
        console.error(`The application cannot start in ${currentAppEnv.toUpperCase()} mode without the following:\n`);
        errors.forEach((err) => {
            console.error(`  - ${err}`);
        });
        console.error(`\n👉 Please configure these in env/server/.env.config.${currentAppEnv} / env/server/.env.secret.${currentAppEnv} or your environment secrets.`);
        console.error("==================================================================\n");
        process.exit(1);
    }

    return {
        valid: errors.length === 0,
        errors,
        parsed: parseResult.success ? parseResult.data : undefined,
    };
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

// Initial validation on boot
const envValidation = validateServerEnv(process.env, appEnv, process.env.NODE_ENV !== "test");

export const validatedEnv = deepFreeze(
    envValidation.parsed || serverEnvSchema.parse(process.env)
);

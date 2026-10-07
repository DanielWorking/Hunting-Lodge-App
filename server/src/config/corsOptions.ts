/**
 * @module Config/CorsOptions
 *
 * Dynamic CORS configuration and origin resolution tailored per environment:
 * - nonprod: allows localhost dev servers, local loopbacks, and configured dev routes.
 * - preprod: strictly validates staging domains against whitelist; blocks localhost and wildcards.
 * - prod: strictly validates production origins with zero wildcard reflection and credentials safety.
 */

import type { CorsOptions } from "cors";
import type { AppEnv } from "./env";

export const DEFAULT_DEV_ORIGINS: ReadonlyArray<string> = Object.freeze([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
]);

/**
 * Resolves a list of allowed origins from configured environment origins.
 * Splits comma-delimited strings and trims whitespace.
 */
export function resolveConfiguredOrigins(configuredOrigins?: string | boolean): string[] {
    if (typeof configuredOrigins !== "string") {
        return [];
    }
    return configuredOrigins
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0 && origin !== "*");
}

/**
 * Validates whether an incoming origin is permitted for the given environment.
 */
export function isOriginAllowed(
    origin: string | undefined,
    appEnv: AppEnv,
    configuredOrigins?: string | boolean
): boolean {
    // Non-browser or same-origin requests (curl, server-to-server, health checks)
    if (!origin) {
        return true;
    }

    const configuredList = resolveConfiguredOrigins(configuredOrigins);

    if (appEnv === "nonprod") {
        // If explicitly set to boolean true in nonprod, allow all
        if (configuredOrigins === true) {
            return true;
        }
        // Allow localhost and local loopbacks
        if (DEFAULT_DEV_ORIGINS.includes(origin)) {
            return true;
        }
        try {
            const parsed = new URL(origin);
            if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
                return true;
            }
        } catch {
            return false;
        }
        // Check configured dev routes
        return configuredList.includes(origin);
    }

    if (appEnv === "preprod") {
        // Preprod: Staging parity - reject localhost and ensure explicit whitelist match
        if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
            return false;
        }
        return configuredList.includes(origin);
    }

    // Prod: Strict production validation - zero wildcard reflection, no localhost
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
        return false;
    }
    return configuredList.includes(origin);
}

/**
 * Creates Express CORS middleware options tailored to the current AppEnv.
 */
export function createCorsOptions(
    appEnv: AppEnv,
    configuredOrigins?: string | boolean
): CorsOptions {
    return {
        origin: (origin, callback) => {
            if (isOriginAllowed(origin, appEnv, configuredOrigins)) {
                callback(null, true);
            } else {
                callback(new Error(`CORS origin not allowed by ${appEnv} policy: ${origin}`), false);
            }
        },
        credentials: true,
        methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
        allowedHeaders: [
            "Authorization",
            "Content-Type",
            "X-Requested-With",
            "Accept",
            "Origin",
        ],
        exposedHeaders: ["Set-Cookie"],
        maxAge: 86400, // 24 hours preflight cache
    };
}

export default createCorsOptions;

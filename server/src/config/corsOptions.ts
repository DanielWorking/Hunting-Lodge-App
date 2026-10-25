/**
 * @module Config/CorsOptions
 *
 * Dynamic CORS configuration and origin resolution tailored per environment:
 * - nonprod: like production, only origins listed in CORS_ORIGIN (local dev origins included there).
 * - preprod: strictly validates staging domains against whitelist; blocks localhost and wildcards.
 * - prod: strictly validates production origins with zero wildcard reflection and credentials safety.
 */

import type { CorsOptions } from "cors";
import type { AppEnv } from "./env";

/**
 * A disallowed origin is a 403 for the caller, not a server fault, and the response must not
 * reveal the environment or the configured origins.
 */
function corsRejection(): Error {
    return Object.assign(new Error("Origin not allowed"), { statusCode: 403, code: "CORS_ORIGIN_REJECTED" });
}

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

    // Reject wildcard origins when credentials are enabled
    if (origin === "*") {
        return false;
    }

    const configuredList = resolveConfiguredOrigins(configuredOrigins);

    if (appEnv === "nonprod") {
        // Same rule as production: only explicitly configured origins (CORS_ORIGIN). Local
        // development origins such as http://localhost:5173 must be listed there too; there is
        // no implicit localhost allowance. (Preprod/prod additionally refuse localhost entries.)
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
            if (origin === "*") {
                callback(corsRejection(), false);
                return;
            }
            if (isOriginAllowed(origin, appEnv, configuredOrigins)) {
                callback(null, true);
            } else {
                callback(corsRejection(), false);
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
        exposedHeaders: ["Retry-After", "X-Has-More", "X-Next-Cursor-Date", "X-Next-Cursor-Id"],
        maxAge: 86400, // 24 hours preflight cache
    };
}

export default createCorsOptions;

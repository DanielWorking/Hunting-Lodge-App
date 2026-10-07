/**
 * @module ClientConfig/ApiConfig
 *
 * Tri-environment client API configuration and endpoint resolver.
 * Detects online environment (nonprod, preprod, prod), resolves API base URL,
 * SSO callback endpoints, and provides typed environment helpers.
 */

export type ClientAppEnv = "nonprod" | "preprod" | "prod";

/**
 * Normalizes raw environment variable or Vite mode to one of the 3 supported environments:
 * - "nonprod" (local dev, PR preview, integration)
 * - "preprod" (staging, QA parity)
 * - "prod" (hardened production)
 */
export function detectClientAppEnv(rawEnv?: string, rawMode?: string): ClientAppEnv {
    const val = (rawEnv || rawMode || "").toLowerCase().trim();
    if (val === "prod" || val === "production") return "prod";
    if (val === "preprod" || val === "staging" || val === "stage") return "preprod";
    return "nonprod";
}

export interface ClientEnvValidationResult {
    readonly valid: boolean;
    readonly errors: readonly string[];
}

/**
 * Validates client-side Vite environment variables.
 * Enforces strict typing and structural constraints on all public VITE_ variables.
 */
export function validateClientEnv(env: Record<string, unknown>): ClientEnvValidationResult {
    const errors: string[] = [];

    const rawEnvVal = env.VITE_APP_ENV;
    if (rawEnvVal !== undefined && typeof rawEnvVal === "string" && rawEnvVal.trim() !== "") {
        const normalized = rawEnvVal.toLowerCase().trim();
        if (!["nonprod", "preprod", "prod"].includes(normalized)) {
            errors.push(`VITE_APP_ENV must be 'nonprod', 'preprod', or 'prod'. Received: '${rawEnvVal}'`);
        }
    }

    const rawApiVal = env.VITE_API_URL;
    if (rawApiVal !== undefined && typeof rawApiVal === "string" && rawApiVal.trim() !== "") {
        const trimmed = rawApiVal.trim();
        if (!trimmed.startsWith("/") && !trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
            errors.push(`VITE_API_URL must be a valid relative path (e.g. '/api') or absolute URL. Received: '${trimmed}'`);
        }
    }

    if (errors.length > 0) {
        console.warn("⚠️ [Client Config Warning] Client environment schema issues detected:\n" + errors.join("\n"));
    }

    return Object.freeze({
        valid: errors.length === 0,
        errors: Object.freeze(errors),
    });
}

// Validate client environment schema on initialization
export const clientEnvValidation = validateClientEnv(import.meta.env);

const rawAppEnv = import.meta.env.VITE_APP_ENV as string | undefined;
const rawMode = import.meta.env.MODE as string | undefined;
const appEnv: ClientAppEnv = detectClientAppEnv(rawAppEnv, rawMode);

const isNonProd = appEnv === "nonprod";
const isPreProd = appEnv === "preprod";
const isProd = appEnv === "prod";
const mode = rawMode || (isProd ? "prod" : isPreProd ? "preprod" : "nonprod");

// Resolve API URL (defaults to relative '/api' for single-host reverse-proxy setups)
const rawApiUrl = import.meta.env.VITE_API_URL as string | undefined;
export const apiUrl = (rawApiUrl && rawApiUrl.trim() !== "") ? rawApiUrl.trim() : "/api";

export const appVersion = (import.meta.env.VITE_APP_VERSION as string) || "1.0.0";
export const enableDebugLogs = import.meta.env.VITE_ENABLE_DEBUG_LOGS === "true" || isNonProd;

export const ssoCallbackPath = "/auth/callback";

/**
 * Resolves the full SSO callback URL based on window.location in browser environments.
 */
export function getSsoCallbackUrl(): string {
    if (typeof window !== "undefined" && window.location && window.location.origin) {
        return `${window.location.origin}${ssoCallbackPath}`;
    }
    return ssoCallbackPath;
}

export interface ApiConfig {
    readonly appEnv: ClientAppEnv;
    readonly isNonProd: boolean;
    readonly isPreProd: boolean;
    readonly isProd: boolean;
    readonly mode: string;
    readonly apiUrl: string;
    readonly ssoCallbackPath: string;
    readonly ssoCallbackUrl: string;
    readonly appVersion: string;
    readonly enableDebugLogs: boolean;
}

export const apiConfig: ApiConfig = Object.freeze({
    appEnv,
    isNonProd,
    isPreProd,
    isProd,
    mode,
    apiUrl,
    ssoCallbackPath,
    get ssoCallbackUrl() {
        return getSsoCallbackUrl();
    },
    appVersion,
    enableDebugLogs,
});

export default apiConfig;

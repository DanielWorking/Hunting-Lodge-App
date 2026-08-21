/**
 * @module ClientConfig
 *
 * Centralized, typed environment configuration for the client application.
 * Normalizes Vite environment variables and provides safe fallbacks
 * with development warnings.
 */

export interface ClientConfig {
    /** Whether the application is running in production mode. */
    isProd: boolean;
    /** Whether the application is running in development mode. */
    isDev: boolean;
    /** The active Vite mode string (e.g. 'development', 'production'). */
    mode: string;
    /** The base API endpoint URL (defaults to relative '/api'). */
    apiUrl: string;
    /** Super admin configuration. */
    superAdmin: {
        /** Unique identifier for the primary Super Admin account. */
        id: string;
        /** The designated name of the Super Admin group. */
        groupName: string;
    };
}

const isProd = import.meta.env.PROD;
const isDev = import.meta.env.DEV;
const mode = import.meta.env.MODE;

const superAdminId = (import.meta.env.VITE_SUPER_ADMIN_ID as string) || "10001";
const superAdminGroupName = (import.meta.env.VITE_SUPER_ADMIN_GROUP_NAME as string) || "ADMINISTRATORS";
const apiUrl = (import.meta.env.VITE_API_URL as string) || "/api";

if (isDev) {
    if (!import.meta.env.VITE_SUPER_ADMIN_ID) {
        console.warn(
            "⚠️ [Client Config] VITE_SUPER_ADMIN_ID is not set in environment. Using default fallback: '10001'",
        );
    }
    if (!import.meta.env.VITE_SUPER_ADMIN_GROUP_NAME) {
        console.warn(
            "⚠️ [Client Config] VITE_SUPER_ADMIN_GROUP_NAME is not set in environment. Using default fallback: 'ADMINISTRATORS'",
        );
    }
}

export const envConfig: ClientConfig = Object.freeze({
    isProd,
    isDev,
    mode,
    apiUrl,
    superAdmin: {
        id: superAdminId,
        groupName: superAdminGroupName,
    },
});

export default envConfig;

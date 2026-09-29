/**
 * @module ClientConfig
 *
 * Centralized, typed environment configuration for the client application.
 * Normalizes Vite environment variables and provides safe fallbacks.
 */

export interface ClientConfig {
    /** Whether the application is running in production mode. */
    isProd: boolean;
    /** Whether the application is running in development mode. */
    isDev: boolean;
    /** The active Vite mode string (e.g. 'development', 'production'). */
    mode: string;
    /** The client application package version. */
    appVersion: string;
    /** The base API endpoint URL (defaults to relative '/api'). */
    apiUrl: string;
}

const isProd = import.meta.env.PROD;
const isDev = import.meta.env.DEV;
const mode = import.meta.env.MODE;

const apiUrl = (import.meta.env.VITE_API_URL as string) || "/api";
const appVersion = (import.meta.env.VITE_APP_VERSION as string) || "1.0.0";

export const envConfig: ClientConfig = Object.freeze({
    isProd,
    isDev,
    mode,
    appVersion,
    apiUrl,
});

export default envConfig;

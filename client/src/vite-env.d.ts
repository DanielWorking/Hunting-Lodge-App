/// <reference types="vite/client" />

/**
 * Type definitions for Vite client-side environment variables (`import.meta.env`).
 * All custom environment variables exposed to the Vite bundle must be prefixed with `VITE_`.
 */
interface ImportMetaEnv {
    /**
     * The application package version.
     * Injected automatically from client/package.json at build/serve time via vite.config.ts.
     * Fallback default in `envConfig`: "1.0.0".
     */
    readonly VITE_APP_VERSION: string;

    /**
     * Unique identifier for the primary Super Administrator account.
     * Must synchronize with `SUPER_ADMIN_ID` in the server environment configuration.
     * Fallback default in `envConfig`: "10001".
     */
    readonly VITE_SUPER_ADMIN_ID?: string;

    /**
     * The organizational group name that designates global administrative authority.
     * Must synchronize with `SUPER_ADMIN_GROUP_NAME` in the server environment configuration.
     * Fallback default in `envConfig`: "ADMINISTRATORS".
     */
    readonly VITE_SUPER_ADMIN_GROUP_NAME?: string;

    /**
     * Base HTTP endpoint URL for backend API requests.
     * In development, proxied through Vite dev server to localhost:5000.
     * In production, defaults to relative reverse proxy path "/api".
     * Fallback default in `envConfig`: "/api".
     */
    readonly VITE_API_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

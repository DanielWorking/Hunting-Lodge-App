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
     * Target application deployment environment: "nonprod" | "preprod" | "prod".
     */
    readonly VITE_APP_ENV?: "nonprod" | "preprod" | "prod" | string;

    /**
     * Base HTTP endpoint URL for backend API requests.
     * In nonprod dev, proxied through Vite dev server to localhost:5000.
     * In preprod/prod, defaults to relative reverse proxy path "/api".
     * Fallback default in `envConfig`: "/api".
     */
    readonly VITE_API_URL?: string;

    /**
     * SSO callback path (default "/api/auth/sso/callback").
     */
    readonly VITE_SSO_CALLBACK_PATH?: string;

    /**
     * Enable verbose debug logging in the client console.
     */
    readonly VITE_ENABLE_DEBUG_LOGS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

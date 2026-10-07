/**
 * @module ClientConfig
 *
 * Centralized, typed environment configuration for the client application.
 * Normalizes Vite environment variables and provides backwards-compatible helpers.
 */

import apiConfig, {
    type ClientAppEnv,
    detectClientAppEnv,
} from "./apiConfig";

export type { ClientAppEnv };
export { detectClientAppEnv, apiConfig };

export interface ClientConfig {
    readonly isProd: boolean;
    readonly isNonProd: boolean;
    readonly isPreProd: boolean;
    readonly appEnv: ClientAppEnv;
    readonly mode: string;
    readonly appVersion: string;
    readonly apiUrl: string;
    readonly ssoCallbackPath: string;
    readonly ssoCallbackUrl: string;
    readonly enableDebugLogs: boolean;
}

export const envConfig: ClientConfig = Object.freeze({
    isProd: apiConfig.isProd,
    isNonProd: apiConfig.isNonProd,
    isPreProd: apiConfig.isPreProd,
    appEnv: apiConfig.appEnv,
    mode: apiConfig.mode,
    appVersion: apiConfig.appVersion,
    apiUrl: apiConfig.apiUrl,
    ssoCallbackPath: apiConfig.ssoCallbackPath,
    get ssoCallbackUrl() {
        return apiConfig.ssoCallbackUrl;
    },
    enableDebugLogs: apiConfig.enableDebugLogs,
});

export default envConfig;

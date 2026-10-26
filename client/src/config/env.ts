/**
 * @module ClientConfig
 *
 * Centralized, typed environment configuration for the client application.
 * Exposes the normalized Vite environment values resolved in `apiConfig`.
 */

import apiConfig, { type ClientAppEnv } from "./apiConfig";

export interface ClientConfig {
    readonly isProd: boolean;
    readonly isNonProd: boolean;
    readonly isPreProd: boolean;
    readonly appEnv: ClientAppEnv;
    readonly mode: string;
    readonly appVersion: string;
    readonly apiUrl: string;
}

export const envConfig: ClientConfig = Object.freeze({
    isProd: apiConfig.isProd,
    isNonProd: apiConfig.isNonProd,
    isPreProd: apiConfig.isPreProd,
    appEnv: apiConfig.appEnv,
    mode: apiConfig.mode,
    appVersion: apiConfig.appVersion,
    apiUrl: apiConfig.apiUrl,
});

export default envConfig;

/**
 * @module ServerConfig
 *
 * Centralized configuration module for the Hunting Lodge backend.
 * Exposes a structured, deeply immutable configuration object across the application.
 */

import path from "path";
import {
    appEnv,
    isNonProd,
    isPreProd,
    isProd,
    parseTrustProxy,
    deepFreeze,
    isEnabledFlag,
    validateServerEnv,
    validatedEnv,
} from "./env";
import dbConfig from "./db";
import jwtConfig from "./keys";
import ssoConfig from "./sso";
import type { ServerConfig } from "../types/config";

// Enforce environment validation on module initialization
validateServerEnv(process.env, appEnv, process.env.NODE_ENV !== "test");

const rawConfig: ServerConfig = {
    env: appEnv,
    appEnv,
    isNonProd,
    isPreProd,
    isProd,
    port: validatedEnv.PORT,
    mongoUri: dbConfig.uri,
    database: dbConfig,
    jwt: jwtConfig,
    sso: ssoConfig,
    superAdmin: {
        id: validatedEnv.SUPER_ADMIN_ID || "",
        username: validatedEnv.SUPER_ADMIN_USERNAME || "",
        email: validatedEnv.SUPER_ADMIN_EMAIL || "",
        groupName: validatedEnv.SUPER_ADMIN_GROUP_NAME || "",
    },
    security: {
        corsOrigin: validatedEnv.CORS_ORIGIN || (isProd || isPreProd ? false : true),
        rateLimitMax: validatedEnv.RATE_LIMIT_MAX,
        rateLimitWindowMs: validatedEnv.RATE_LIMIT_WINDOW_MS,
        trustProxy: parseTrustProxy(validatedEnv.TRUST_PROXY),
        exposeErrorDetails: isEnabledFlag(validatedEnv.EXPOSE_ERROR_DETAILS),
    },
    logging: {
        morganFormat: validatedEnv.LOG_FORMAT || (isProd || isPreProd ? "combined" : "dev"),
    },
    staticFilesPath: validatedEnv.STATIC_FILES_PATH
        ? path.resolve(validatedEnv.STATIC_FILES_PATH)
        : path.resolve(__dirname, "../../../client/dist"),
};

const config = deepFreeze(rawConfig);

export default config;

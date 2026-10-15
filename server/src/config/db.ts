/**
 * @module Config/Database
 *
 * Mongoose database configuration, SDAM connection pool tuning per environment,
 * and cross-environment connection safety guards.
 */

import "./env";
import { appEnv, deepFreeze, AppEnv, validatedEnv } from "./env";
import type { DatabaseConfig, DatabaseOptions } from "../types/config";

/**
 * Masks user credentials in MongoDB connection URI for secure logging.
 */
export function maskMongoUri(uri: string): string {
    return uri.replace(/\/\/(.*):(.*)@/, "//$1:***@");
}

/**
 * Enforces cross-environment database connection isolation.
 * Prevents prod from pointing to dev/local databases, preprod from touching prod, etc.
 */
export function validateDatabaseTarget(uri: string, currentAppEnv: AppEnv): void {
    const lower = uri.toLowerCase();

    if (currentAppEnv === "prod") {
        if (lower.includes("localhost") || lower.includes("127.0.0.1")) {
            throw new Error(
                "❌ FATAL: Production environment cannot connect to a localhost / loopback MongoDB instance!"
            );
        }
        if (lower.includes("hunting_lodge_nonprod") || lower.includes("hunting_lodge_dev") || lower.includes("_test")) {
            throw new Error(
                `❌ FATAL: Production environment cannot connect to a non-production database: ${maskMongoUri(uri)}`
            );
        }
    } else if (currentAppEnv === "preprod") {
        if (lower.includes("localhost") || lower.includes("127.0.0.1")) {
            throw new Error(
                "❌ FATAL: Preprod staging environment cannot connect to a localhost MongoDB instance!"
            );
        }
        if (lower.includes("hunting_lodge_prod")) {
            throw new Error(
                `❌ FATAL: Preprod environment cannot connect to the production database: ${maskMongoUri(uri)}`
            );
        }
    } else if (currentAppEnv === "nonprod") {
        if (lower.includes("hunting_lodge_prod")) {
            console.warn(
                `⚠️  [Security Warning] Nonprod environment is connecting to a database containing 'prod': ${maskMongoUri(uri)}`
            );
        }
    }
}

// Connection defaults are production values in every environment; each deployment overrides them
// through its MONGO_* variables (nonprod's config file relaxes them for development, including
// MONGO_AUTO_INDEX=true). Without that override, indexes come only from migrations (npm run migrate:up).
const defaultMaxPoolSize = 50;
const defaultMinPoolSize = 10;
const defaultSelectionTimeout = 5000;
const defaultAutoIndex = false;

const options: DatabaseOptions = {
    autoIndex: validatedEnv.MONGO_AUTO_INDEX !== undefined
        ? validatedEnv.MONGO_AUTO_INDEX === "true"
        : defaultAutoIndex,
    maxPoolSize: parseInt(validatedEnv.MONGO_MAX_POOL_SIZE || String(defaultMaxPoolSize), 10),
    minPoolSize: parseInt(validatedEnv.MONGO_MIN_POOL_SIZE || String(defaultMinPoolSize), 10),
    serverSelectionTimeoutMS: parseInt(
        validatedEnv.MONGO_SERVER_SELECTION_TIMEOUT_MS || String(defaultSelectionTimeout),
        10
    ),
    socketTimeoutMS: parseInt(validatedEnv.MONGO_SOCKET_TIMEOUT_MS || "30000", 10),
    heartbeatFrequencyMS: parseInt(validatedEnv.MONGO_HEARTBEAT_FREQUENCY_MS || "10000", 10),
    connectTimeoutMS: parseInt(validatedEnv.MONGO_CONNECT_TIMEOUT_MS || "30000", 10),
    maxIdleTimeMS: parseInt(validatedEnv.MONGO_MAX_IDLE_TIME_MS || "60000", 10),
    retryWrites: true,
    retryReads: true,
};

// MONGO_URI is required at startup by validateServerEnv; there is no local fallback database
const rawDatabaseUri = validatedEnv.MONGO_URI || "";

// Apply cross-environment guard during initialization (bypass only in unit tests if needed)
if (process.env.NODE_ENV !== "test") {
    validateDatabaseTarget(rawDatabaseUri, appEnv);
}

const rawDatabaseConfig: DatabaseConfig = {
    uri: rawDatabaseUri,
    options,
};

const databaseConfig = deepFreeze(rawDatabaseConfig);

export default databaseConfig;

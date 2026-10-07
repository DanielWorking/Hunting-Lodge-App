/**
 * @module Config/Database
 *
 * Mongoose database configuration, SDAM connection pool tuning per environment,
 * and cross-environment connection safety guards.
 */

import "./env";
import { appEnv, isNonProd, deepFreeze, AppEnv, validatedEnv } from "./env";
import type { DatabaseConfig, DatabaseOptions } from "../types/config";

/**
 * Masks user credentials in MongoDB connection URI for secure logging.
 */
function maskMongoUri(uri: string): string {
    return uri.replace(/\/\/(.*):(.*)@/, "//$1:***@");
}

/**
 * Enforces cross-environment database connection isolation.
 * Prevents prod from pointing to dev/local databases, preprod from touching prod, etc.
 */
function validateDatabaseTarget(uri: string, currentAppEnv: AppEnv): void {
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

// SDAM Tuning per Environment:
// nonprod: max 20, min 2, timeout 30000ms, autoIndex true
// preprod: max 30, min 5, timeout 10000ms, autoIndex false
// prod:    max 50, min 10, timeout 5000ms, autoIndex false
const defaultMaxPoolSize = appEnv === "prod" ? 50 : appEnv === "preprod" ? 30 : 20;
const defaultMinPoolSize = appEnv === "prod" ? 10 : appEnv === "preprod" ? 5 : 2;
const defaultSelectionTimeout = appEnv === "prod" ? 5000 : appEnv === "preprod" ? 10000 : 30000;
const defaultAutoIndex = appEnv === "nonprod";

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

const rawDatabaseUri = validatedEnv.MONGO_URI || "mongodb://localhost:27017/hunting_lodge_db";

if (isNonProd && !process.env.MONGO_URI) {
    console.warn("⚠️  [Nonprod Warning] MONGO_URI is not set. Database connection will likely fail.");
}

// Apply cross-environment guard during initialization (bypass only in unit tests if needed)
if (process.env.NODE_ENV !== "test") {
    validateDatabaseTarget(rawDatabaseUri, appEnv);
}

const rawDatabaseConfig: DatabaseConfig = {
    uri: rawDatabaseUri,
    options,
};

type ExportedDbConfig = DatabaseConfig & {
    readonly default: DatabaseConfig;
    readonly databaseConfig: DatabaseConfig;
    readonly dbConfig: DatabaseConfig;
    readonly dbOptions: DatabaseOptions;
    readonly options: DatabaseOptions;
    readonly mongoUri: string;
    readonly uri: string;
    readonly maskMongoUri: typeof maskMongoUri;
    readonly validateDatabaseTarget: typeof validateDatabaseTarget;
};

const combinedDb: ExportedDbConfig = {
    ...rawDatabaseConfig,
    default: rawDatabaseConfig,
    databaseConfig: rawDatabaseConfig,
    dbConfig: rawDatabaseConfig,
    dbOptions: rawDatabaseConfig.options,
    options: rawDatabaseConfig.options,
    mongoUri: rawDatabaseConfig.uri,
    uri: rawDatabaseConfig.uri,
    maskMongoUri,
    validateDatabaseTarget,
};

const exportedDb: ExportedDbConfig = deepFreeze(combinedDb);

export = exportedDb;

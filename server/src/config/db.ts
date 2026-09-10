/**
 * @module Config/Database
 *
 * Mongoose database configuration and connection pool tuning.
 * SDAM hardening parameters are configured to survive event loop lag and connection spikes.
 */

import "./env";
import { isProd, deepFreeze } from "./env";
import type { DatabaseConfig, DatabaseOptions } from "../types/config";

if (!isProd && !process.env.MONGO_URI) {
    console.warn("⚠️  [Dev Warning] MONGO_URI is not set. Database connection will likely fail.");
}

const options: DatabaseOptions = {
    autoIndex: process.env.MONGO_AUTO_INDEX !== undefined
        ? process.env.MONGO_AUTO_INDEX === "true"
        : !isProd,
    maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || (isProd ? "50" : "20"), 10),
    minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || (isProd ? "10" : "2"), 10),
    serverSelectionTimeoutMS: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || "30000", 10),
    socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT_MS || "30000", 10),
    heartbeatFrequencyMS: parseInt(process.env.MONGO_HEARTBEAT_FREQUENCY_MS || "10000", 10),
    connectTimeoutMS: parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS || "30000", 10),
    maxIdleTimeMS: parseInt(process.env.MONGO_MAX_IDLE_TIME_MS || "60000", 10),
    retryWrites: true,
    retryReads: true,
};

const rawDatabaseConfig: DatabaseConfig = {
    uri: process.env.MONGO_URI || "mongodb://localhost:27017/hunting_lodge_db",
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
};

const exportedDb: ExportedDbConfig = deepFreeze(combinedDb);

export = exportedDb;

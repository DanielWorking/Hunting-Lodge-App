/**
 * @module MigrateMongoConfig
 *
 * Configuration for the migrate-mongo migration runner.
 * Automatically resolves the database connection string from environment files
 * (.env.development, .env.production, .env, or process.env.MONGO_URI).
 */

import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// Determine environment
const nodeEnv: string = process.env.NODE_ENV || "development";
const isDev: boolean = nodeEnv === "development";
const isProd: boolean = nodeEnv === "production";

// Base server root directory (two levels up from src/migrations)
const serverRootDir: string = path.resolve(__dirname, "../..");

// Load environment variables matching server configuration hierarchy
const customEnvPath: string | null = process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : null;
const devEnvPath: string = path.join(serverRootDir, ".env.development");
const prodEnvPath: string = path.join(serverRootDir, ".env.production");
const standardEnvPath: string = path.join(serverRootDir, ".env");

if (customEnvPath && fs.existsSync(customEnvPath)) {
    dotenv.config({ path: customEnvPath });
} else if (isDev && fs.existsSync(devEnvPath)) {
    dotenv.config({ path: devEnvPath });
    const localDevEnvPath: string = path.join(serverRootDir, ".env.development.local");
    if (fs.existsSync(localDevEnvPath)) {
        dotenv.config({ path: localDevEnvPath, override: true });
    }
} else if (isProd && fs.existsSync(prodEnvPath)) {
    dotenv.config({ path: prodEnvPath });
} else if (fs.existsSync(standardEnvPath)) {
    dotenv.config({ path: standardEnvPath });
} else {
    dotenv.config();
}

const mongoUri: string = process.env.MONGO_URI || "mongodb://localhost:27017/hunting_lodge_db";

interface MigrateMongoConfiguration {
    mongodb: {
        url: string;
        options: Record<string, unknown>;
    };
    migrationsDir: string;
    changelogCollectionName: string;
    migrationFileExtension: string;
    useFileHash: boolean;
    moduleSystem: "commonjs" | "esm";
    up?: () => Promise<void>;
    down?: () => Promise<void>;
}

const config: MigrateMongoConfiguration = {
    mongodb: {
        url: mongoUri,
        options: {},
    },

    // The migrations dir, can be a relative or absolute path.
    migrationsDir: __dirname,

    // The MongoDB collection where the applied migrations are stored.
    changelogCollectionName: "changelog",

    // The file extension to create migrations and search for in migration directory.
    migrationFileExtension: ".ts",

    // Enable the algorithm to create a hash of the file contents and use that in the comparison to determine
    // if the file should be run. Requires that scripts are not modified after execution.
    useFileHash: false,

    // CommonJS module system
    moduleSystem: "commonjs",

    // No-op migration hooks in case runner treats config as migration file within migrationsDir
    up: async (): Promise<void> => {},
    down: async (): Promise<void> => {},
};

export const up = async (): Promise<void> => {};
export const down = async (): Promise<void> => {};

export default config;

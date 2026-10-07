/**
 * @module MigrateMongoConfig
 *
 * Configuration for the migrate-mongo migration runner.
 * Automatically resolves the database connection string from environment files
 * (.env.nonprod, .env.preprod, .env.prod, .env, or process.env.MONGO_URI).
 */

import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// Determine tri-environment (nonprod, preprod, prod)
const rawAppEnv = (process.env.APP_ENV || "").toLowerCase().trim();
const rawNodeEnv = (process.env.NODE_ENV || "").toLowerCase().trim();
const appEnv = rawAppEnv === "prod" || rawAppEnv === "production" || rawNodeEnv === "production"
    ? "prod"
    : rawAppEnv === "preprod" || rawAppEnv === "staging"
    ? "preprod"
    : "nonprod";

// Base server root directory (two levels up from src/migrations)
const serverRootDir: string = path.resolve(__dirname, "../..");

// Load environment variables matching tri-environment hierarchy
const customEnvPath: string | null = process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : null;
const envServerDir: string = path.join(serverRootDir, "../env/server");
const baseEnvPath: string = path.join(envServerDir, ".env");
const targetEnvPath: string = path.join(envServerDir, `.env.${appEnv}`);
const localEnvPath: string = path.join(envServerDir, `.env.${appEnv}.local`);

if (customEnvPath && fs.existsSync(customEnvPath)) {
    dotenv.config({ path: customEnvPath });
} else {
    // 1. Base fallback
    if (fs.existsSync(baseEnvPath)) {
        dotenv.config({ path: baseEnvPath });
    }
    // 2. Tri-environment config/secret (.env.nonprod, .env.preprod, .env.prod)
    if (fs.existsSync(targetEnvPath)) {
        dotenv.config({ path: targetEnvPath, override: true });
    }
    // 3. Local overrides
    if (fs.existsSync(localEnvPath)) {
        dotenv.config({ path: localEnvPath, override: true });
    }
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

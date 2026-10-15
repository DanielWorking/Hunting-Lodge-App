/**
 * @module MigrateMongoConfig
 *
 * Configuration for the migrate-mongo migration runner.
 * Uses exactly the same environment detection, env files (env/server/.env.config.<env> and
 * .env.secret.<env>) and startup validation as the application, so migrations always run
 * against the database the app itself uses. There is no localhost fallback.
 */

import { validatedEnv, appEnv } from "../config/env";

const mongoUri: string = validatedEnv.MONGO_URI || "";
if (!mongoUri) {
    throw new Error(`MONGO_URI is not configured for the ${appEnv} environment; refusing to run migrations`);
}

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

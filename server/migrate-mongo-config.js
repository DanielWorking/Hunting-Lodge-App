/**
 * @module MigrateMongoConfig
 *
 * Configuration for the migrate-mongo migration runner.
 * Automatically resolves the database connection string from environment files
 * (.env.development, .env.production, .env, or process.env.MONGO_URI).
 */

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

// Determine environment
const nodeEnv = process.env.NODE_ENV || "development";
const isDev = nodeEnv === "development";
const isProd = nodeEnv === "production";

// Load environment variables matching server configuration hierarchy
const customEnvPath = process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : null;
const devEnvPath = path.join(__dirname, ".env.development");
const prodEnvPath = path.join(__dirname, ".env.production");
const standardEnvPath = path.join(__dirname, ".env");

if (customEnvPath && fs.existsSync(customEnvPath)) {
    dotenv.config({ path: customEnvPath });
} else if (isDev && fs.existsSync(devEnvPath)) {
    dotenv.config({ path: devEnvPath });
    const localDevEnvPath = path.join(__dirname, ".env.development.local");
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

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/hunting_lodge_db";

const config = {
    mongodb: {
        url: mongoUri,
        options: {},
    },

    // The migrations dir, can be a relative or absolute path.
    migrationsDir: path.join(__dirname, "migrations"),

    // The MongoDB collection where the applied migrations are stored.
    changelogCollectionName: "changelog",

    // The file extension to create migrations and search for in migration directory.
    migrationFileExtension: ".js",

    // Enable the algorithm to create a hash of the file contents and use that in the comparison to determine
    // if the file should be run. Requires that scripts are not modified after execution.
    useFileHash: false,

    // CommonJS module system
    moduleSystem: "commonjs",
};

module.exports = config;

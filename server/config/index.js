/**
 * @module ServerConfig
 *
 * Centralized configuration module for the Hunting Lodge backend.
 * Handles environment-based variable loading, fail-fast validation for production,
 * and exposes a structured, immutable configuration object across the application.
 */

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

// Determine current execution environment
const nodeEnv = process.env.NODE_ENV || "development";
const isProd = nodeEnv === "production";
const isDev = nodeEnv === "development";
const isTest = nodeEnv === "test";

// Load appropriate .env file based on environment
const rootServerDir = path.resolve(__dirname, "..");
const customEnvPath = process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : null;
const devEnvPath = path.join(rootServerDir, ".env.development");
const prodEnvPath = path.join(rootServerDir, ".env.production");
const standardEnvPath = path.join(rootServerDir, ".env");

if (customEnvPath && fs.existsSync(customEnvPath)) {
    dotenv.config({ path: customEnvPath });
} else if (isDev && fs.existsSync(devEnvPath)) {
    dotenv.config({ path: devEnvPath });
    // Also load local overrides if present (.env.development.local or .env.local)
    const localDevEnvPath = path.join(rootServerDir, ".env.development.local");
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

/**
 * Validates that all required environment variables are set.
 * In production mode, halts the process immediately with an explanatory error
 * if critical variables are missing.
 */
function validateConfig() {
    const requiredInProd = [
        { key: "MONGO_URI", desc: "MongoDB connection string" },
        { key: "JWT_SECRET", desc: "Cryptographic secret key for signing JSON Web Tokens" },
        { key: "SSO_ISSUER_URL", desc: "SSO/OIDC Issuer URL (Auth0, Okta, Azure AD, etc.)" },
        { key: "SSO_CLIENT_ID", desc: "SSO Client Application ID" },
        { key: "SSO_CLIENT_SECRET", desc: "SSO Client Secret key" },
        { key: "SSO_REDIRECT_URI", desc: "SSO Redirect/Callback URI" },
        { key: "SUPER_ADMIN_ID", desc: "Unique User ID for initial Super Admin" },
        { key: "SUPER_ADMIN_GROUP_NAME", desc: "Name of the protected administrative group" },
    ];

    if (isProd) {
        const missing = requiredInProd.filter((item) => !process.env[item.key]);
        if (missing.length > 0) {
            console.error("\n==================================================================");
            console.error("❌ CRITICAL CONFIGURATION ERROR: MISSING PRODUCTION ENV VARIABLES");
            console.error("==================================================================");
            console.error("The application cannot start in PRODUCTION mode without the following:\n");
            missing.forEach((item) => {
                console.error(`  - ${item.key.padEnd(25)} : ${item.desc}`);
            });
            console.error("\n👉 Please configure these in your server/.env or production environment.");
            console.error("   Refer to server/.env.production.example for the template.");
            console.error("==================================================================\n");
            process.exit(1);
        }
    } else {
        // Development warnings (non-fatal)
        if (!process.env.MONGO_URI) {
            console.warn("⚠️  [Dev Warning] MONGO_URI is not set. Database connection will likely fail.");
        }
        if (!process.env.JWT_SECRET) {
            console.warn("⚠️  [Dev Warning] JWT_SECRET is not set. Using fallback development secret.");
        }
        if (!process.env.SSO_CLIENT_ID || !process.env.SSO_ISSUER_URL) {
            console.warn("⚠️  [Dev Warning] SSO variables are partially missing. SSO login may not work.");
        }
    }
}

validateConfig();

/**
 * Central structured configuration object.
 */
const config = Object.freeze({
    env: nodeEnv,
    isProd,
    isDev,
    isTest,

    // Server Networking
    port: parseInt(process.env.PORT || "5000", 10),

    // Database
    mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/hunting_lodge_db",

    // JWT Authentication
    jwt: {
        secret: process.env.JWT_SECRET || (isProd ? "" : "dev-jwt-secret-hunting-lodge-change-in-production"),
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    },

    // Single Sign-On (SSO / OIDC)
    sso: {
        issuerUrl: process.env.SSO_ISSUER_URL || "",
        clientId: process.env.SSO_CLIENT_ID || "",
        clientSecret: process.env.SSO_CLIENT_SECRET || "",
        redirectUri: process.env.SSO_REDIRECT_URI || "http://localhost:5173/auth/callback",
        // 'email' for Dev/Auth0, 'username' for Enterprise Active Directory / IDP
        identifierField: process.env.SSO_IDENTIFIER_FIELD || (isProd ? "username" : "email"),
        scope: "openid profile email",
    },

    // Super Admin Identity & Group Assignment
    superAdmin: {
        id: process.env.SUPER_ADMIN_ID || "10001",
        username: process.env.SUPER_ADMIN_USERNAME || "Super Admin",
        email: process.env.SUPER_ADMIN_EMAIL || "",
        groupName: process.env.SUPER_ADMIN_GROUP_NAME || "ADMINISTRATORS",
    },

    // Security & Traffic Controls
    security: {
        // Specific origin in prod, or open/permissive in dev
        corsOrigin: process.env.CORS_ORIGIN || (isProd ? false : true),
        // Max requests per windowMs (10,000 in dev, 100 in prod by default)
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || (isProd ? "100" : "10000"), 10),
        rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
    },

    // Logging & Observability
    logging: {
        morganFormat: process.env.LOG_FORMAT || (isProd ? "combined" : "dev"),
    },
});

module.exports = config;

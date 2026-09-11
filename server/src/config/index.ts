/**
 * @module ServerConfig
 *
 * Centralized configuration module for the Hunting Lodge backend.
 * Exposes a structured, deeply immutable configuration object across the application.
 */

import path from "path";
import { nodeEnv, isProd, isDev, isTest, parseTrustProxy, deepFreeze } from "./env";
import dbConfig from "./db";
import jwtConfig from "./keys";
import ssoConfig from "./sso";
import passportConfig from "./passport";
import type { ServerConfig } from "../types/config";

function validateConfig(): void {
    const requiredInProd: ReadonlyArray<{ readonly key: string; readonly desc: string }> = [
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

const rawConfig: ServerConfig = {
    env: nodeEnv,
    isProd,
    isDev,
    isTest,
    port: parseInt(process.env.PORT || "5000", 10),
    mongoUri: dbConfig.uri,
    database: dbConfig,
    jwt: jwtConfig,
    sso: ssoConfig,
    passport: passportConfig,
    superAdmin: {
        id: process.env.SUPER_ADMIN_ID || "10001",
        username: process.env.SUPER_ADMIN_USERNAME || "Super Admin",
        email: process.env.SUPER_ADMIN_EMAIL || "",
        groupName: process.env.SUPER_ADMIN_GROUP_NAME || "ADMINISTRATORS",
    },
    security: {
        corsOrigin: process.env.CORS_ORIGIN || (isProd ? false : true),
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || (isProd ? "100" : "10000"), 10),
        rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10),
        trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    },
    logging: {
        morganFormat: process.env.LOG_FORMAT || (isProd ? "combined" : "dev"),
    },
    staticFilesPath: process.env.STATIC_FILES_PATH
        ? path.resolve(process.env.STATIC_FILES_PATH)
        : path.resolve(__dirname, __dirname.includes("dist") ? "../../../../client/dist" : "../../../client/dist"),
};

type ExportedServerConfig = ServerConfig & {
    readonly default: ServerConfig;
    readonly config: ServerConfig;
    readonly dbConfig: typeof dbConfig;
    readonly jwtConfig: typeof jwtConfig;
    readonly ssoConfig: typeof ssoConfig;
    readonly passportConfig: typeof passportConfig;
};

const combinedConfig: ExportedServerConfig = {
    ...rawConfig,
    default: rawConfig,
    config: rawConfig,
    dbConfig,
    jwtConfig,
    ssoConfig,
    passportConfig,
};

const exportedConfig: ExportedServerConfig = deepFreeze(combinedConfig);

export = exportedConfig;

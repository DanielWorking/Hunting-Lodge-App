/**
 * @module Types/Config
 * Type definitions for server configuration and environment settings.
 */

export interface DatabaseOptions {
    readonly maxPoolSize: number;
    readonly minPoolSize: number;
    readonly serverSelectionTimeoutMS: number;
    readonly socketTimeoutMS: number;
    readonly heartbeatFrequencyMS: number;
    readonly connectTimeoutMS: number;
    readonly maxIdleTimeMS: number;
    readonly retryWrites: boolean;
    readonly retryReads: boolean;
}

export interface DatabaseConfig {
    readonly uri: string;
    readonly options: DatabaseOptions;
}

export interface JwtConfig {
    readonly secret: string;
    readonly expiresIn: string;
}

export interface SsoConfig {
    readonly issuerUrl: string;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly redirectUri: string;
    readonly identifierField: string;
    readonly scope: string;
}

export interface PassportConfig extends SsoConfig {
    readonly session?: boolean;
}

export interface SuperAdminConfig {
    readonly id: string;
    readonly username: string;
    readonly email: string;
    readonly groupName: string;
}

export interface SecurityConfig {
    readonly corsOrigin: string | boolean;
    readonly rateLimitMax: number;
    readonly rateLimitWindowMs: number;
    readonly trustProxy: boolean | number | string;
}

export interface LoggingConfig {
    readonly morganFormat: string;
}

export interface ServerConfig {
    readonly env: string;
    readonly isProd: boolean;
    readonly isDev: boolean;
    readonly isTest: boolean;
    readonly port: number;
    readonly mongoUri: string;
    readonly database: DatabaseConfig;
    readonly jwt: JwtConfig;
    readonly sso: SsoConfig;
    readonly passport?: PassportConfig;
    readonly superAdmin: SuperAdminConfig;
    readonly security: SecurityConfig;
    readonly logging: LoggingConfig;
    readonly staticFilesPath: string;
}

export interface ServerProcessEnv {
    readonly NODE_ENV?: "development" | "production" | "test";
    readonly ENV_FILE?: string;
    readonly PORT?: string;
    readonly MONGO_URI?: string;
    readonly MONGO_MAX_POOL_SIZE?: string;
    readonly MONGO_MIN_POOL_SIZE?: string;
    readonly MONGO_SERVER_SELECTION_TIMEOUT_MS?: string;
    readonly MONGO_SOCKET_TIMEOUT_MS?: string;
    readonly MONGO_HEARTBEAT_FREQUENCY_MS?: string;
    readonly MONGO_CONNECT_TIMEOUT_MS?: string;
    readonly MONGO_MAX_IDLE_TIME_MS?: string;
    readonly JWT_SECRET?: string;
    readonly JWT_EXPIRES_IN?: string;
    readonly SSO_ISSUER_URL?: string;
    readonly SSO_CLIENT_ID?: string;
    readonly SSO_CLIENT_SECRET?: string;
    readonly SSO_REDIRECT_URI?: string;
    readonly SSO_IDENTIFIER_FIELD?: string;
    readonly SUPER_ADMIN_ID?: string;
    readonly SUPER_ADMIN_USERNAME?: string;
    readonly SUPER_ADMIN_EMAIL?: string;
    readonly SUPER_ADMIN_GROUP_NAME?: string;
    readonly CORS_ORIGIN?: string;
    readonly RATE_LIMIT_MAX?: string;
    readonly RATE_LIMIT_WINDOW_MS?: string;
    readonly TRUST_PROXY?: string;
    readonly LOG_FORMAT?: string;
    readonly STATIC_FILES_PATH?: string;
}

declare global {
    namespace NodeJS {
        interface ProcessEnv extends ServerProcessEnv {}
    }
}

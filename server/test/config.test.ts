import { describe, it } from "node:test";
import assert from "node:assert/strict";
import config from "../config";
import db from "../config/db";
import keys from "../config/keys";
import sso from "../config/sso";
import passport from "../config/passport";
import { parseTrustProxy, deepFreeze } from "../config/env";

describe("TypeScript Configuration Modules Verification", () => {
    describe("1. Central ServerConfig (config/index.ts)", () => {
        it("should export a frozen, structured configuration object with all required subsystems", () => {
            assert.ok(config, "Config should be defined");
            assert.ok(Object.isFrozen(config), "Config should be frozen");
            assert.ok(Object.isFrozen(config.database), "Config.database should be frozen");
            assert.ok(Object.isFrozen(config.database.options), "Config.database.options should be frozen");
            assert.ok(Object.isFrozen(config.jwt), "Config.jwt should be frozen");
            assert.ok(Object.isFrozen(config.sso), "Config.sso should be frozen");
            assert.ok(Object.isFrozen(config.superAdmin), "Config.superAdmin should be frozen");
            assert.ok(Object.isFrozen(config.security), "Config.security should be frozen");

            // Check core subsystem fields
            assert.equal(typeof config.env, "string");
            assert.equal(typeof config.port, "number");
            assert.equal(typeof config.mongoUri, "string");
            assert.equal(typeof config.jwt.secret, "string");
            assert.equal(typeof config.sso.redirectUri, "string");
            assert.equal(typeof config.superAdmin.groupName, "string");
            assert.equal(typeof config.security.rateLimitMax, "number");
        });

        it("should prevent in-place mutation of configuration properties", () => {
            const writableConfig = config as unknown as Record<string, unknown>;
            assert.throws(() => {
                writableConfig.port = 9999;
            }, TypeError);

            const writableDbOptions = config.database.options as unknown as Record<string, unknown>;
            assert.throws(() => {
                writableDbOptions.maxPoolSize = 999;
            }, TypeError);

            const writableSecurity = config.security as unknown as Record<string, unknown>;
            assert.throws(() => {
                writableSecurity.corsOrigin = "https://malicious.com";
            }, TypeError);
        });

        it("should provide backwards-compatible alias exports for CommonJS/ESM interop", () => {
            assert.equal(config.default.port, config.port);
            assert.equal(config.config.port, config.port);
            assert.ok(config.dbConfig);
            assert.ok(config.jwtConfig);
            assert.ok(config.ssoConfig);
            assert.ok(config.passportConfig);
        });
    });

    describe("2. Database Configuration (config/db.ts)", () => {
        it("should export database URI and robust SDAM options", () => {
            assert.ok(db.uri, "DB URI should exist");
            assert.ok(db.options, "DB options should exist");
            assert.ok(Object.isFrozen(db), "dbConfig should be frozen");
            assert.ok(Object.isFrozen(db.options), "dbOptions should be frozen");

            assert.ok(db.options.serverSelectionTimeoutMS >= 30000);
            assert.equal(db.options.heartbeatFrequencyMS, 10000);
            assert.ok(db.options.maxPoolSize >= 20);
            assert.equal(db.options.retryWrites, true);
            assert.equal(db.options.retryReads, true);

            // Check aliases
            assert.equal(db.mongoUri, db.uri);
            assert.equal(db.dbOptions, db.options);
        });
    });

    describe("3. Cryptographic Keys & JWT (config/keys.ts)", () => {
        it("should export JWT secret and token expiry", () => {
            assert.ok(keys.secret, "JWT secret should exist");
            assert.ok(keys.expiresIn, "JWT expiresIn should exist");
            assert.ok(Object.isFrozen(keys), "keys should be frozen");

            // Check aliases
            assert.equal(keys.jwtConfig.secret, keys.secret);
            assert.equal(keys.keys.secret, keys.secret);
        });
    });

    describe("4. SSO Configuration (config/sso.ts)", () => {
        it("should export OpenID Connect configuration parameters", () => {
            assert.ok(Object.isFrozen(sso), "sso should be frozen");
            assert.equal(typeof sso.issuerUrl, "string");
            assert.equal(typeof sso.clientId, "string");
            assert.equal(typeof sso.clientSecret, "string");
            assert.equal(typeof sso.redirectUri, "string");
            assert.equal(typeof sso.scope, "string");
            assert.equal(typeof sso.identifierField, "string");

            // Check aliases
            assert.equal(sso.ssoConfig.clientId, sso.clientId);
            assert.equal(sso.sso.clientId, sso.clientId);
            assert.equal(sso.default.clientId, sso.clientId);
        });
    });

    describe("5. Passport SSO Adapter (config/passport.ts)", () => {
        it("should export PassportConfig without mutating ssoConfig", () => {
            assert.ok(Object.isFrozen(passport), "passportConfig should be frozen");
            assert.equal(passport.session, false);
            assert.equal(passport.clientId, sso.clientId);
            assert.equal(passport.redirectUri, sso.redirectUri);

            // Ensure sso is not mutated with session
            assert.equal((sso as unknown as Record<string, unknown>).session, undefined);
        });
    });

    describe("6. Environment Utilities (config/env.ts)", () => {
        it("should correctly parse TRUST_PROXY values including whitespace edge cases", () => {
            assert.equal(parseTrustProxy(undefined), 1);
            assert.equal(parseTrustProxy(null as unknown as undefined), 1);
            assert.equal(parseTrustProxy(""), 1);
            assert.equal(parseTrustProxy("   "), 1, "Whitespace-only should default to 1 hop");
            assert.equal(parseTrustProxy("true"), true);
            assert.equal(parseTrustProxy("false"), false);
            assert.equal(parseTrustProxy("2"), 2);
            assert.equal(parseTrustProxy("10.0.0.0/8"), "10.0.0.0/8");
        });

        it("should safely deepFreeze objects with cyclic references without stack overflow", () => {
            interface CyclicNode {
                name: string;
                nested: {
                    a: number;
                    parent?: CyclicNode;
                };
            }

            const cyclic: CyclicNode = { name: "test", nested: { a: 1 } };
            cyclic.nested.parent = cyclic;

            assert.doesNotThrow(() => {
                deepFreeze(cyclic);
            });
            assert.ok(Object.isFrozen(cyclic));
            assert.ok(Object.isFrozen(cyclic.nested));
        });
    });
});

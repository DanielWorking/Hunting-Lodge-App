import { describe, it } from "node:test";
import assert from "node:assert/strict";
import config from "../config";
import db from "../config/db";
import keys from "../config/keys";
import sso from "../config/sso";
import passport from "../config/passport";
import { parseTrustProxy, deepFreeze, detectAppEnv, validateServerEnv } from "../config/env";
import { isOriginAllowed, createCorsOptions, resolveConfiguredOrigins } from "../config/corsOptions";

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

            // Check tri-environment flags
            assert.equal(typeof config.appEnv, "string");
            assert.equal(typeof config.isNonProd, "boolean");
            assert.equal(typeof config.isPreProd, "boolean");
            assert.equal(typeof config.isProd, "boolean");
            assert.equal(config.isNonProd, true, "In testing environment, appEnv should be nonprod");
            assert.equal(config.isPreProd, false);
            assert.equal(config.isProd, false);
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

        it("should detect tri-environment AppEnv accurately", () => {
            assert.equal(detectAppEnv("nonprod"), "nonprod");
            assert.equal(detectAppEnv("preprod"), "preprod");
            assert.equal(detectAppEnv("staging"), "preprod");
            assert.equal(detectAppEnv("prod"), "prod");
            assert.equal(detectAppEnv("production"), "prod");
            assert.equal(detectAppEnv(undefined, "production"), "prod");
            assert.equal(detectAppEnv(undefined, "development"), "nonprod");
        });

        it("should validate environment using Zod and report missing variables in strict environments", () => {
            const invalidProdEnv = {
                APP_ENV: "prod",
                NODE_ENV: "production",
                // Missing MONGO_URI, JWT_SECRET, SSO vars
            };
            const result = validateServerEnv(invalidProdEnv, "prod", false);
            assert.equal(result.valid, false);
            assert.ok(result.errors.length >= 3);
            assert.ok(result.errors.some((e) => e.includes("MONGO_URI")));
            assert.ok(result.errors.some((e) => e.includes("JWT_SECRET")));

            const validNonProdEnv = {
                APP_ENV: "nonprod",
                NODE_ENV: "development",
            };
            const nonprodResult = validateServerEnv(validNonProdEnv, "nonprod", false);
            assert.equal(nonprodResult.valid, true);
        });
    });

    describe("7. Dynamic CORS Resolution (config/corsOptions.ts)", () => {
        it("should allow dev origins and local loopbacks in nonprod", () => {
            assert.equal(isOriginAllowed("http://localhost:5173", "nonprod"), true);
            assert.equal(isOriginAllowed("http://127.0.0.1:5173", "nonprod"), true);
            assert.equal(isOriginAllowed("http://localhost:3000", "nonprod"), true);
            assert.equal(isOriginAllowed(undefined, "nonprod"), true);
            assert.equal(isOriginAllowed("https://malicious.evil.com", "nonprod"), false);
        });

        it("should reject localhost in preprod and enforce configured whitelist", () => {
            const stagingWhitelist = "https://staging.huntinglodge.app,https://qa.huntinglodge.app";
            assert.equal(isOriginAllowed("http://localhost:5173", "preprod", stagingWhitelist), false);
            assert.equal(isOriginAllowed("https://staging.huntinglodge.app", "preprod", stagingWhitelist), true);
            assert.equal(isOriginAllowed("https://qa.huntinglodge.app", "preprod", stagingWhitelist), true);
            assert.equal(isOriginAllowed("https://evil.com", "preprod", stagingWhitelist), false);
        });

        it("should strictly enforce production origin whitelist with zero wildcard reflection", () => {
            const prodWhitelist = "https://huntinglodge.app";
            assert.equal(isOriginAllowed("http://localhost:5173", "prod", prodWhitelist), false);
            assert.equal(isOriginAllowed("https://huntinglodge.app", "prod", prodWhitelist), true);
            assert.equal(isOriginAllowed("https://attacker.com", "prod", prodWhitelist), false);
            assert.equal(isOriginAllowed(undefined, "prod", prodWhitelist), true);
        });

        it("should correctly resolve comma-separated origins and ignore wildcards", () => {
            const origins = resolveConfiguredOrigins("https://a.com, https://b.com, * ");
            assert.deepEqual(origins, ["https://a.com", "https://b.com"]);
        });
    });

    describe("8. Database Security & Cross-Environment Guard (config/db.ts)", () => {
        it("should safely mask MongoDB connection credentials in logs", () => {
            const masked = db.maskMongoUri("mongodb+srv://adminUser:SuperSecret123@cluster0.mongodb.net/hunting_lodge_prod");
            assert.ok(!masked.includes("SuperSecret123"));
            assert.ok(masked.includes("adminUser:***@cluster0.mongodb.net"));
        });

        it("should block production from connecting to localhost or dev databases", () => {
            assert.throws(() => {
                db.validateDatabaseTarget("mongodb://localhost:27017/hunting_lodge_prod", "prod");
            }, /cannot connect to a localhost/);

            assert.throws(() => {
                db.validateDatabaseTarget("mongodb+srv://admin:pass@cluster.net/hunting_lodge_nonprod", "prod");
            }, /cannot connect to a non-production database/);

            assert.doesNotThrow(() => {
                db.validateDatabaseTarget("mongodb+srv://admin:pass@cluster.net/hunting_lodge_prod", "prod");
            });
        });

        it("should block preprod from connecting to production database", () => {
            assert.throws(() => {
                db.validateDatabaseTarget("mongodb+srv://admin:pass@cluster.net/hunting_lodge_prod", "preprod");
            }, /cannot connect to the production database/);

            assert.doesNotThrow(() => {
                db.validateDatabaseTarget("mongodb+srv://admin:pass@cluster.net/hunting_lodge_preprod", "preprod");
            });
        });
    });
});

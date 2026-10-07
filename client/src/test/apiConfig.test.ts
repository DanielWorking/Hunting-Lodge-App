import { describe, it, expect } from "vitest";
import { detectClientAppEnv, apiConfig, getSsoCallbackUrl } from "../config/apiConfig";
import { envConfig } from "../config/env";

describe("Client Tri-Environment apiConfig & envConfig Suite", () => {
    it("should correctly detect AppEnv across variations", () => {
        expect(detectClientAppEnv("nonprod")).toBe("nonprod");
        expect(detectClientAppEnv("dev")).toBe("nonprod");
        expect(detectClientAppEnv("preprod")).toBe("preprod");
        expect(detectClientAppEnv("staging")).toBe("preprod");
        expect(detectClientAppEnv("prod")).toBe("prod");
        expect(detectClientAppEnv("production")).toBe("prod");
        expect(detectClientAppEnv(undefined, "development")).toBe("nonprod");
        expect(detectClientAppEnv(undefined, "production")).toBe("prod");
    });

    it("should provide immutable apiConfig with required helpers", () => {
        expect(apiConfig).toBeDefined();
        expect(Object.isFrozen(apiConfig)).toBe(true);
        expect(typeof apiConfig.apiUrl).toBe("string");
        expect(apiConfig.apiUrl.startsWith("/")).toBe(true);
        expect(apiConfig.ssoCallbackPath).toBe("/auth/callback");
        expect(typeof apiConfig.isNonProd).toBe("boolean");
        expect(typeof apiConfig.isPreProd).toBe("boolean");
        expect(typeof apiConfig.isProd).toBe("boolean");
    });

    it("should resolve ssoCallbackUrl based on window origin", () => {
        const url = getSsoCallbackUrl();
        expect(url.endsWith("/auth/callback")).toBe(true);
    });

    it("should maintain 100% backwards compatibility in envConfig", () => {
        expect(envConfig.apiUrl).toBe(apiConfig.apiUrl);
        expect(envConfig.appVersion).toBe(apiConfig.appVersion);
        expect(envConfig.isProd).toBe(apiConfig.isProd);
        expect(envConfig.isNonProd).toBe(apiConfig.isNonProd);
        expect(envConfig.isPreProd).toBe(apiConfig.isPreProd);
        expect(envConfig.mode).toBe(apiConfig.mode);
        expect(envConfig.appEnv).toBe(apiConfig.appEnv);
    });
});

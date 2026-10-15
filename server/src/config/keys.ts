/**
 * @module Config/Keys
 *
 * Cryptographic secret keys and authentication token lifespan settings.
 */

import "./env";
import { deepFreeze, validatedEnv } from "./env";
import type { JwtConfig } from "../types/config";

// JWT_SECRET (>= 32 chars) is required at startup by validateServerEnv in every environment.
// There is deliberately no fallback: a known default secret would let anyone forge tokens.

const rawJwtConfig: JwtConfig = {
    secret: validatedEnv.JWT_SECRET || "",
    expiresIn: validatedEnv.JWT_EXPIRES_IN || "7d",
};

const jwtConfig = deepFreeze(rawJwtConfig);

export default jwtConfig;

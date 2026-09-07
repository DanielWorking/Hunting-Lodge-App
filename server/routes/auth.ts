/**
 * @module AuthRoutes
 * 
 * Routes for user authentication via OpenID Connect (OIDC).
 * Migrated to strict TypeScript with schema validation and rate limiting.
 */

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import config from "../config";
import * as authController from "../controllers/authController";
import { protect } from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validationMiddleware";

const router = Router();

/**
 * Zod validation schema for SSO authorization code exchange.
 */
export const ssoLoginSchema = z.object({
    code: z.string({ message: "Authorization code missing" })
        .trim()
        .min(1, "Authorization code missing"),
});

export type SsoLoginInput = z.infer<typeof ssoLoginSchema>;

/**
 * Rate limiter for public authentication endpoints to prevent brute-force abuse.
 */
export const authRateLimiter = rateLimit({
    windowMs: config.security.rateLimitWindowMs || 15 * 60 * 1000,
    max: Math.min(config.security.rateLimitMax || 100, 50),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many authentication attempts, please try again after 15 minutes",
        code: "RATE_LIMIT_EXCEEDED",
    },
});

/**
 * GET /sso-url
 * 
 * Generates the authorization URL for the SSO provider.
 * The frontend uses this URL to redirect the user to the SSO login page.
 * Public endpoint protected by dedicated rate limiting.
 */
router.get("/sso-url", authRateLimiter, authController.getSsoUrl);

/**
 * POST /login
 * 
 * Completes the SSO authentication flow using an authorization code.
 * Exchanges the code for tokens, retrieves user claims, and manages 
 * user synchronization with the local database.
 * Public endpoint protected by rate limiting and strict Zod payload validation.
 */
router.post(
    "/login",
    authRateLimiter,
    validateRequest({ body: ssoLoginSchema }),
    authController.login,
);

/**
 * GET /me
 * 
 * Retrieves the currently authenticated user profile from token.
 * Protected endpoint requiring valid JWT Bearer token.
 */
router.get("/me", protect, authController.getMe);

(router as unknown as { default: typeof router }).default = router;
export default router;

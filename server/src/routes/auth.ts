/**
 * @module AuthRoutes
 * 
 * Express routes for user authentication via OpenID Connect (OIDC).
 * Supports modern openid-client v6.8.8 endpoints (/login, /callback, /me, /logout)
 * with backward-compatible aliases (/sso-url, POST /login).
 */

import { Router, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import config from "../config";
import * as authController from "../controllers/authController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

/**
 * Zod validation schema for SSO authorization code exchange.
 */
export const ssoLoginSchema = z.object({
    code: z.string({ message: "Authorization code missing" })
        .trim()
        .min(1, "Authorization code missing"),
    state: z.string().optional(),
});

export type SsoLoginInput = z.infer<typeof ssoLoginSchema>;

const validateSsoLogin: RequestHandler = (req, res, next) => {
    const parseResult = ssoLoginSchema.safeParse(req.body);
    if (!parseResult.success) {
        res.status(400).json({
            message: "Invalid login payload",
            errors: parseResult.error.format(),
        });
        return;
    }
    req.body = parseResult.data;
    next();
};

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
 * GET /login
 * 
 * Initiates the OIDC login flow.
 * Generates PKCE verifier/challenge, state, and nonce.
 * Sets transient HTTP-only cookie and redirects browser to Identity Provider.
 * Accepts `?format=json` query parameter to return { url } instead of redirecting.
 */
router.get("/login", authRateLimiter, authController.login);

/**
 * GET /sso-url
 * 
 * Backward compatibility endpoint for frontend SPA to fetch the SSO redirect URL.
 */
router.get("/sso-url", authRateLimiter, authController.getSsoUrl);

/**
 * GET /callback
 * 
 * Handles the OIDC redirect from the Identity Provider.
 * Validates state and nonce, completes PKCE code exchange, provisions user,
 * sets the secure HTTP-only session cookie (hl_session), and redirects to application root.
 */
router.get("/callback", authRateLimiter, authController.callback);

/**
 * POST /login
 * 
 * Backward compatibility endpoint for SPA client exchanging authorization code via POST.
 * Validates transient state, exchanges tokens, sets session cookie, and returns { user, token }.
 */
router.post("/login", authRateLimiter, validateSsoLogin, authController.callback);

/**
 * GET /me
 * 
 * Retrieves the currently authenticated user profile.
 * Protected endpoint requiring valid hl_session cookie or Bearer token.
 */
router.get("/me", protect, authController.getMe);

/**
 * POST /logout
 * 
 * Clears session and transient cookies, invalidates token signature cache,
 * and optionally returns the Identity Provider's end-session URL.
 */
router.post("/logout", authController.logout);

(router as unknown as { default: typeof router }).default = router;
export default router;

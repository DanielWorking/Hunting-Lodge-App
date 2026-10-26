/**
 * @module RateLimitMiddleware
 *
 * Global API rate limiter. Each signed-in user has their own budget; callers without a valid
 * session token share their IP's budget. Rejections are JSON
 * (`{ message, code: "RATE_LIMIT_EXCEEDED" }`), matching the auth limiter and every
 * other error body, so clients that parse JSON on 4xx responses never hit a plain-text 429.
 * Responses carry the standard `RateLimit-*` headers, and a 429 also carries `Retry-After`.
 */

import { Request, RequestHandler } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import ssoConfig from "../config/sso";
import { verifyToken } from "../utils/jwt";

export interface GlobalRateLimiterOptions {
    readonly windowMs: number;
    readonly max: number;
}

export interface RateLimitErrorResponse {
    readonly message: string;
    readonly code: "RATE_LIMIT_EXCEEDED";
}

const MS_PER_MINUTE = 60 * 1000;

/**
 * Paths that are never rate limited by the global limiter: auth routes have their own
 * stricter limiter, and Kubernetes/OpenShift probes poll continuously.
 */
export function isExemptFromGlobalRateLimit(req: Request): boolean {
    return (
        req.path.startsWith("/api/auth") ||
        req.path === "/api/health" ||
        req.path === "/healthz" ||
        req.path === "/startup"
    );
}

/** The session token as `protect` reads it: the httpOnly session cookie. */
function sessionTokenOf(req: Request): string | undefined {
    const cookieToken = req.cookies?.[ssoConfig.sessionCookieName];
    return typeof cookieToken === "string" ? cookieToken.trim() || undefined : undefined;
}

/**
 * Which budget a request counts against: `user:<id>` for a correctly signed, unexpired session
 * token (no database call), otherwise the caller's IP. Forged or expired tokens fall back to the
 * IP, so they cannot open fresh budgets. Access itself is still decided by `protect`.
 */
export function rateLimitKey(req: Request): string {
    const token = sessionTokenOf(req);
    if (token) {
        try {
            const userId = verifyToken(token).userId;
            if (typeof userId === "string" && userId.length > 0) {
                return `user:${userId}`;
            }
        } catch {
            // Invalid or expired: count against the IP
        }
    }
    return `ip:${ipKeyGenerator(req.ip || "")}`;
}

/**
 * Creates the global API rate limiter.
 *
 * @param options - Window length and the request budget per user (or per IP for callers
 *                  without a valid session) within that window.
 */
export function createGlobalRateLimiter(options: GlobalRateLimiterOptions): RequestHandler {
    const windowMinutes = Math.max(1, Math.ceil(options.windowMs / MS_PER_MINUTE));
    const rejection: RateLimitErrorResponse = {
        message: `Too many requests, please try again after ${windowMinutes} minute${windowMinutes === 1 ? "" : "s"}`,
        code: "RATE_LIMIT_EXCEEDED",
    };

    return rateLimit({
        windowMs: options.windowMs,
        max: options.max,
        message: rejection,
        skip: isExemptFromGlobalRateLimit,
        keyGenerator: rateLimitKey,
        // RateLimit-Limit / -Remaining / -Reset on every response, Retry-After on a 429
        standardHeaders: "draft-6",
        legacyHeaders: false,
    });
}

export default createGlobalRateLimiter;

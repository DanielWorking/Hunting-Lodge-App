/**
 * @file cacheMiddleware.ts
 *
 * Provides HTTP Cache-Control header middleware for read-heavy endpoints.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Attaches private Cache-Control headers with stale-while-revalidate semantics.
 *
 * @param maxAgeSeconds - Max cache age in seconds (default: 60)
 * @param staleWhileRevalidate - Stale-while-revalidate window in seconds (default: 300)
 */
export const httpCache = (
    maxAgeSeconds: number = 60,
    staleWhileRevalidate: number = 300
): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (req.method === "GET") {
            res.setHeader(
                "Cache-Control",
                `private, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidate}`
            );
        }
        next();
    };
};

export default {
    httpCache,
};

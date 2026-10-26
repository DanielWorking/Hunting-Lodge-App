/**
 * @file cacheMiddleware.ts
 *
 * Provides HTTP Cache-Control header middleware.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Forbids browsers, webviews and proxies from storing or reusing the response.
 * Used on list and mutation endpoints whose data changes on write: a cached list
 * would show pre-edit data after a save, and could leak one user's list to the
 * next user of the same browser.
 */
export const noStore: RequestHandler = (
    _req: Request,
    res: Response,
    next: NextFunction
): void => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
};

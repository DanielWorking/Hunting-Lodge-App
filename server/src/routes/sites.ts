/**
 * @module SiteRoutes
 * 
 * Provides API endpoints for managing group-specific web resources and links.
 * Includes features for resource creation, duplicate URL validation within groups,
 * and user-specific favoriting.
 */

import { Request, Router } from "express";
import { z } from "zod";
import * as sitesController from "../controllers/sitesController";
import { protect, requireGroupMember } from "../middleware/authMiddleware";
import { validateRequest, objectIdString } from "../middleware/validationMiddleware";
import { noStore } from "../middleware/cacheMiddleware";

const router = Router();

// --- Validation Schemas ---

export const siteIdParamSchema = z.object({
    id: z.string().trim().min(1, "Site ID is required"),
});

export const getSitesQuerySchema = z.object({
    groupId: objectIdString("groupId").optional(),
});

export const createSiteSchema = z.object({
    groupId: objectIdString("groupId"),
    title: z.string({ message: "Title is required" }).trim().min(1, "Title is required"),
    url: z.string({ message: "URL is required" }).trim().min(1, "URL is required"),
    imageUrl: z.string().optional(),
    description: z.string().optional(),
    tag: z.string().optional(),
}).passthrough();

export const updateSiteSchema = z.object({
    title: z.string().optional(),
    url: z.string().optional(),
    groupId: objectIdString("groupId").optional(),
    imageUrl: z.string().optional(),
    description: z.string().optional(),
    tag: z.string().optional(),
}).passthrough();

// Site data changes on every write, so no response from this router may be cached by the client.
// Applied before protect() so that rejected requests are covered too.
router.use(noStore);

// Ensure all site routes are protected by authentication
router.use(protect);

/**
 * GET /
 * Retrieves sites/resources accessible to the user based on group membership.
 * Authorization: Requires valid JWT.
 */
router.get(
    "/",
    validateRequest({ query: getSitesQuerySchema }),
    sitesController.getSites,
);

/**
 * POST /
 * Creates a new web resource entry for a specific group.
 * Authorization: User must be a member of the target group or an Administrator.
 */
router.post(
    "/",
    validateRequest({ body: createSiteSchema }),
    requireGroupMember((req: Request) => req.body.groupId),
    sitesController.createSite,
);

/**
 * PATCH /:id
 * Partially updates an existing resource entry: only the fields present in the body
 * are changed; omitted fields keep their stored values.
 * Authorization: User must be an explicit member of the site's group (Administrators included; controller-enforced).
 */
router.patch(
    "/:id",
    validateRequest({ params: siteIdParamSchema, body: updateSiteSchema }),
    sitesController.updateSite,
);

/**
 * DELETE /:id
 * Deletes a resource from the repository.
 * Authorization: User must be a member of the site's group or an Administrator.
 */
router.delete(
    "/:id",
    validateRequest({ params: siteIdParamSchema }),
    sitesController.deleteSite,
);

/**
 * PUT /:id/favorite
 * Toggles the favorite status of a resource for the authenticated user.
 * Authorization: User must be a member of the site's group or an Administrator.
 */
router.put(
    "/:id/favorite",
    validateRequest({ params: siteIdParamSchema }),
    sitesController.toggleFavorite,
);

export default router;

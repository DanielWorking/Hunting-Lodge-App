/**
 * @module SiteRoutes
 * 
 * Provides API endpoints for managing group-specific web resources and links.
 * Includes features for resource creation, duplicate URL validation within groups,
 * and user-specific favoriting.
 * Migrated to strict TypeScript with schema validation and RBAC guardrails.
 */

import { Request, Router } from "express";
import { z } from "zod";
import * as sitesController from "../controllers/sitesController";
import { protect, requireGroupMember } from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validationMiddleware";

const router = Router();

// --- Validation Schemas ---

export const siteIdParamSchema = z.object({
    id: z.string().trim().min(1, "Site ID is required"),
});

export const getSitesQuerySchema = z.object({
    groupId: z.string().trim().min(1).optional(),
});

export const createSiteSchema = z.object({
    groupId: z.string({ message: "Target groupId is required." }).trim().min(1, "Target groupId is required."),
    title: z.string({ message: "Title is required" }).trim().min(1, "Title is required"),
    url: z.string({ message: "URL is required" }).trim().min(1, "URL is required"),
    imageUrl: z.string().optional(),
    description: z.string().optional(),
    tag: z.string().optional(),
}).passthrough();

export const updateSiteSchema = z.object({
    title: z.string().optional(),
    url: z.string().optional(),
    groupId: z.string().optional(),
    imageUrl: z.string().optional(),
    description: z.string().optional(),
    tag: z.string().optional(),
}).passthrough();

export type GetSitesQueryInput = z.infer<typeof getSitesQuerySchema>;
export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;

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
 * PUT /:id
 * Updates an existing resource entry.
 * Authorization: User must be a member of the site's group or an Administrator.
 */
router.put(
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

(router as unknown as { default: typeof router }).default = router;
export default router;

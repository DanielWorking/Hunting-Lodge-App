/**
 * @module GroupRoutes
 * 
 * Provides API endpoints for managing groups, including their metadata,
 * shift settings, site tags, and member synchronization.
 * Migrated to strict TypeScript with schema validation and RBAC guardrails.
 */

import { Request, Router } from "express";
import { z } from "zod";
import * as groupsController from "../controllers/groupsController";
import {
    protect,
    requireAdmin,
    requireGroupMember,
    requireShiftManager,
} from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validationMiddleware";

const router = Router();

// --- Validation Schemas ---

export const groupIdParamSchema = z.object({
    id: z.string().trim().min(1, "Group ID is required"),
});

export const createGroupSchema = z.object({
    name: z.string({ message: "Group name is required" }).trim().min(1, "Group name is required"),
});

export const addTagSchema = z.object({
    tagName: z.string({ message: "Tag name is required" }).trim().min(1, "Tag name is required"),
});

// Tag names travel in the body or the query string, never in the path: names may contain "/",
// spaces or other reserved characters (e.g. "Tier 1 / Alpha")
export const renameTagSchema = z.object({
    tagName: z.string({ message: "Tag name is required" }).trim().min(1, "Tag name is required"),
    newTagName: z.string({ message: "New tag name is required" }).trim().min(1, "New tag name is required"),
});

export const deleteTagQuerySchema = z.object({
    tagName: z.string({ message: "Tag name is required" }).trim().min(1, "Tag name is required"),
});

export const updateSettingsSchema = z.object({
    shiftTypes: z.array(
        z.object({
            name: z.string().min(1, "Shift type name is required"),
        }).passthrough(),
    ).optional(),
    timeSlots: z.array(z.record(z.string(), z.unknown())).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

export const updateGroupSchema = z.object({
    name: z.string().trim().min(1).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    siteTags: z.array(z.string()).optional(),
}).passthrough();

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type AddTagInput = z.infer<typeof addTagSchema>;
export type RenameTagInput = z.infer<typeof renameTagSchema>;
export type DeleteTagQueryInput = z.infer<typeof deleteTagQuerySchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

// Ensure all group routes require authentication
router.use(protect);

/**
 * GET /
 * Retrieves groups. Administrators receive all groups; regular users receive assigned groups.
 */
router.get("/", groupsController.getGroups);

/**
 * POST /
 * Creates a new organizational group.
 * Authorization: Restricted to Administrators.
 */
router.post(
    "/",
    requireAdmin,
    validateRequest({ body: createGroupSchema }),
    groupsController.createGroup,
);

// === TAG MANAGEMENT ROUTES ===

/**
 * POST /:id/tags
 * Adds a new tag to the group for categorizing sites.
 * Authorization: Requires explicit group membership.
 */
router.post(
    "/:id/tags",
    validateRequest({ params: groupIdParamSchema, body: addTagSchema }),
    requireGroupMember((req: Request) => req.params.id),
    groupsController.addTag,
);

/**
 * PUT /:id/tags
 * Renames an existing tag and updates all associated sites.
 * Body: `{ tagName, newTagName }`. The names are body fields, not path segments, so they may
 * contain "/", spaces or any other character.
 * Authorization: Requires explicit group membership.
 */
router.put(
    "/:id/tags",
    validateRequest({ params: groupIdParamSchema, body: renameTagSchema }),
    requireGroupMember((req: Request) => req.params.id),
    groupsController.renameTag,
);

/**
 * DELETE /:id/tags?tagName=…
 * Deletes a tag and moves all associated sites to the "General" tag.
 * The name is a query parameter (URL-encoded as usual), because some proxies and clients drop
 * DELETE bodies. Answers 404 NOT_FOUND when the group has no such tag.
 * Authorization: Requires explicit group membership.
 */
router.delete(
    "/:id/tags",
    validateRequest({ params: groupIdParamSchema, query: deleteTagQuerySchema }),
    requireGroupMember((req: Request) => req.params.id),
    groupsController.deleteTag,
);

// === SETTINGS UPDATE ROUTE ===

/**
 * PUT /:id/settings
 * Updates group settings like shift types and time slots.
 * Authorization: Strictly restricted to the Shift Manager of this group.
 */
router.put(
    "/:id/settings",
    validateRequest({ params: groupIdParamSchema }),
    requireShiftManager((req: Request) => req.params.id),
    validateRequest({ body: updateSettingsSchema }),
    groupsController.updateSettings,
);

// === GENERAL GROUP UPDATE (Admin Only) ===

/**
 * PATCH /:id
 * Partially updates general group metadata: only the fields present in the body
 * (name, settings, siteTags) are changed; omitted fields keep their stored values.
 * Authorization: Restricted to Administrators.
 */
router.patch(
    "/:id",
    requireAdmin,
    validateRequest({ params: groupIdParamSchema, body: updateGroupSchema }),
    groupsController.updateGroup,
);

// === DELETE GROUP (Admin Only) ===

/**
 * DELETE /:id
 * Deletes a group and cleans up all related resources.
 * Authorization: Restricted to Administrators.
 */
router.delete(
    "/:id",
    requireAdmin,
    validateRequest({ params: groupIdParamSchema }),
    groupsController.deleteGroup,
);

(router as unknown as { default: typeof router }).default = router;
export default router;

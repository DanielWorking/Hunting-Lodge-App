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

export const groupTagParamSchema = z.object({
    id: z.string().trim().min(1, "Group ID is required"),
    tagName: z.string().trim().min(1, "Tag name is required"),
});

export const createGroupSchema = z.object({
    name: z.string().trim().min(1).optional(),
    id: z.string().trim().min(1).optional(),
}).refine((data) => (data.name && data.name.trim().length > 0) || (data.id && data.id.trim().length > 0), {
    message: "Group name is required",
});

export const addTagSchema = z.object({
    tagName: z.string({ message: "Tag name is required" }).trim().min(1, "Tag name is required"),
});

export const renameTagSchema = z.object({
    newTagName: z.string({ message: "New tag name is required" }).trim().min(1, "New tag name is required"),
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
 * PUT /:id/tags/:tagName
 * Renames an existing tag and updates all associated sites.
 * Authorization: Requires explicit group membership.
 */
router.put(
    "/:id/tags/:tagName",
    validateRequest({ params: groupTagParamSchema, body: renameTagSchema }),
    requireGroupMember((req: Request) => req.params.id),
    groupsController.renameTag,
);

/**
 * DELETE /:id/tags/:tagName
 * Deletes a tag and moves all associated sites to the "General" tag.
 * Authorization: Requires explicit group membership.
 */
router.delete(
    "/:id/tags/:tagName",
    validateRequest({ params: groupTagParamSchema }),
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
 * PUT /:id
 * Updates general group metadata.
 * Authorization: Restricted to Administrators.
 */
router.put(
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

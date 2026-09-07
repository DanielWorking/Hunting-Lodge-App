/**
 * @module PhoneRoutes
 * 
 * Provides API endpoints for managing a shared contact directory.
 * Includes features for contact creation, duplicate number validation,
 * and user-specific favorite phone lists.
 * Migrated to strict TypeScript with schema validation and RBAC guardrails.
 */

import { Router } from "express";
import { z } from "zod";
import * as phonesController from "../controllers/phonesController";
import { protect } from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validationMiddleware";

const router = Router();

// --- Validation Schemas ---

export const phoneIdParamSchema = z.object({
    id: z.string().trim().min(1, "Phone ID is required"),
});

export const createPhoneSchema = z.object({
    name: z.string({ message: "Contact name is required" }).trim().min(1, "Contact name is required"),
    numbers: z.array(z.union([z.string(), z.number()]), { message: "At least one phone number is required" })
        .min(1, "At least one phone number is required"),
    type: z.string().optional(),
    description: z.string().optional(),
}).passthrough();

export const updatePhoneSchema = z.object({
    name: z.string().trim().min(1, "Valid contact name is required").optional(),
    numbers: z.array(z.union([z.string(), z.number()]))
        .min(1, "At least one phone number is required")
        .optional(),
    type: z.string().optional(),
    description: z.string().optional(),
}).passthrough();

export type CreatePhoneInput = z.infer<typeof createPhoneSchema>;
export type UpdatePhoneInput = z.infer<typeof updatePhoneSchema>;

// Ensure all routes are protected by authentication
router.use(protect);

/**
 * GET /
 * Retrieves all phone contacts, sorted alphabetically by name.
 * Dynamically adds an `isFavorite` flag based on the current user's preferences.
 * Authorization: Requires valid JWT.
 */
router.get("/", phonesController.getPhones);

/**
 * POST /
 * Creates a new phone contact entry.
 * Validates that the provided numbers do not already exist in the directory.
 * Authorization: Requires valid JWT.
 */
router.post(
    "/",
    validateRequest({ body: createPhoneSchema }),
    phonesController.createPhone,
);

/**
 * PUT /:id
 * Updates an existing phone contact entry.
 * Ensures that updated numbers do not conflict with other existing contacts.
 * Authorization: Requires valid JWT.
 */
router.put(
    "/:id",
    validateRequest({ params: phoneIdParamSchema, body: updatePhoneSchema }),
    phonesController.updatePhone,
);

/**
 * PATCH /:id/favorite
 * Toggles the favorite status of a specific phone contact for the current user.
 * Authorization: Requires valid JWT.
 */
router.patch(
    "/:id/favorite",
    validateRequest({ params: phoneIdParamSchema }),
    phonesController.toggleFavorite,
);

/**
 * DELETE /:id
 * Removes a phone contact from the directory.
 * Authorization: Requires valid JWT.
 */
router.delete(
    "/:id",
    validateRequest({ params: phoneIdParamSchema }),
    phonesController.deletePhone,
);

(router as unknown as { default: typeof router }).default = router;
export default router;

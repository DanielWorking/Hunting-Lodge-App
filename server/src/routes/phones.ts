/**
 * @module PhoneRoutes
 * 
 * Provides API endpoints for managing a shared contact directory.
 * Includes features for contact creation, duplicate number validation,
 * and user-specific favorite phone lists.
 */

import { Router } from "express";
import { z } from "zod";
import * as phonesController from "../controllers/phonesController";
import { PHONE_TYPES } from "../models/Phone";
import { protect } from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validationMiddleware";
import { noStore } from "../middleware/cacheMiddleware";

const router = Router();

// --- Validation Schemas ---

export const phoneIdParamSchema = z.object({
    id: z.string().trim().min(1, "Phone ID is required"),
});

// Mirrors the Phone model's required `type` enum so bad input fails here with field-level errors
const phoneTypeSchema = z.enum(PHONE_TYPES, {
    message: `Phone type is required and must be one of: ${PHONE_TYPES.join(", ")}`,
});

export const createPhoneSchema = z.object({
    name: z.string({ message: "Contact name is required" }).trim().min(1, "Contact name is required"),
    numbers: z.array(z.union([z.string(), z.number()]), { message: "At least one phone number is required" })
        .min(1, "At least one phone number is required"),
    type: phoneTypeSchema,
    description: z.string().optional(),
}).passthrough();

export const updatePhoneSchema = z.object({
    name: z.string().trim().min(1, "Valid contact name is required").optional(),
    numbers: z.array(z.union([z.string(), z.number()]))
        .min(1, "At least one phone number is required")
        .optional(),
    type: phoneTypeSchema.optional(),
    description: z.string().optional(),
}).passthrough();

// Phone data changes on every write, so no response from this router may be cached by the client.
// Applied before protect() so that rejected requests are covered too.
router.use(noStore);

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
 * PATCH /:id
 * Partially updates an existing phone contact entry: only the fields present in the
 * body are changed; omitted fields keep their stored values.
 * Ensures that updated numbers do not conflict with other existing contacts.
 * Authorization: Requires valid JWT.
 */
router.patch(
    "/:id",
    validateRequest({ params: phoneIdParamSchema, body: updatePhoneSchema }),
    phonesController.updatePhone,
);

/**
 * PATCH /:id/favorite
 * Toggles the favorite status of a specific phone contact for the current user.
 * Adding a favorite requires the contact to exist (404 otherwise); removing one always succeeds.
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

export default router;

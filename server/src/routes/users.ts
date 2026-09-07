/**
 * @module UserRoutes
 * 
 * Provides API endpoints for user management, including authentication,
 * profile updates, group synchronization, and administrative controls.
 * Migrated to strict TypeScript with schema validation and RBAC guardrails.
 */

import { Request, Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import config from "../config";
import * as usersController from "../controllers/usersController";
import { protect, requireAdmin, requireShiftManager } from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validationMiddleware";

const router = Router();

// --- Validation Schemas ---

export const userLoginSchema = z.object({
    username: z.string({ message: "Valid username is required" })
        .trim()
        .min(1, "Valid username is required"),
});

export const getUsersQuerySchema = z.object({
    groupId: z.string().trim().min(1).optional(),
});

export const userIdParamSchema = z.object({
    id: z.string().trim().min(1, "User ID is required"),
});

export const reorderUsersSchema = z.object({
    groupId: z.string({ message: "groupId is required" }).trim().min(1, "groupId is required"),
    updates: z.array(
        z.object({
            userId: z.string({ message: "userId is required" }).trim().min(1, "userId must be a valid ID"),
            order: z.number({ message: "order must be numeric" }),
        }),
        { message: "updates array is required" }
    ).min(1, "updates array must contain at least 1 item").max(200, "updates array cannot exceed 200 items"),
});

export const updateUserSchema = z.object({
    email: z.string().email("Please provide a valid email address").optional(),
    isActive: z.boolean().optional(),
    groups: z.array(
        z.object({
            groupId: z.unknown(),
            role: z.string().optional(),
            order: z.number().optional(),
        }),
    ).optional(),
    favoritePhones: z.array(z.string()).optional(),
    displayName: z.string().optional(),
}).passthrough();

export const managerUpdateSchema = z.object({
    isActive: z.boolean().optional(),
    vacationBalance: z.number().min(0, "Vacation balance cannot be negative").optional(),
    vacationDays: z.number().min(0, "Vacation balance cannot be negative").optional(),
    displayName: z.string().optional(),
}).passthrough();

export type UserLoginInput = z.infer<typeof userLoginSchema>;
export type ReorderUsersInput = z.infer<typeof reorderUsersSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ManagerUpdateInput = z.infer<typeof managerUpdateSchema>;

// Rate limiter for public local login endpoint
export const loginRateLimiter = rateLimit({
    windowMs: config.security.rateLimitWindowMs || 15 * 60 * 1000,
    max: Math.min(config.security.rateLimitMax || 100, 30),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many login attempts, please try again after 15 minutes",
        code: "RATE_LIMIT_EXCEEDED",
    },
});

// --- Public Routes ---

/**
 * POST /login
 * Handles local user login. Public endpoint protected by rate limiting.
 */
router.post(
    "/login",
    loginRateLimiter,
    validateRequest({ body: userLoginSchema }),
    usersController.login,
);

// --- Protected Routes ---
router.use(protect);

/**
 * GET /
 * Retrieves users. Group-scoped query requires group membership or Admin; full directory strictly Admin.
 */
router.get(
    "/",
    validateRequest({ query: getUsersQuerySchema }),
    usersController.getUsers,
);

/**
 * PUT /reorder/group
 * Updates the display order of users within a specific group.
 * Authorization: Restricted to Shift Managers of the group.
 */
router.put(
    "/reorder/group",
    validateRequest({ body: reorderUsersSchema }),
    requireShiftManager((req: Request) => req.body.groupId),
    usersController.reorderUsers,
);

/**
 * PUT /:id
 * Updates user profile and synchronizes group memberships.
 * Authorization: Strictly restricted to Administrators.
 */
router.put(
    "/:id",
    requireAdmin,
    validateRequest({ params: userIdParamSchema, body: updateUserSchema }),
    usersController.updateUser,
);

/**
 * DELETE /:id
 * Deletes a user and cleans up memberships.
 * Authorization: Strictly restricted to Administrators.
 */
router.delete(
    "/:id",
    requireAdmin,
    validateRequest({ params: userIdParamSchema }),
    usersController.deleteUser,
);

/**
 * PATCH /:id/manager-update
 * Performs administrative updates on a user (Status & Vacation Balance).
 * Authorization: Requires valid JWT; controller enforces Admin or target user's group Shift Manager.
 */
router.patch(
    "/:id/manager-update",
    validateRequest({ params: userIdParamSchema, body: managerUpdateSchema }),
    usersController.managerUpdate,
);

(router as unknown as { default: typeof router }).default = router;
export default router;

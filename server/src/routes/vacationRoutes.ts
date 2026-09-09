/**
 * @module VacationRoutes
 * 
 * Provides API endpoints for employee vacation requests and balance aggregation.
 * Supports half-day (0.5) and full-day (1.0) vacation values with strict RBAC guardrails.
 */

import { Request, Router } from "express";
import { z } from "zod";
import * as vacationController from "../controllers/vacationController";
import {
    protect,
    requireGroupMember,
} from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validationMiddleware";

const router = Router();

// Validation Schemas
export const createVacationRequestSchema = z.object({
    groupId: z.string({ message: "Missing groupId" }).trim().min(1, "Missing groupId"),
    date: z.string({ message: "Missing date" }).trim().min(1, "Missing date"),
    vacationValue: z.union([z.literal(0.5), z.literal(1.0)]).default(1.0),
    notes: z.string().max(500, "Notes cannot exceed 500 characters").optional(),
});

export const getVacationRequestsQuerySchema = z.object({
    groupId: z.string({ message: "Missing groupId" }).trim().min(1, "Missing groupId"),
    status: z.enum(["pending", "approved", "rejected"]).optional(),
    userId: z.string().optional(),
});

export const updateVacationStatusSchema = z.object({
    status: z.enum(["approved", "rejected"], { message: "Status must be approved or rejected" }),
});

export const aggregateBalanceQuerySchema = z.object({
    groupId: z.string({ message: "Missing groupId" }).trim().min(1, "Missing groupId"),
    userId: z.string({ message: "Missing userId" }).trim().min(1, "Missing userId"),
});

// All routes require authentication
router.use(protect);

/**
 * POST /api/vacations
 * Creates a new vacation request for the logged-in user.
 */
router.post(
    "/",
    validateRequest({ body: createVacationRequestSchema }),
    requireGroupMember((req: Request) => req.body.groupId),
    vacationController.createVacationRequest,
);

/**
 * GET /api/vacations
 * Retrieves vacation requests for a group.
 */
router.get(
    "/",
    validateRequest({ query: getVacationRequestsQuerySchema }),
    requireGroupMember((req: Request) => req.query.groupId as string | undefined),
    vacationController.getVacationRequests,
);

/**
 * PATCH /api/vacations/:id/status
 * Approves or rejects a vacation request with atomic balance adjustments.
 * Restricted strictly to group Shift Managers.
 */
router.patch(
    "/:id/status",
    validateRequest({ body: updateVacationStatusSchema }),
    vacationController.updateVacationRequestStatus,
);

/**
 * GET /api/vacations/balance
 * Aggregates accrued and deducted vacation balance for a user according to vacationValue.
 */
router.get(
    "/balance",
    validateRequest({ query: aggregateBalanceQuerySchema }),
    requireGroupMember((req: Request) => req.query.groupId as string | undefined),
    vacationController.aggregateVacationBalance,
);

(router as unknown as { default: typeof router }).default = router;
export default router;

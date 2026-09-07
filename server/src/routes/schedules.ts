/**
 * @module ScheduleRoutes
 * 
 * Provides API endpoints for managing shift schedules.
 * Features include schedule retrieval, saving (with vacation balance management),
 * and publishing schedules to members.
 * Migrated to strict TypeScript with schema validation and RBAC guardrails.
 */

import { Request, Router } from "express";
import { z } from "zod";
import * as schedulesController from "../controllers/schedulesController";
import {
    protect,
    requireGroupMember,
    requireShiftManager,
} from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validationMiddleware";

const router = Router();

// --- Validation Schemas ---

export const getScheduleQuerySchema = z.object({
    groupId: z.string({ message: "Missing groupId" }).trim().min(1, "Missing groupId"),
    date: z.string({ message: "Missing date" }).trim().min(1, "Missing date"),
});

export const saveScheduleSchema = z.object({
    groupId: z.string({ message: "Missing groupId" }).trim().min(1, "Missing groupId"),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    shifts: z.array(z.record(z.string(), z.unknown())).optional(),
}).passthrough();

export const publishScheduleSchema = z.object({
    scheduleId: z.string({ message: "Missing scheduleId" }).trim().min(1, "Missing scheduleId"),
});

export const getAllSchedulesQuerySchema = z.object({
    groupId: z.string({ message: "Missing groupId" }).trim().min(1, "Missing groupId"),
});

export type GetScheduleQueryInput = z.infer<typeof getScheduleQuerySchema>;
export type SaveScheduleInput = z.infer<typeof saveScheduleSchema>;
export type PublishScheduleInput = z.infer<typeof publishScheduleSchema>;
export type GetAllSchedulesQueryInput = z.infer<typeof getAllSchedulesQuerySchema>;

// Ensure all routes are protected by authentication
router.use(protect);

/**
 * GET /
 * Retrieves a specific schedule for a group based on a start date.
 * Draft schedules are only visible to Shift Managers of the group.
 * Authorization: Requires valid JWT and group membership.
 */
router.get(
    "/",
    validateRequest({ query: getScheduleQuerySchema }),
    requireGroupMember((req: Request) => req.query.groupId as string | undefined),
    schedulesController.getSchedule,
);

/**
 * PUT /
 * Saves or updates a shift schedule draft.
 * Authorization: Strictly restricted to the Shift Manager of the group.
 */
router.put(
    "/",
    validateRequest({ body: saveScheduleSchema }),
    requireShiftManager((req: Request) => req.body.groupId),
    schedulesController.saveSchedule,
);

/**
 * POST /publish
 * Publishes a schedule, making it visible to all group members,
 * and automatically deducts vacation days.
 * Authorization: Controller enforces Shift Manager role in the schedule's group.
 */
router.post(
    "/publish",
    validateRequest({ body: publishScheduleSchema }),
    schedulesController.publishSchedule,
);

/**
 * GET /all
 * Retrieves all schedules for a specific group.
 * Filters unpublished schedules for non-shift-manager members.
 * Authorization: Requires valid JWT and group membership.
 */
router.get(
    "/all",
    validateRequest({ query: getAllSchedulesQuerySchema }),
    requireGroupMember((req: Request) => req.query.groupId as string | undefined),
    schedulesController.getAllSchedules,
);

(router as unknown as { default: typeof router }).default = router;
export default router;

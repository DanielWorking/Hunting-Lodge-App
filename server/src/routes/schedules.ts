/**
 * @module ScheduleRoutes
 * 
 * Provides API endpoints for managing shift schedules.
 * Features include schedule retrieval, draft saving (never touches vacation balances),
 * and publishing schedules to members (settles vacation balances).
 */

import { Request, Router } from "express";
import { z } from "zod";
import * as schedulesController from "../controllers/schedulesController";
import {
    protect,
    requireGroupMember,
    requireShiftManager,
} from "../middleware/authMiddleware";
import { validateRequest, isoDateString, objectIdString } from "../middleware/validationMiddleware";

const router = Router();

// --- Validation Schemas ---

export const getScheduleQuerySchema = z.object({
    groupId: objectIdString("groupId"),
    date: isoDateString("date"),
});

/**
 * One shift assignment as accepted from clients. Unknown keys are stripped, which
 * includes the server-managed `vacationDeducted` flag: only the server decides
 * whether a vacation shift has already been charged against a balance.
 */
export const shiftAssignmentSchema = z.object({
    userId: objectIdString("shifts.userId"),
    shiftTypeId: objectIdString("shifts.shiftTypeId"),
    date: isoDateString("shifts.date"),
    vacationValue: z
        .union([z.literal(0.5), z.literal(1)], { message: "vacationValue must be either 0.5 or 1.0" })
        .optional(),
});

export const saveScheduleSchema = z.object({
    groupId: objectIdString("groupId"),
    startDate: isoDateString("startDate"),
    endDate: isoDateString("endDate"),
    shifts: z.array(shiftAssignmentSchema, { message: "shifts must be an array of shift assignments" }),
}).refine((data) => new Date(data.endDate).getTime() >= new Date(data.startDate).getTime(), {
    message: "endDate must not be before startDate",
    path: ["endDate"],
});

export const publishScheduleSchema = z.object({
    scheduleId: z.string({ message: "Missing scheduleId" }).trim().min(1, "Missing scheduleId"),
    // The revision the manager confirmed (returned by GET/PUT); a newer draft is never published instead
    revision: z.number().int().nonnegative().optional(),
});

export const getAllSchedulesQuerySchema = z.object({
    groupId: objectIdString("groupId"),
});

// Ensure all routes are protected by authentication
router.use(protect);

/**
 * GET /
 * Retrieves the group's schedule that covers `date` (its `startDate` or any day up to its `endDate`).
 * Answers 404 NOT_FOUND when no visible schedule covers that date.
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
 * Saves a draft and never changes vacation balances. For a published schedule only its
 * `draftShifts` are written, so members keep seeing the published shifts until a publish
 * succeeds; an unpublished schedule is upserted (and can never overwrite a schedule that was
 * published meanwhile). Only active members' shifts are taken; everyone else's published shifts
 * are kept as they are. A save that changes nothing writes nothing (same revision). Responds with
 * the Shift Manager's view of the schedule.
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
 * and automatically deducts vacation days. All-or-nothing: if any active group member (the
 * Shift Manager included) lacks the balance for their vacation shifts, nothing is deducted, the
 * publish flag is not set, and the call answers 400 INSUFFICIENT_VACATION_BALANCE listing them.
 * Deactivated members and users no longer in the group are outside the schedule: their published
 * shifts are kept unchanged and they are never charged, refunded or blocking.
 * A published week with nothing pending answers 200 with `unchanged: true` and changes nothing.
 * Runs in one MongoDB transaction: balances, the published schedule and the automatic attendees
 * of the group's reports from today onwards change together or not at all. Send the confirmed `revision`; a schedule changed since then (or by a concurrent save
 * or publish) answers 409 SCHEDULE_CHANGED and nothing changes.
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
 * Returns only published schedules, for every member (managers included).
 * Authorization: Requires valid JWT and group membership.
 */
router.get(
    "/all",
    validateRequest({ query: getAllSchedulesQuerySchema }),
    requireGroupMember((req: Request) => req.query.groupId as string | undefined),
    schedulesController.getAllSchedules,
);

export default router;

/**
 * @module ReportRoutes
 * 
 * Provides API endpoints for managing shift reports.
 * Features include report retrieval with date filtering, automatic attendance 
 * detection based on shift schedules, and historical task tracking.
 */

import { Request, Router } from "express";
import { z } from "zod";
import * as reportsController from "../controllers/reportsController";
import { protect, requireGroupMember } from "../middleware/authMiddleware";
import { validateRequest, isoDateString, objectIdString } from "../middleware/validationMiddleware";

const router = Router();

// --- Validation Schemas ---

export const reportIdParamSchema = z.object({
    id: z.string().trim().min(1, "Report ID is required"),
});

export const getReportsQuerySchema = z.object({
    groupId: objectIdString("groupId"),
    year: z.string().optional(),
    month: z.string().optional(),
    day: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).optional(),
    cursorDate: z.string().optional(),
    cursorId: z.string().optional(),
});

// title, startTime and endTime are required by the ShiftReport model, so they are required here too;
// startTime also sets the report's `date`, so it must be a parseable ISO 8601 value.
export const createReportSchema = z.object({
    groupId: objectIdString("groupId"),
    title: z.string({ message: "Report title is required" }).trim().min(1, "Report title is required"),
    startTime: isoDateString("startTime"),
    endTime: isoDateString("endTime"),
}).passthrough();

// Unknown keys are stripped: only the editable fields reach the controller
export const updateReportSchema = z.object({
    currentTasks: z.string().optional(),
    attendees: z.array(z.record(z.string(), z.unknown())).optional(),
    previousTasks: z.string().optional(),
});

// Ensure all report routes are protected by authentication
router.use(protect);

/**
 * GET /
 * Retrieves shift reports for a specific group, with optional temporal filtering.
 * Authorization: Requires valid JWT and group membership (any role, including the group's Shift Manager).
 */
router.get(
    "/",
    validateRequest({ query: getReportsQuerySchema }),
    requireGroupMember((req: Request) => req.query.groupId as string | undefined),
    reportsController.getReports,
);

/**
 * POST /
 * Creates a new shift report. Its automatic attendees are the active group members with a
 * published shift on the report's day, of a type linked to the time slot that starts at the
 * report's start; day and slot are read on Jerusalem time.
 * Authorization: Requires valid JWT and group membership (any role, including the group's Shift Manager).
 */
router.post(
    "/",
    validateRequest({ body: createReportSchema }),
    requireGroupMember((req: Request) => req.body.groupId),
    reportsController.createReport,
);

/**
 * PATCH /:id
 * Partially updates an existing shift report (tasks, attendees list): only the fields present in
 * the body are changed; omitted fields keep their stored values. Any other field is ignored.
 * Authorization: Only explicit members of the report's group (any role, including the group's
 * Shift Manager) may modify it (controller-enforced).
 */
router.patch(
    "/:id",
    validateRequest({ params: reportIdParamSchema, body: updateReportSchema }),
    reportsController.updateReport,
);

/**
 * DELETE /:id
 * Deletes a shift report from the database.
 * Authorization: Restricted to the explicit Shift Manager of the report's group (controller-enforced).
 * Administrators have no bypass: they may delete only if they also hold the Shift Manager role in that group.
 */
router.delete(
    "/:id",
    validateRequest({ params: reportIdParamSchema }),
    reportsController.deleteReport,
);

export default router;

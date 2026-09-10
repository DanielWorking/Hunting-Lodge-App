/**
 * @module ReportRoutes
 * 
 * Provides API endpoints for managing shift reports.
 * Features include report retrieval with date filtering, automatic attendance 
 * detection based on shift schedules, and historical task tracking.
 * Migrated to strict TypeScript with schema validation and RBAC guardrails.
 */

import { Request, Router } from "express";
import { z } from "zod";
import * as reportsController from "../controllers/reportsController";
import { protect, requireGroupMember } from "../middleware/authMiddleware";
import { validateRequest } from "../middleware/validationMiddleware";

const router = Router();

// --- Validation Schemas ---

export const reportIdParamSchema = z.object({
    id: z.string().trim().min(1, "Report ID is required"),
});

export const getReportsQuerySchema = z.object({
    groupId: z.string({ message: "Missing groupId" }).trim().min(1, "Missing groupId"),
    year: z.string().optional(),
    month: z.string().optional(),
    day: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).optional(),
    cursorDate: z.string().optional(),
    cursorId: z.string().optional(),
});

export const createReportSchema = z.object({
    groupId: z.string({ message: "Target groupId is required" }).trim().min(1, "Target groupId is required"),
    title: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
}).passthrough();

export const updateReportSchema = z.object({
    currentTasks: z.string().optional(),
    attendees: z.array(z.record(z.string(), z.unknown())).optional(),
    isLocked: z.boolean().optional(),
    previousTasks: z.string().optional(),
}).passthrough();

export type GetReportsQueryInput = z.infer<typeof getReportsQuerySchema>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateReportInput = z.infer<typeof updateReportSchema>;

// Ensure all report routes are protected by authentication
router.use(protect);

/**
 * GET /
 * Retrieves shift reports for a specific group, with optional temporal filtering.
 * Authorization: Requires valid JWT and group membership.
 */
router.get(
    "/",
    validateRequest({ query: getReportsQuerySchema }),
    requireGroupMember((req: Request) => req.query.groupId as string | undefined),
    reportsController.getReports,
);

/**
 * POST /
 * Creates a new shift report.
 * Authorization: Requires valid JWT and group membership.
 */
router.post(
    "/",
    validateRequest({ body: createReportSchema }),
    requireGroupMember((req: Request) => req.body.groupId),
    reportsController.createReport,
);

/**
 * PUT /:id
 * Updates an existing shift report.
 * Authorization: Controller enforces group membership and lock state restrictions.
 */
router.put(
    "/:id",
    validateRequest({ params: reportIdParamSchema, body: updateReportSchema }),
    reportsController.updateReport,
);

/**
 * DELETE /:id
 * Deletes a shift report from the database.
 * Authorization: Restricted to Shift Managers of the report's group or Administrators.
 */
router.delete(
    "/:id",
    validateRequest({ params: reportIdParamSchema }),
    reportsController.deleteReport,
);

(router as unknown as { default: typeof router }).default = router;
export default router;

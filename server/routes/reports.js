/**
 * @module ReportRoutes
 * 
 * Provides API endpoints for managing shift reports.
 * Features include report retrieval with date filtering, automatic attendance 
 * detection based on shift schedules, and historical task tracking.
 */

const express = require("express");
const router = express.Router();
const reportsController = require("../controllers/reportsController");
const { protect, requireGroupMember } = require("../middleware/authMiddleware");

// Ensure all report routes are protected by authentication
router.use(protect);

/**
 * GET /
 * 
 * Retrieves shift reports for a specific group, with optional temporal filtering.
 * 
 * @name getReports
 * @route {GET} /
 * @authentication Requires valid JWT and group membership.
 */
router.get(
    "/",
    requireGroupMember((req) => req.query.groupId),
    reportsController.getReports,
);

/**
 * POST /
 * 
 * Creates a new shift report.
 * 
 * @name createReport
 * @route {POST} /
 * @authentication Requires valid JWT and group membership.
 */
router.post(
    "/",
    requireGroupMember((req) => req.body.groupId),
    reportsController.createReport,
);

/**
 * PUT /:id
 * 
 * Updates an existing shift report.
 * 
 * @name updateReport
 * @route {PUT} /:id
 * @authentication Requires valid JWT and group membership.
 */
router.put("/:id", reportsController.updateReport);

/**
 * DELETE /:id
 * 
 * Deletes a shift report from the database.
 * Authorization: Restricted to Shift Managers of the report's group or Administrators.
 * 
 * @name deleteReport
 * @route {DELETE} /:id
 * @authentication Requires valid JWT and Shift Manager or Admin role.
 */
router.delete("/:id", reportsController.deleteReport);

module.exports = router;

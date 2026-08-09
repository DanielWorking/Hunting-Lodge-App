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
const { protect } = require("../middleware/authMiddleware");

// Ensure all routes are protected by authentication
router.use(protect);

/**
 * GET /
 * 
 * Retrieves shift reports for a specific group, with optional temporal filtering.
 * 
 * @name getReports
 * @route {GET} /
 * @authentication Requires valid JWT.
 */
router.get("/", reportsController.getReports);

/**
 * POST /
 * 
 * Creates a new shift report.
 * Automatically inherits pending tasks from the previous report and attempts
 * to identify attendees based on the published shift schedule.
 * 
 * @name createReport
 * @route {POST} /
 * @authentication Requires valid JWT.
 */
router.post("/", reportsController.createReport);

/**
 * PUT /:id
 * 
 * Updates an existing shift report.
 * 
 * @name updateReport
 * @route {PUT} /:id
 * @authentication Requires valid JWT.
 */
router.put("/:id", reportsController.updateReport);

/**
 * DELETE /:id
 * 
 * Deletes a shift report from the database.
 * 
 * @name deleteReport
 * @route {DELETE} /:id
 * @authentication Requires valid JWT.
 */
router.delete("/:id", reportsController.deleteReport);

module.exports = router;

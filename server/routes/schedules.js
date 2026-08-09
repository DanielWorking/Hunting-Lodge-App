/**
 * @module ScheduleRoutes
 * 
 * Provides API endpoints for managing shift schedules.
 * Features include schedule retrieval, saving (with vacation balance management),
 * and publishing schedules to members.
 */

const express = require("express");
const router = express.Router();
const schedulesController = require("../controllers/schedulesController");

const { protect } = require("../middleware/authMiddleware");

// Use protect middleware for all routes in this file
// (Alternatively, it can be added specifically to each route: router.get('/', protect, ...))
router.use(protect);

/**
 * GET /
 * 
 * Retrieves a specific schedule for a group based on a start date.
 * Filters unpublished schedules for non-privileged users.
 * 
 * @name getSchedule
 * @route {GET} /
 * @authentication Requires valid JWT.
 */
router.get("/", schedulesController.getSchedule);

/**
 * PUT /
 * 
 * Saves or updates a shift schedule.
 * Handles vacation day refunds if a previously published vacation shift is changed.
 * 
 * @name saveSchedule
 * @route {PUT} /
 * @authentication Requires valid JWT.
 */
router.put("/", schedulesController.saveSchedule);

/**
 * POST /publish
 * 
 * Publishes a schedule, making it visible to all group members.
 * Automatically deducts vacation days from users assigned to vacation shifts.
 * 
 * @name publishSchedule
 * @route {POST} /publish
 * @authentication Requires valid JWT.
 */
router.post("/publish", schedulesController.publishSchedule);

/**
 * GET /all
 * 
 * Retrieves all schedules for a specific group.
 * Filters unpublished schedules for non-privileged users.
 * 
 * @name getAllSchedules
 * @route {GET} /all
 * @authentication Requires valid JWT.
 */
router.get("/all", schedulesController.getAllSchedules);

module.exports = router;

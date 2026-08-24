/**
 * @module ScheduleRoutes
 * 
 * Provides API endpoints for managing shift schedules.
 * Features include schedule retrieval, saving (with vacation balance management),
 * and publishing schedules to members.
 * 
 * Access Rules:
 * - Group members can view published schedules.
 * - ONLY the Shift Manager of a group can create, edit, save drafts, and publish schedules.
 */

const express = require("express");
const router = express.Router();
const schedulesController = require("../controllers/schedulesController");
const {
    protect,
    requireGroupMember,
    requireShiftManager,
} = require("../middleware/authMiddleware");

// Ensure all routes are protected by authentication
router.use(protect);

/**
 * GET /
 * 
 * Retrieves a specific schedule for a group based on a start date.
 * Draft schedules are only visible to Shift Managers of the group.
 * 
 * @name getSchedule
 * @route {GET} /
 * @authentication Requires valid JWT and group membership.
 */
router.get(
    "/",
    requireGroupMember((req) => req.query.groupId),
    schedulesController.getSchedule,
);

/**
 * PUT /
 * 
 * Saves or updates a shift schedule draft.
 * Authorization: Strictly restricted to the Shift Manager of the group.
 * 
 * @name saveSchedule
 * @route {PUT} /
 * @authentication Requires valid JWT and Shift Manager role in the target group.
 */
router.put(
    "/",
    requireShiftManager((req) => req.body.groupId),
    schedulesController.saveSchedule,
);

/**
 * POST /publish
 * 
 * Publishes a schedule, making it visible to all group members,
 * and automatically deducts vacation days.
 * Authorization: Strictly restricted to the Shift Manager of the group.
 * 
 * @name publishSchedule
 * @route {POST} /publish
 * @authentication Requires valid JWT and Shift Manager role in the schedule's group.
 */
router.post("/publish", schedulesController.publishSchedule);

/**
 * GET /all
 * 
 * Retrieves all schedules for a specific group.
 * Filters unpublished schedules for non-shift-manager members.
 * 
 * @name getAllSchedules
 * @route {GET} /all
 * @authentication Requires valid JWT and group membership.
 */
router.get(
    "/all",
    requireGroupMember((req) => req.query.groupId),
    schedulesController.getAllSchedules,
);

module.exports = router;

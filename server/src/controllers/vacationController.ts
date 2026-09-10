/**
 * @module VacationController
 * 
 * Express controller for managing employee vacation requests and aggregating
 * accrued/deducted vacation balance with support for fractional (0.5 and 1.0) vacation values.
 */

import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import VacationRequest from "../models/VacationRequest";
import ShiftSchedule from "../models/ShiftSchedule";
import User from "../models/User";
import { isShiftManager, resolveGroup, AuthUser } from "../utils/authHelpers";

export interface CreateVacationRequestBody {
    groupId?: string;
    date?: string;
    vacationValue?: number;
    notes?: string;
}

export interface UpdateVacationStatusRequestBody {
    status?: "approved" | "rejected";
}

/**
 * Creates a new vacation request for the authenticated user.
 */
export async function createVacationRequest(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const body = (req.body || {}) as CreateVacationRequestBody;
        const { groupId, date, vacationValue = 1.0, notes } = body;

        if (!groupId || !date) {
            res.status(400).json({ message: "Missing groupId or date" });
            return;
        }

        if (vacationValue !== 0.5 && vacationValue !== 1.0) {
            res.status(400).json({ message: "vacationValue must be either 0.5 or 1.0" });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found" });
            return;
        }

        const authUser = req.user as AuthUser | undefined;
        if (!authUser || !authUser._id) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        let userDocQuery: any = User.findById(authUser._id);
        if (typeof userDocQuery?.select === "function") {
            const selected = userDocQuery.select("vacationBalance");
            if (selected) userDocQuery = selected;
        }
        const userDoc = await (typeof userDocQuery?.lean === "function"
            ? userDocQuery.lean()
            : userDocQuery);
        if (!userDoc) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        if (userDoc.vacationBalance < vacationValue) {
            res.status(400).json({
                message: "Insufficient vacation balance",
                code: "INSUFFICIENT_VACATION_BALANCE",
                currentBalance: userDoc.vacationBalance,
                requestedValue: vacationValue,
            });
            return;
        }

        const requestDate = new Date(date);
        let existingRequestQuery: any = VacationRequest.findOne({
            userId: userDoc._id,
            date: requestDate,
            status: { $in: ["pending", "approved"] },
        });
        if (typeof existingRequestQuery?.select === "function") {
            const selected = existingRequestQuery.select("_id");
            if (selected) existingRequestQuery = selected;
        }
        const existingRequest = await (typeof existingRequestQuery?.lean === "function"
            ? existingRequestQuery.lean()
            : existingRequestQuery);

        if (existingRequest) {
            res.status(409).json({
                message: "A vacation request already exists for this date",
                code: "DUPLICATE_VACATION_REQUEST",
            });
            return;
        }

        const newRequest = new VacationRequest({
            userId: userDoc._id,
            groupId: group._id,
            date: requestDate,
            vacationValue,
            status: "pending",
            notes,
        });

        await newRequest.save();
        res.status(201).json(newRequest);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

/**
 * Retrieves vacation requests for a group, filtered by status or user.
 */
export async function getVacationRequests(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const { groupId, status, userId } = req.query;
        if (!groupId || typeof groupId !== "string") {
            res.status(400).json({ message: "Missing groupId" });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found" });
            return;
        }

        const authUser = req.user as AuthUser | undefined;
        const userIsManager = await isShiftManager(authUser, group._id);

        const filter: Record<string, unknown> = { groupId: group._id };
        if (status && typeof status === "string") {
            filter.status = status;
        }

        // Non-managers can only view their own vacation requests
        if (!userIsManager) {
            filter.userId = authUser?._id;
        } else if (userId && typeof userId === "string") {
            filter.userId = userId;
        }

        const requestsQuery = VacationRequest.find(filter)
            .populate("userId", "username displayName")
            .populate("reviewedBy", "username displayName")
            .sort({ date: 1 });

        const requests = await (typeof (requestsQuery as any).lean === "function"
            ? (requestsQuery as any).lean()
            : requestsQuery);

        res.json(requests);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

/**
 * Approves or rejects a vacation request, executing atomic balance adjustments.
 */
export async function updateVacationRequestStatus(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const { id } = req.params;
        const { status } = req.body as UpdateVacationStatusRequestBody;

        if (!id || !status || !["approved", "rejected"].includes(status)) {
            res.status(400).json({ message: "Invalid requestId or status. Status must be 'approved' or 'rejected'." });
            return;
        }

        const vacationReq = await VacationRequest.findById(id);
        if (!vacationReq) {
            res.status(404).json({ message: "Vacation request not found" });
            return;
        }

        const authUser = req.user as AuthUser | undefined;
        const userIsManager = await isShiftManager(authUser, vacationReq.groupId);
        if (!userIsManager) {
            res.status(403).json({
                message: "Forbidden: Only Shift Managers of this group can review vacation requests",
                code: "FORBIDDEN_SHIFT_MANAGER_REQUIRED",
            });
            return;
        }

        const previousStatus = vacationReq.status;
        const vacationVal = vacationReq.vacationValue || 1.0;

        // Transition from pending -> approved: Atomic conditional deduction
        if (previousStatus !== "approved" && status === "approved") {
            const updatedUser = await User.findOneAndUpdate(
                { _id: vacationReq.userId, vacationBalance: { $gte: vacationVal } },
                { $inc: { vacationBalance: -vacationVal } },
                { returnDocument: "after" },
            );

            if (!updatedUser) {
                res.status(400).json({
                    message: "Cannot approve request: user has insufficient vacation balance",
                    code: "INSUFFICIENT_VACATION_BALANCE",
                });
                return;
            }
        }

        // Transition from approved -> rejected: Atomic refund
        if (previousStatus === "approved" && status === "rejected") {
            await User.findByIdAndUpdate(vacationReq.userId, {
                $inc: { vacationBalance: vacationVal },
            });
        }

        vacationReq.status = status;
        vacationReq.reviewedBy = authUser?._id as Types.ObjectId;
        vacationReq.reviewedAt = new Date();
        await vacationReq.save();

        res.json(vacationReq);
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

/**
 * Aggregates accrued/deducted vacation balance for a user in a group according to vacationValue.
 */
export async function aggregateVacationBalance(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const { groupId, userId } = req.query;
        if (!groupId || !userId || typeof groupId !== "string" || typeof userId !== "string") {
            res.status(400).json({ message: "Missing groupId or userId" });
            return;
        }

        const userDocQuery = User.findById(userId).select("_id vacationBalance");
        const userDoc = await (typeof (userDocQuery as any).lean === "function"
            ? (userDocQuery as any).lean()
            : userDocQuery);
        if (!userDoc) {
            res.status(404).json({ message: "User not found" });
            return;
        }

        // Aggregate deducted days from published ShiftSchedules and approved requests concurrently
        const [schedules, approvedRequests] = await Promise.all([
            (async () => {
                const q = ShiftSchedule.find({
                    groupId,
                    isPublished: true,
                    "shifts.userId": userDoc._id,
                }).select("shifts");
                return (typeof (q as any).lean === "function" ? (q as any).lean() : q);
            })(),
            (async () => {
                const q = VacationRequest.find({
                    groupId,
                    userId: userDoc._id,
                    status: "approved",
                }).select("vacationValue");
                return (typeof (q as any).lean === "function" ? (q as any).lean() : q);
            })(),
        ]);

        let totalDeductedFromShifts = 0;
        for (const sched of (schedules || [])) {
            for (const shift of (sched.shifts || [])) {
                if (String(shift.userId) === String(userDoc._id) && shift.vacationDeducted) {
                    totalDeductedFromShifts += shift.vacationValue !== undefined ? shift.vacationValue : 1.0;
                }
            }
        }

        const totalDeductedFromRequests = (approvedRequests || []).reduce(
            (acc: number, curr: any) => acc + (curr.vacationValue !== undefined ? curr.vacationValue : 1.0),
            0,
        );

        const totalDeducted = totalDeductedFromShifts + totalDeductedFromRequests;

        res.json({
            userId: userDoc._id,
            remainingBalance: userDoc.vacationBalance,
            totalDeductedFromShifts,
            totalDeductedFromRequests,
            totalDeducted,
        });
    } catch (err: unknown) {
        if (typeof next === "function") {
            next(err);
            return;
        }
        res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
}

export default {
    createVacationRequest,
    getVacationRequests,
    updateVacationRequestStatus,
    aggregateVacationBalance,
};

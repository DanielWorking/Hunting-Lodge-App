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
            res.status(400).json({ message: "Missing groupId or date", code: "VALIDATION_ERROR" });
            return;
        }

        if (vacationValue !== 0.5 && vacationValue !== 1.0) {
            res.status(400).json({ message: "vacationValue must be either 0.5 or 1.0", code: "VALIDATION_ERROR" });
            return;
        }

        const authUser = req.user as AuthUser | undefined;
        if (!authUser || !authUser._id) {
            res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED" });
            return;
        }

        const requestDate = new Date(date);

        // Concurrently resolve group, user balance, and existing request conflicts
        const [group, userDoc, existingRequest] = await Promise.all([
            resolveGroup(groupId),
            (async () => {
                const q = User.findById(authUser._id).select("vacationBalance");
                return (typeof (q as any).lean === "function" ? (q as any).lean() : q);
            })(),
            (async () => {
                const q = VacationRequest.findOne({
                    userId: authUser._id,
                    date: requestDate,
                    status: { $in: ["pending", "approved"] },
                }).select("_id");
                return (typeof (q as any).lean === "function" ? (q as any).lean() : q);
            })(),
        ]);

        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
            return;
        }

        if (!userDoc) {
            res.status(404).json({ message: "User not found", code: "NOT_FOUND" });
            return;
        }

        // Only Shift Managers see balances: the refusal does not reveal the requester's own balance
        if (userDoc.vacationBalance < vacationValue) {
            res.status(400).json({
                message: "Insufficient vacation balance",
                code: "INSUFFICIENT_VACATION_BALANCE",
                requestedValue: vacationValue,
            });
            return;
        }

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
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}

/**
 * Retrieves vacation requests for a group, filtered by status or user.
 */
export async function getVacationRequests(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const { groupId, status, userId } = req.query;
        if (!groupId || typeof groupId !== "string") {
            res.status(400).json({ message: "Missing groupId", code: "VALIDATION_ERROR" });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
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
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
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
            res.status(400).json({ message: "Invalid requestId or status. Status must be 'approved' or 'rejected'.", code: "VALIDATION_ERROR" });
            return;
        }

        const vacationReq = await VacationRequest.findById(id);
        if (!vacationReq) {
            res.status(404).json({ message: "Vacation request not found", code: "NOT_FOUND" });
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
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}

/**
 * Aggregates accrued/deducted vacation balance for a user in a group according to vacationValue.
 *
 * The group may be given by ObjectId or name. The route guard already requires the caller to be
 * a member of the group (Administrators included). Only the group's Shift Manager may read a
 * balance, their own included; regular members cannot read any balance, not even their own
 * (Administrators get no bypass). The target user must belong to the group.
 */
export async function aggregateVacationBalance(req: Request, res: Response, next?: NextFunction): Promise<void> {
    try {
        const { groupId, userId } = req.query;
        if (!groupId || !userId || typeof groupId !== "string" || typeof userId !== "string") {
            res.status(400).json({ message: "Missing groupId or userId", code: "VALIDATION_ERROR" });
            return;
        }

        const group = await resolveGroup(groupId);
        if (!group) {
            res.status(404).json({ message: "Group not found", code: "NOT_FOUND" });
            return;
        }

        const authUser = req.user as AuthUser | undefined;
        if (!(await isShiftManager(authUser, group))) {
            res.status(403).json({
                message: "Forbidden: Only a Shift Manager of this group can view vacation balances.",
                code: "FORBIDDEN_MANAGER_REQUIRED",
            });
            return;
        }

        // Query user balance, published schedules, and approved requests concurrently
        const [userDoc, schedules, approvedRequests] = await Promise.all([
            (async () => {
                // Scoped to the group so a manager cannot read balances of users outside it
                const q = User.findOne({ _id: userId, "groups.groupId": group._id }).select("_id vacationBalance");
                return (typeof (q as any).lean === "function" ? (q as any).lean() : q);
            })(),
            (async () => {
                const q = ShiftSchedule.find({
                    groupId: group._id,
                    isPublished: true,
                    "shifts.userId": userId,
                }).select("shifts");
                return (typeof (q as any).lean === "function" ? (q as any).lean() : q);
            })(),
            (async () => {
                const q = VacationRequest.find({
                    groupId: group._id,
                    userId,
                    status: "approved",
                }).select("vacationValue");
                return (typeof (q as any).lean === "function" ? (q as any).lean() : q);
            })(),
        ]);

        if (!userDoc) {
            res.status(404).json({ message: "User not found in this group", code: "NOT_FOUND" });
            return;
        }

        let totalDeductedFromShifts = 0;
        for (const sched of (schedules || [])) {
            for (const shift of (sched.shifts || [])) {
                if (String(shift.userId) === String(userDoc._id) && shift.vacationDeducted) {
                    totalDeductedFromShifts += shift.vacationValue !== undefined ? shift.vacationValue : 1.0;
                }
            }
        }

        const totalDeductedFromRequests = (approvedRequests || []).reduce(
            (acc: number, curr: { vacationValue?: number }) =>
                acc + (curr.vacationValue !== undefined ? curr.vacationValue : 1.0),
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
        res.status(500).json({ message: err instanceof Error ? err.message : String(err), code: "INTERNAL_ERROR" });
    }
}

export default {
    createVacationRequest,
    getVacationRequests,
    updateVacationRequestStatus,
    aggregateVacationBalance,
};

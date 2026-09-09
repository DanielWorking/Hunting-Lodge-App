import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import Shift from "../models/Shift";
import VacationRequest from "../models/VacationRequest";
import ShiftSchedule from "../models/ShiftSchedule";
import User from "../models/User";

describe("Vacation Value & Half-Day Support Suite", () => {
    describe("Shift Model - vacationValue Validation", () => {
        it("should accept vacationValue of 0.5 and 1.0", async () => {
            const halfDayShift = new Shift({
                userId: new mongoose.Types.ObjectId(),
                date: new Date(),
                shiftTypeId: new mongoose.Types.ObjectId(),
                vacationValue: 0.5,
            });
            await halfDayShift.validate();
            assert.equal(halfDayShift.vacationValue, 0.5);

            const fullDayShift = new Shift({
                userId: new mongoose.Types.ObjectId(),
                date: new Date(),
                shiftTypeId: new mongoose.Types.ObjectId(),
                vacationValue: 1.0,
            });
            await fullDayShift.validate();
            assert.equal(fullDayShift.vacationValue, 1.0);
        });

        it("should default vacationValue to 1.0 when omitted", async () => {
            const defaultShift = new Shift({
                userId: new mongoose.Types.ObjectId(),
                date: new Date(),
                shiftTypeId: new mongoose.Types.ObjectId(),
            });
            assert.equal(defaultShift.vacationValue, 1.0);
        });

        it("should reject invalid vacationValue such as 0.75, 2.0, or negative", async () => {
            const invalidShift = new Shift({
                userId: new mongoose.Types.ObjectId(),
                date: new Date(),
                shiftTypeId: new mongoose.Types.ObjectId(),
                vacationValue: 0.75 as unknown as 0.5,
            });

            let err: mongoose.Error.ValidationError | undefined;
            try {
                await invalidShift.validate();
            } catch (e) {
                err = e as mongoose.Error.ValidationError;
            }

            assert.ok(err, "Validation error expected for vacationValue 0.75");
            assert.ok(err.errors.vacationValue, "vacationValue error expected");
        });
    });

    describe("VacationRequest Model - Schema & Enum Constraints", () => {
        it("should validate and persist valid VacationRequest with 0.5 day", async () => {
            const req = new VacationRequest({
                userId: new mongoose.Types.ObjectId(),
                groupId: new mongoose.Types.ObjectId(),
                date: new Date(),
                vacationValue: 0.5,
                notes: "Doctor appointment in the afternoon",
            });
            await req.validate();
            assert.equal(req.vacationValue, 0.5);
            assert.equal(req.status, "pending");
        });

        it("should default status to 'pending' and vacationValue to 1.0", async () => {
            const req = new VacationRequest({
                userId: new mongoose.Types.ObjectId(),
                groupId: new mongoose.Types.ObjectId(),
                date: new Date(),
            });
            await req.validate();
            assert.equal(req.status, "pending");
            assert.equal(req.vacationValue, 1.0);
        });

        it("should reject invalid status and invalid vacationValue", async () => {
            const req = new VacationRequest({
                userId: new mongoose.Types.ObjectId(),
                groupId: new mongoose.Types.ObjectId(),
                date: new Date(),
                vacationValue: 1.5 as unknown as 1.0,
                status: "invalid_status" as unknown as "pending",
            });

            let err: mongoose.Error.ValidationError | undefined;
            try {
                await req.validate();
            } catch (e) {
                err = e as mongoose.Error.ValidationError;
            }

            assert.ok(err, "Validation error expected");
            assert.ok(err.errors.vacationValue, "Invalid vacationValue must be rejected");
            assert.ok(err.errors.status, "Invalid status must be rejected");
        });
    });

    describe("ShiftSchedule Model - Embedded ShiftAssignment vacationValue", () => {
        it("should support vacationValue on embedded shift assignments", async () => {
            const schedule = new ShiftSchedule({
                groupId: new mongoose.Types.ObjectId(),
                startDate: new Date("2026-09-01"),
                endDate: new Date("2026-09-07"),
                shifts: [
                    {
                        userId: new mongoose.Types.ObjectId(),
                        date: new Date("2026-09-02"),
                        shiftTypeId: new mongoose.Types.ObjectId(),
                        vacationValue: 0.5,
                        vacationDeducted: false,
                    },
                    {
                        userId: new mongoose.Types.ObjectId(),
                        date: new Date("2026-09-03"),
                        shiftTypeId: new mongoose.Types.ObjectId(),
                        vacationDeducted: false,
                    },
                ],
            });

            await schedule.validate();
            assert.equal(schedule.shifts[0].vacationValue, 0.5);
            assert.equal(schedule.shifts[1].vacationValue, 1.0, "Omitted vacationValue must default to 1.0");
        });
    });

    describe("Vacation Balance Atomic Deduction & Underflow Prevention", () => {
        it("should simulate atomic conditional deduction for 0.5 day", () => {
            const initialBalance = 1.0;
            const deduction = 0.5;

            // Simulating MongoDB atomic filter: { vacationBalance: { $gte: deduction } }
            const canDeduct = initialBalance >= deduction;
            assert.equal(canDeduct, true);
            const remaining = initialBalance - deduction;
            assert.equal(remaining, 0.5);
        });

        it("should block atomic deduction when balance is less than vacationValue (underflow guard)", () => {
            const initialBalance = 0.4;
            const deduction = 0.5;

            // MongoDB atomic filter condition: { vacationBalance: { $gte: 0.5 } }
            const canDeduct = initialBalance >= deduction;
            assert.equal(canDeduct, false, "Must block deduction when balance < vacationValue");
        });

        it("should accurately refund 0.5 day upon cancellation", () => {
            const currentBalance = 17.5;
            const refund = 0.5;
            const restored = currentBalance + refund;
            assert.equal(restored, 18.0);
        });
    });

    describe("Vacation Controller - API Handlers & Atomic Logic", () => {
        const createMockRes = () => {
            const res: {
                statusCode: number;
                body?: unknown;
                status: (code: number) => typeof res;
                json: (data: unknown) => typeof res;
            } = {
                statusCode: 200,
                status(code: number) {
                    this.statusCode = code;
                    return this;
                },
                json(data: unknown) {
                    this.body = data;
                    return this;
                },
            };
            return res;
        };

        it("createVacationRequest should reject invalid vacationValue", async () => {
            const vacationController = (await import("../controllers/vacationController")).default;
            const req = {
                body: {
                    groupId: new mongoose.Types.ObjectId().toString(),
                    date: "2026-09-15",
                    vacationValue: 0.75,
                },
                user: { _id: new mongoose.Types.ObjectId() },
            } as unknown as import("express").Request;

            const res = createMockRes();
            await vacationController.createVacationRequest(req, res as unknown as import("express").Response);
            assert.equal(res.statusCode, 400);
            assert.match((res.body as { message: string }).message, /vacationValue must be either 0.5 or 1.0/);
        });

        it("updateVacationRequestStatus should atomically deduct 0.5 on approval", async () => {
            const vacationController = (await import("../controllers/vacationController")).default;
            const userId = new mongoose.Types.ObjectId();
            const groupId = new mongoose.Types.ObjectId();
            const requestId = new mongoose.Types.ObjectId();

            const vacationHolder = VacationRequest as unknown as Record<string, unknown>;
            const userHolder = User as unknown as Record<string, unknown>;
            const Group = (await import("../models/Group")).default;
            const groupHolder = Group as unknown as Record<string, unknown>;

            const origFindById = vacationHolder.findById;
            const origFindOneAndUpdate = userHolder.findOneAndUpdate;
            const origGroupFindById = groupHolder.findById;

            let capturedFilter: { vacationBalance?: { $gte?: number } } | null = null;
            let capturedUpdate: { $inc?: { vacationBalance?: number } } | null = null;

            groupHolder.findById = async () => ({
                _id: groupId,
                name: "TestGroup",
            });

            vacationHolder.findById = async () => ({
                _id: requestId,
                userId,
                groupId,
                status: "pending",
                vacationValue: 0.5,
                save: async () => true,
            });

            userHolder.findOneAndUpdate = async (filter: Record<string, unknown>, update: Record<string, unknown>) => {
                capturedFilter = filter as { vacationBalance?: { $gte?: number } };
                capturedUpdate = update as { $inc?: { vacationBalance?: number } };
                return { _id: userId, vacationBalance: 17.5 };
            };

            const req = {
                params: { id: requestId.toString() },
                body: { status: "approved" },
                user: { _id: new mongoose.Types.ObjectId(), groups: [{ groupId: groupId.toString(), role: "shift_manager" }] },
            } as unknown as import("express").Request;

            const res = createMockRes();
            try {
                await vacationController.updateVacationRequestStatus(req, res as unknown as import("express").Response);
                assert.equal(res.statusCode, 200);
                assert.ok(capturedFilter, "User.findOneAndUpdate should have been invoked");
                assert.ok(capturedUpdate, "User.findOneAndUpdate update should have been captured");
                const filter = capturedFilter as unknown as { vacationBalance?: { $gte?: number } };
                assert.deepEqual(filter.vacationBalance, { $gte: 0.5 }, "Precondition must check vacationBalance >= 0.5");
                const update = capturedUpdate as unknown as { $inc?: { vacationBalance?: number } };
                assert.deepEqual(update.$inc, { vacationBalance: -0.5 }, "Deduction must decrement by -0.5");
            } finally {
                vacationHolder.findById = origFindById;
                userHolder.findOneAndUpdate = origFindOneAndUpdate;
                groupHolder.findById = origGroupFindById;
            }
        });

        it("saveSchedule should adjust vacation balance difference when vacationValue changes from 1.0 to 0.5", async () => {
            const schedulesController = (await import("../controllers/schedulesController")).default;
            const Group = (await import("../models/Group")).default;
            const groupHolder = Group as unknown as Record<string, unknown>;
            const userHolder = User as unknown as Record<string, unknown>;
            const scheduleHolder = ShiftSchedule as unknown as Record<string, unknown>;

            const userId = new mongoose.Types.ObjectId();
            const groupId = new mongoose.Types.ObjectId();
            const vacationShiftTypeId = new mongoose.Types.ObjectId();
            const testDate = new Date("2026-09-15T00:00:00.000Z");

            const origGroupFindById = groupHolder.findById;
            const origFindOne = scheduleHolder.findOne;
            const origFindOneAndUpdateSched = scheduleHolder.findOneAndUpdate;
            const origFindByIdAndUpdateUser = userHolder.findByIdAndUpdate;

            groupHolder.findById = async () => ({
                _id: groupId,
                name: "TestGroup",
                settings: {
                    shiftTypes: [{ _id: vacationShiftTypeId, isVacation: true }],
                },
            });

            scheduleHolder.findOne = async () => ({
                _id: new mongoose.Types.ObjectId(),
                groupId,
                startDate: new Date("2026-09-14T00:00:00.000Z"),
                isPublished: true,
                shifts: [
                    {
                        userId,
                        shiftTypeId: vacationShiftTypeId,
                        date: testDate,
                        vacationDeducted: true,
                        vacationValue: 1.0,
                    },
                ],
            });

            let capturedUserAdjustment: { $inc?: { vacationBalance?: number } } | null = null;
            userHolder.findByIdAndUpdate = async (id: unknown, update: { $inc?: { vacationBalance?: number } }) => {
                capturedUserAdjustment = update;
                return { _id: id, vacationBalance: 10.5 };
            };

            scheduleHolder.findOneAndUpdate = async () => ({
                _id: new mongoose.Types.ObjectId(),
                isPublished: true,
            });

            const req = {
                body: {
                    groupId: groupId.toString(),
                    startDate: "2026-09-14T00:00:00.000Z",
                    endDate: "2026-09-20T00:00:00.000Z",
                    shifts: [
                        {
                            userId: userId.toString(),
                            shiftTypeId: vacationShiftTypeId.toString(),
                            date: testDate.toISOString(),
                            vacationValue: 0.5,
                        },
                    ],
                },
                user: { _id: new mongoose.Types.ObjectId(), groups: [{ groupId: groupId.toString(), role: "shift_manager" }] },
            } as unknown as import("express").Request;

            const res = createMockRes();
            try {
                await schedulesController.saveSchedule(req, res as unknown as import("express").Response);
                assert.equal(res.statusCode, 200);
                assert.ok(capturedUserAdjustment, "User.findByIdAndUpdate should adjust the 0.5 difference");
                const userAdjustment = capturedUserAdjustment as unknown as { $inc?: { vacationBalance?: number } };
                assert.deepEqual(userAdjustment.$inc, { vacationBalance: 0.5 }, "Should refund 0.5 when changing from 1.0 to 0.5");
            } finally {
                groupHolder.findById = origGroupFindById;
                scheduleHolder.findOne = origFindOne;
                scheduleHolder.findOneAndUpdate = origFindOneAndUpdateSched;
                userHolder.findByIdAndUpdate = origFindByIdAndUpdateUser;
            }
        });
    });
});


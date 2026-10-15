/**
 * @module ScheduleVacationPlan
 *
 * Works out how publishing a schedule changes vacation balances by comparing the shifts that
 * are currently published (and already charged) with the shifts about to be published.
 * Pure functions only: applying the plan to the database is the controller's job.
 *
 * A vacation day is identified by user and date. A day that was charged in the published
 * version and is still a vacation day in the new version is "carried" (only a change of
 * vacationValue is settled); a new vacation day is "pending" (must be charged); a charged
 * day that disappeared (or stopped being vacation) is refunded.
 */

export interface ShiftInput {
    readonly userId: unknown;
    readonly shiftTypeId: unknown;
    readonly date: unknown;
    readonly vacationValue?: number;
    readonly vacationDeducted?: boolean;
}

export interface PlannedShift {
    readonly userId: string;
    readonly shiftTypeId: string;
    readonly date: Date;
    readonly vacationValue?: number;
    readonly vacationDeducted: boolean;
}

export interface CarriedVacation {
    readonly shiftIndex: number;
    /** The value the user was charged when this day was first published. */
    readonly chargedValue: number;
}

export interface UserVacationPlan {
    readonly userId: string;
    /** Days refunded for previously charged vacation that is no longer scheduled. */
    readonly removedRefund: number;
    /** Net balance change when everything is applied: positive refunds, negative charges. */
    readonly net: number;
    /** Vacation days already charged in the published version. */
    readonly carried: readonly CarriedVacation[];
    /** Indexes (into `shifts`) of vacation days that were never charged. */
    readonly pending: readonly number[];
}

export interface VacationPlan {
    /** The shifts to publish, all with `vacationDeducted: false` until the plan is applied. */
    readonly shifts: readonly PlannedShift[];
    readonly users: readonly UserVacationPlan[];
}

const DEFAULT_VACATION_VALUE = 1;

function idOf(value: unknown): string {
    if (value && typeof value === "object" && "_id" in value) {
        return String((value as { _id: unknown })._id);
    }
    return String(value);
}

function vacationDayKey(userId: string, date: unknown): string {
    return `${userId}|${new Date(date as string | number | Date).getTime()}`;
}

function vacationValueOf(shift: ShiftInput): number {
    return shift.vacationValue ?? DEFAULT_VACATION_VALUE;
}

interface UserTally {
    removedRefund: number;
    adjustment: number;
    carried: CarriedVacation[];
    pending: number[];
}

/**
 * Plans the vacation balance changes for publishing `target` over the currently `published` shifts.
 *
 * @param published - Shifts of the last successful publish (empty for a first publish).
 * @param target - Shifts about to be published.
 * @param vacationTypeIds - Ids of the group's shift types flagged as vacation.
 */
export function planVacationCharges(
    published: readonly ShiftInput[],
    target: readonly ShiftInput[],
    vacationTypeIds: ReadonlySet<string>,
): VacationPlan {
    // Days charged by the last publish, keyed by user and day
    const chargedDays = new Map<string, Array<{ userId: string; value: number }>>();
    for (const shift of published) {
        if (!shift.vacationDeducted) continue;
        const userId = idOf(shift.userId);
        const key = vacationDayKey(userId, shift.date);
        chargedDays.set(key, [...(chargedDays.get(key) ?? []), { userId, value: vacationValueOf(shift) }]);
    }

    const tallies = new Map<string, UserTally>();
    const tallyFor = (userId: string): UserTally => {
        const existing = tallies.get(userId);
        if (existing) return existing;
        const created: UserTally = { removedRefund: 0, adjustment: 0, carried: [], pending: [] };
        tallies.set(userId, created);
        return created;
    };

    const shifts: PlannedShift[] = target.map((shift, shiftIndex) => {
        const userId = idOf(shift.userId);
        const shiftTypeId = idOf(shift.shiftTypeId);
        const planned: PlannedShift = {
            userId,
            shiftTypeId,
            date: new Date(shift.date as string | number | Date),
            vacationDeducted: false,
            ...(shift.vacationValue !== undefined ? { vacationValue: shift.vacationValue } : {}),
        };
        if (!vacationTypeIds.has(shiftTypeId)) {
            return planned;
        }

        const tally = tallyFor(userId);
        const sameDay = chargedDays.get(vacationDayKey(userId, shift.date));
        const charged = sameDay?.shift();
        if (charged) {
            tally.adjustment += charged.value - vacationValueOf(shift);
            tally.carried.push({ shiftIndex, chargedValue: charged.value });
        } else {
            tally.adjustment -= vacationValueOf(shift);
            tally.pending.push(shiftIndex);
        }
        return planned;
    });

    // Charged days that are no longer scheduled as vacation go back to the user
    for (const remaining of chargedDays.values()) {
        for (const day of remaining) {
            tallyFor(day.userId).removedRefund += day.value;
        }
    }

    const users: UserVacationPlan[] = [...tallies.entries()].map(([userId, tally]) => ({
        userId,
        removedRefund: tally.removedRefund,
        net: tally.removedRefund + tally.adjustment,
        carried: tally.carried,
        pending: tally.pending,
    }));

    return { shifts, users };
}

/**
 * The comparison key of a shift: user, day (ms), shift type and effective vacation value (a
 * missing value counts as the schema default, 1). `_id` and `vacationDeducted` are not part of it.
 */
export function shiftKey(shift: ShiftInput): string {
    return `${idOf(shift.userId)}|${new Date(shift.date as string | number | Date).getTime()}|${idOf(shift.shiftTypeId)}|${vacationValueOf(shift)}`;
}

/** True when both lists hold the same shifts, compared as multisets of `shiftKey`. */
export function sameShifts(a: readonly ShiftInput[], b: readonly ShiftInput[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    const counts = new Map<string, number>();
    for (const shift of a) {
        const key = shiftKey(shift);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const shift of b) {
        const key = shiftKey(shift);
        const remaining = counts.get(key) ?? 0;
        if (remaining === 0) return false;
        counts.set(key, remaining - 1);
    }
    return true;
}

/**
 * The shifts a save or publish may write. Only active members of the group (its Shift Manager
 * included) appear in the schedule, so only their shifts come from `incoming`; every published
 * shift of anyone else (a deactivated member, or a user no longer in the group) is kept exactly
 * as published, and anything unpublished for them is dropped. Their planned vacation change is
 * therefore always zero: they are never charged, refunded or blocking.
 *
 * @param incoming - The shifts being saved or published.
 * @param published - The shifts of the last successful publish (empty before the first publish).
 * @param isActiveMember - Whether a user id belongs to an active member of the group.
 */
export function keepSilentMembersShifts<T extends ShiftInput>(
    incoming: readonly T[],
    published: readonly T[],
    isActiveMember: (userId: string) => boolean,
): T[] {
    return [
        ...incoming.filter((shift) => isActiveMember(idOf(shift.userId))),
        ...published.filter((shift) => !isActiveMember(idOf(shift.userId))),
    ];
}

/** Distinct user ids of the given shifts. */
export function shiftUserIds(...lists: ReadonlyArray<readonly ShiftInput[]>): string[] {
    return [...new Set(lists.flatMap((list) => list.map((shift) => idOf(shift.userId))))];
}

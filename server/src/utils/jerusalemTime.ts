/**
 * @module JerusalemTime
 *
 * Asia/Jerusalem wall-clock helpers. Shift dates, time slots and report dates are all
 * interpreted on Jerusalem time, whatever time zone the server runs in (containers run on UTC).
 */

/**
 * Time components in Asia/Jerusalem timezone.
 */
export interface JerusalemTime {
    readonly hour: number;
    readonly minute: number;
}

/**
 * Extracts the current hour and minute in Asia/Jerusalem timezone.
 *
 * @param date - The reference date (defaults to current timestamp).
 * @returns An object containing the 24-hour hour and minute in Jerusalem time.
 */
export function getTimeInJerusalem(date: Date = new Date()): JerusalemTime {
    try {
        if (date !== undefined && (!(date instanceof Date) || isNaN(date.getTime()))) {
            throw new Error(`Invalid Date provided to getTimeInJerusalem: ${String(date)}`);
        }
        const validDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Jerusalem",
            hour: "numeric",
            minute: "numeric",
            hourCycle: "h23",
        });
        const parts = formatter.formatToParts(validDate);
        const hourStr = parts.find((p) => p.type === "hour")?.value;
        const minStr = parts.find((p) => p.type === "minute")?.value;
        if (hourStr === undefined || minStr === undefined) {
            throw new Error("Intl.DateTimeFormat failed to produce hour or minute parts for Asia/Jerusalem");
        }
        const rawHour = parseInt(hourStr, 10);
        const rawMin = parseInt(minStr, 10);
        if (isNaN(rawHour) || isNaN(rawMin)) {
            throw new Error(`Intl.DateTimeFormat produced non-numeric time parts: hour=${hourStr}, minute=${minStr}`);
        }
        const hour = rawHour % 24;
        const minute = rawMin % 60;
        return { hour, minute };
    } catch (error: unknown) {
        const errorStack = error instanceof Error ? error.stack ?? error.message : String(error);
        console.error("❌ [Cron] Asia/Jerusalem timezone calculation error:", errorStack);
        throw new Error(
            `Failed to calculate Jerusalem timezone: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

/**
 * Formats a Date into DD/MM/YYYY string in Asia/Jerusalem timezone.
 * Strips any Unicode directional markers to ensure clean ASCII date matching.
 *
 * @param date - The date to format (defaults to current timestamp).
 * @returns The formatted date string in DD/MM/YYYY format.
 */
export function getJerusalemDateString(date: Date = new Date()): string {
    if (date !== undefined && (!(date instanceof Date) || isNaN(date.getTime()))) {
        throw new Error(`Invalid Date provided to getJerusalemDateString: ${String(date)}`);
    }
    const validDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
    return validDate
        .toLocaleDateString("he-IL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            timeZone: "Asia/Jerusalem",
        })
        .replace(/[\u200E\u200F]/g, "")
        .replace(/\./g, "/");
}

/**
 * Helper to safely extract part values from Intl.DateTimeFormatPart array.
 */
function getPartValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
    const part = parts.find((p) => p.type === type);
    if (!part) {
        throw new Error(`Intl.DateTimeFormat failed to produce part '${type}' for Asia/Jerusalem`);
    }
    return part.value;
}

/**
 * Calculates a Date representing the given HH:mm time on the reference date in Asia/Jerusalem timezone.
 * Handles daylight saving transitions (DST) across midnight and clock change boundaries.
 *
 * @param refDate - The reference date.
 * @param timeStr - Time string formatted as "HH:mm".
 * @returns Date object in UTC corresponding to the specified Jerusalem local time.
 */
export function getJerusalemDate(refDate: Date, timeStr: string): Date {
    if (refDate !== undefined && (!(refDate instanceof Date) || isNaN(refDate.getTime()))) {
        throw new Error(`Invalid Date provided to getJerusalemDate: ${String(refDate)}`);
    }
    if (!timeStr || typeof timeStr !== "string") {
        throw new Error(`Invalid time string provided to getJerusalemDate: ${String(timeStr)}`);
    }
    const validRef = refDate instanceof Date && !isNaN(refDate.getTime()) ? refDate : new Date();
    const timeParts = timeStr.trim().split(":");
    const h = parseInt(timeParts[0] ?? "", 10);
    const m = parseInt(timeParts[1] ?? "", 10);
    if (isNaN(h) || isNaN(m)) {
        throw new Error(`Invalid HH:mm format provided to getJerusalemDate: ${timeStr}`);
    }
    const safeH = Math.min(Math.max(h, 0), 23);
    const safeM = Math.min(Math.max(m, 0), 59);

    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hourCycle: "h23",
    });
    const parts = formatter.formatToParts(validRef);

    const year = parseInt(getPartValue(parts, "year"), 10);
    const month = parseInt(getPartValue(parts, "month"), 10);
    const day = parseInt(getPartValue(parts, "day"), 10);

    const approx = new Date(Date.UTC(year, month - 1, day, safeH, safeM));
    const jParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(approx);

    const rawJHour = parseInt(getPartValue(jParts, "hour"), 10);
    const jHour = rawJHour === 24 ? 0 : rawJHour;
    const jMin = parseInt(getPartValue(jParts, "minute"), 10);

    const jAsUtc = Date.UTC(
        parseInt(getPartValue(jParts, "year"), 10),
        parseInt(getPartValue(jParts, "month"), 10) - 1,
        parseInt(getPartValue(jParts, "day"), 10),
        jHour,
        jMin
    );
    const offsetMs = jAsUtc - approx.getTime();
    let target = new Date(approx.getTime() - offsetMs);

    // DST boundary correction: verify target local time in Jerusalem matches desired time
    const verifyParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Jerusalem",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(target);

    const rawVerifyHour = parseInt(getPartValue(verifyParts, "hour"), 10);
    const verifyHour = rawVerifyHour === 24 ? 0 : rawVerifyHour;
    const verifyMin = parseInt(getPartValue(verifyParts, "minute"), 10);
    const verifyUtc = Date.UTC(
        parseInt(getPartValue(verifyParts, "year"), 10),
        parseInt(getPartValue(verifyParts, "month"), 10) - 1,
        parseInt(getPartValue(verifyParts, "day"), 10),
        verifyHour,
        verifyMin
    );
    const desiredUtc = Date.UTC(year, month - 1, day, safeH, safeM);
    const discrepancyMs = desiredUtc - verifyUtc;
    if (discrepancyMs !== 0) {
        target = new Date(target.getTime() + discrepancyMs);
    }

    return target;
}

/**
 * The instant the Jerusalem calendar day containing `date` starts (00:00 Jerusalem time).
 * A shift is "today or later" exactly when its date is at or after this instant.
 */
export function startOfJerusalemDay(date: Date = new Date()): Date {
    return getJerusalemDate(date, "00:00");
}

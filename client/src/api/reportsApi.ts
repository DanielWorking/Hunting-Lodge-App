/**
 * @module ReportsApi
 *
 * Provides client-side API methods for managing operational shift reports.
 * Communicates with backend endpoints to fetch shift reports with temporal filtering,
 * create new reports with automatic schedule-based attendance and task carryover,
 * update task logs and attendee rosters, and remove report records.
 */

import type { AxiosResponse } from "axios";
import apiClient from "./apiClient";
import type { ShiftReport, ShiftReportAttendee } from "../types";

export interface GetReportsParams {
    groupId: string;
    year?: number | string;
    month?: number | string;
    day?: number | string;
    cursorDate?: string;
    cursorId?: string;
    limit?: number;
}

export interface PaginatedReportsResult {
    reports: ShiftReport[];
    hasMore: boolean;
    nextCursorDate: string | null;
    nextCursorId: string | null;
}

export interface CreateReportPayload {
    groupId: string;
    title: string;
    startTime: Date | string;
    endTime: Date | string;
}

export interface UpdateReportPayload {
    currentTasks?: string;
    previousTasks?: string;
    attendees?: ShiftReportAttendee[];
}

/**
 * Retrieves shift reports for a group with optional date-based and cursor filtering.
 *
 * Reports are returned in descending chronological order by shift start time.
 * Requires the authenticated user to be an active member of the target group.
 *
 * @param  {GetReportsParams} params Query parameters for filtering reports.
 * @returns {Promise<AxiosResponse<ShiftReport[]>>} Axios promise resolving to the list of shift report records.
 */
export const getReports = (params: GetReportsParams): Promise<AxiosResponse<ShiftReport[]>> =>
    apiClient.get<ShiftReport[]>("/reports", { params });

/**
 * Retrieves a page of shift reports along with parsed cursor pagination headers
 * (`X-Has-More`, `X-Next-Cursor-Date`, `X-Next-Cursor-Id`).
 */
export const getReportsPage = async (params: GetReportsParams): Promise<PaginatedReportsResult> => {
    const res = await getReports(params);
    const headers = res.headers ?? {};
    const hasMore = String(headers["x-has-more"] ?? "").toLowerCase() === "true";
    const nextCursorDate = typeof headers["x-next-cursor-date"] === "string" && headers["x-next-cursor-date"].length > 0
        ? headers["x-next-cursor-date"]
        : null;
    const nextCursorId = typeof headers["x-next-cursor-id"] === "string" && headers["x-next-cursor-id"].length > 0
        ? headers["x-next-cursor-id"]
        : null;
    return {
        reports: Array.isArray(res.data) ? res.data : [],
        hasMore,
        nextCursorDate,
        nextCursorId,
    };
};

/**
 * Creates a new shift report for a specified group.
 *
 * Automatically inherits unfinished tasks from the group's most recent prior report
 * and populates the initial attendee list from published shift schedules matching
 * the shift start time and configured time slots.
 *
 * @param  {CreateReportPayload} reportData The shift report creation payload.
 * @returns {Promise<AxiosResponse<ShiftReport>>} Axios promise resolving to the newly created shift report record.
 */
export const createReport = (reportData: CreateReportPayload): Promise<AxiosResponse<ShiftReport>> =>
    apiClient.post<ShiftReport>("/reports", reportData);

/**
 * Partially updates an existing shift report by its unique identifier
 * (PATCH: omitted fields keep their stored values).
 *
 * Allows updating current task notes, carried-over previous tasks and attendee rosters.
 * Reports cannot be locked; any other field is ignored. Requires membership in the report's
 * group (any role, including the group's Shift Manager).
 *
 * @param  {string}              id         The unique identifier of the shift report to update.
 * @param  {UpdateReportPayload} reportData The updated shift report payload fields.
 * @returns {Promise<AxiosResponse<ShiftReport>>} Axios promise resolving to the updated shift report record.
 */
export const updateReport = (id: string, reportData: UpdateReportPayload): Promise<AxiosResponse<ShiftReport>> =>
    apiClient.patch<ShiftReport>(`/reports/${id}`, reportData);

/**
 * Deletes a shift report permanently by its unique identifier.
 *
 * Authorization is strictly restricted on the backend to Shift Managers of the
 * report's group or system Administrators.
 *
 * @param  {string} id  The unique identifier of the shift report to delete.
 * @returns {Promise<AxiosResponse<{ message: string }>>} Axios promise resolving to the deletion confirmation response.
 */
export const deleteReport = (id: string): Promise<AxiosResponse<{ message: string }>> =>
    apiClient.delete<{ message: string }>(`/reports/${id}`);


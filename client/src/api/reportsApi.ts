/**
 * @module ReportsApi
 *
 * Provides client-side API methods for managing operational shift reports.
 * Communicates with backend endpoints to fetch shift reports with temporal filtering,
 * create new reports with automatic schedule-based attendance and task carryover,
 * update task logs and attendee rosters, and remove report records.
 */

import apiClient from "./apiClient";

/**
 * Retrieves shift reports for a group with optional date-based filtering.
 *
 * Reports are returned in descending chronological order by shift start time.
 * Requires the authenticated user to be an active member of the target group.
 *
 * @param  {Object}               params          Query parameters for filtering reports.
 * @param  {string}               params.groupId  The unique identifier of the group whose reports to fetch.
 * @param  {number|string}        [params.year]   Optional year to filter reports by.
 * @param  {number|string}        [params.month]  Optional month (1-12) to filter reports by.
 * @param  {number|string}        [params.day]    Optional day of the month to filter reports by.
 * @returns {Promise<import("axios").AxiosResponse<any[]>>} Axios promise resolving to the list of shift report records.
 */
export const getReports = (params: any) => apiClient.get("/reports", { params });

/**
 * Creates a new shift report for a specified group.
 *
 * Automatically inherits unfinished tasks from the group's most recent prior report
 * and populates the initial attendee list from published shift schedules matching
 * the shift start time and configured time slots.
 *
 * @param  {Object}               reportData            The shift report creation payload.
 * @param  {string}               reportData.groupId    The unique identifier of the group the report belongs to.
 * @param  {string}               reportData.title      Descriptive title for the shift report.
 * @param  {Date|string}          reportData.startTime  The scheduled start date and time of the shift.
 * @param  {Date|string}          reportData.endTime    The scheduled end date and time of the shift.
 * @returns {Promise<import("axios").AxiosResponse<any>>} Axios promise resolving to the newly created shift report record.
 */
export const createReport = (reportData: any) => apiClient.post("/reports", reportData);

/**
 * Updates an existing shift report by its unique identifier.
 *
 * Allows updating current task notes, carried-over previous tasks, attendee rosters,
 * or locking the report against further edits. Requires membership in the report's group.
 *
 * @param  {string}               id                          The unique identifier of the shift report to update.
 * @param  {Object}               reportData                  The updated shift report payload fields.
 * @param  {string}               [reportData.currentTasks]   Updated rich-text/HTML content of tasks completed in this shift.
 * @param  {string}               [reportData.previousTasks]  Updated notes or pending tasks inherited from prior shifts.
 * @param  {Array<Object>}        [reportData.attendees]      Updated list of personnel attending the shift.
 * @param  {boolean}              [reportData.isLocked]       If true, prevents further modifications to the report.
 * @returns {Promise<import("axios").AxiosResponse<any>>} Axios promise resolving to the updated shift report record.
 */
export const updateReport = (id: string, reportData: any) => apiClient.put(`/reports/${id}`, reportData);

/**
 * Deletes a shift report permanently by its unique identifier.
 *
 * Authorization is strictly restricted on the backend to Shift Managers of the
 * report's group or system Administrators.
 *
 * @param  {string} id  The unique identifier of the shift report to delete.
 * @returns {Promise<import("axios").AxiosResponse<{ message: string }>>} Axios promise resolving to the deletion confirmation response.
 */
export const deleteReport = (id: string) => apiClient.delete(`/reports/${id}`);


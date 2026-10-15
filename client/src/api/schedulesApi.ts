/**
 * @module SchedulesApi
 *
 * Provides client-side API methods for managing group shift schedules.
 * Communicates with backend endpoints to fetch weekly and historical schedules,
 * save and update draft shift assignments, and publish schedules with
 * automatic vacation balance deductions.
 */

import apiClient from "./apiClient";

/**
 * Retrieves the group's shift schedule covering a date.
 *
 * Shift Managers can view both published and draft schedules, while standard
 * group members can only access published schedules. The request rejects with
 * a 404 response when no visible schedule covers the date (e.g. a week not planned yet).
 *
 * @param  {Object}        params          Query parameters for fetching the schedule.
 * @param  {string}        params.groupId  The unique identifier of the group.
 * @param  {string|Date}   params.date     An ISO 8601 date within the schedule period (e.g. the week start).
 * @returns {Promise<import("axios").AxiosResponse<any>>} Axios promise resolving to the shift schedule record.
 */
export const getSchedule = (params: any, options?: { signal?: AbortSignal }) =>
    apiClient.get("/schedules", { params, signal: options?.signal });

/**
 * Retrieves all shift schedules for a specific group.
 *
 * Used for aggregating yearly statistics and shift history. Filters out draft
 * schedules unless requested by an authorized Shift Manager of the group.
 *
 * @param  {Object}  params          Query parameters for fetching group schedules.
 * @param  {string}  params.groupId  The unique identifier of the target group.
 * @returns {Promise<import("axios").AxiosResponse<any[]>>} Axios promise resolving to the list of shift schedules.
 */
export const getAllSchedules = (params: any) => apiClient.get("/schedules/all", { params });

/**
 * Saves a draft of a group's shift schedule and never changes vacation balances.
 *
 * For a published week only its draft (`draftShifts`) is written, so members keep seeing the
 * published shifts until a publish succeeds; an unpublished week is upserted. Only the shifts of
 * active group members are taken: everyone else's published shifts are kept as they are. A save
 * that changes nothing writes nothing (same revision). Responds with the Shift Manager's view.
 * Restricted strictly to Shift Managers of the group.
 *
 * @param  {Object}               scheduleData            The shift schedule payload.
 * @param  {string}               scheduleData.groupId    The unique identifier of the group.
 * @param  {Date|string}          scheduleData.startDate  The starting date/time of the schedule period.
 * @param  {Date|string}          scheduleData.endDate    The ending date/time of the schedule period.
 * @param  {Array<Object>}        scheduleData.shifts     List of shift assignments containing userId, date, and shiftTypeId.
 * @returns {Promise<import("axios").AxiosResponse<any>>} Axios promise resolving to the saved shift schedule record.
 */
export const saveSchedule = (scheduleData: any) => apiClient.put("/schedules", scheduleData);

/**
 * Publishes a shift schedule and processes member vacation deductions.
 *
 * Marks the schedule as published to make it visible to all group members, and
 * automatically deducts vacation days from the balances of users assigned to vacation
 * shift types. Restricted strictly to Shift Managers of the schedule's group.
 * All-or-nothing: if any active group member lacks the balance, nothing is deducted and the
 * request rejects with 400 INSUFFICIENT_VACATION_BALANCE (the message names them).
 * Deactivated members and users no longer in the group are outside the schedule: their published
 * shifts are kept unchanged and they are never charged or refunded.
 * A published week with nothing pending answers 200 with `unchanged: true` and changes nothing.
 * Reports from today onwards get their automatic attendees from the newly published shifts.
 *
 * @param  {string} scheduleId  The unique identifier of the shift schedule to publish.
 * @param  {number} [revision]  The revision being confirmed; the server answers 409 if the schedule changed since.
 * @returns {Promise<import("axios").AxiosResponse<any>>} Axios promise resolving to the published shift schedule record.
 */
export const publishSchedule = (scheduleId: string, revision?: number) =>
    apiClient.post("/schedules/publish", { scheduleId, revision });


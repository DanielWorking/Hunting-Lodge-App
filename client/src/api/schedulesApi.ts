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
 * Retrieves a specific shift schedule for a group based on its start date.
 *
 * Shift Managers can view both published and draft schedules, while standard
 * group members can only access published schedules.
 *
 * @param  {Object}        params          Query parameters for fetching the schedule.
 * @param  {string}        params.groupId  The unique identifier of the group.
 * @param  {string|Date}   params.date     The start date of the schedule period (e.g. week start in ISO format).
 * @returns {Promise<import("axios").AxiosResponse<any>>} Axios promise resolving to the shift schedule record.
 */
export const getSchedule = (params: any) => apiClient.get("/schedules", { params });

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
 * Saves or updates a shift schedule for a group.
 *
 * Upserts the schedule record for the given start date. When updating an already
 * published schedule, automatically reconciles and refunds vacation balances for any
 * removed vacation shifts. Restricted strictly to Shift Managers of the group.
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
 *
 * @param  {string} scheduleId  The unique identifier of the shift schedule to publish.
 * @returns {Promise<import("axios").AxiosResponse<any>>} Axios promise resolving to the published shift schedule record.
 */
export const publishSchedule = (scheduleId: string) => apiClient.post("/schedules/publish", { scheduleId });


import apiClient from "./apiClient";

export const getSchedule = (params: any) => apiClient.get("/schedules", { params });
export const getAllSchedules = (params: any) => apiClient.get("/schedules/all", { params });
export const saveSchedule = (scheduleData: any) => apiClient.put("/schedules", scheduleData);
export const publishSchedule = (scheduleId: string) => apiClient.post("/schedules/publish", { scheduleId });

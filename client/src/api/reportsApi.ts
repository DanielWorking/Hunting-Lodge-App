import apiClient from "./apiClient";

export const getReports = (params: any) => apiClient.get("/reports", { params });
export const createReport = (reportData: any) => apiClient.post("/reports", reportData);
export const updateReport = (id: string, reportData: any) => apiClient.put(`/reports/${id}`, reportData);
export const deleteReport = (id: string) => apiClient.delete(`/reports/${id}`);

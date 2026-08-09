import apiClient from "./apiClient";

export const getSites = () => apiClient.get("/sites");
export const createSite = (siteData: any) => apiClient.post("/sites", siteData);
export const updateSite = (id: string, siteData: any) => apiClient.put(`/sites/${id}`, siteData);
export const deleteSite = (id: string) => apiClient.delete(`/sites/${id}`);
export const toggleFavoriteSite = (id: string) => apiClient.put(`/sites/${id}/favorite`);

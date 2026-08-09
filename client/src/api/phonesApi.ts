import apiClient from "./apiClient";

export const getPhones = () => apiClient.get("/phones");
export const createPhone = (phoneData: any) => apiClient.post("/phones", phoneData);
export const updatePhone = (id: string, phoneData: any) => apiClient.put(`/phones/${id}`, phoneData);
export const deletePhone = (id: string) => apiClient.delete(`/phones/${id}`);
export const toggleFavoritePhone = (id: string) => apiClient.patch(`/phones/${id}/favorite`);

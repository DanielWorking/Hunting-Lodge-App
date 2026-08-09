import apiClient from "./apiClient";

export const getUsers = () => apiClient.get("/users");
export const loginUser = (username: string) => apiClient.post("/users/login", { username });
export const createUser = (userData: any) => apiClient.post("/users", userData);
export const updateUser = (id: string, userData: any) => apiClient.put(`/users/${id}`, userData);
export const managerUpdateUser = (id: string, updates: any) => apiClient.patch(`/users/${id}/manager-update`, updates);
export const reorderUsers = (payload: any) => apiClient.put("/users/reorder/group", payload);
export const deleteUser = (id: string) => apiClient.delete(`/users/${id}`);

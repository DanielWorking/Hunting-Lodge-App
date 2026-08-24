import apiClient from "./apiClient";

/**
 * Fetches users from the API.
 * 
 * @param {string} [groupId] - Optional group identifier. When provided, returns only members of that group.
 *                            When omitted, returns all users across the system (restricted to Administrators).
 * @returns {Promise<AxiosResponse<User[]>>} List of users.
 */
export const getUsers = (groupId?: string) =>
    apiClient.get("/users", {
        params: groupId ? { groupId } : undefined,
    });
export const loginUser = (username: string) => apiClient.post("/users/login", { username });
export const updateUser = (id: string, userData: any) => apiClient.put(`/users/${id}`, userData);
export const managerUpdateUser = (id: string, updates: any) => apiClient.patch(`/users/${id}/manager-update`, updates);
export const reorderUsers = (payload: any) => apiClient.put("/users/reorder/group", payload);
export const deleteUser = (id: string) => apiClient.delete(`/users/${id}`);

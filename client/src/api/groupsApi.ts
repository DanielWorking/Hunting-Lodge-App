import apiClient from "./apiClient";

export const getGroups = () => apiClient.get("/groups");
export const createGroup = (groupData: any) => apiClient.post("/groups", groupData);
export const updateGroup = (id: string, groupData: any) => apiClient.put(`/groups/${id}`, groupData);
export const deleteGroup = (id: string) => apiClient.delete(`/groups/${id}`);
export const addGroupTag = (groupId: string, tagData: any) => apiClient.post(`/groups/${groupId}/tags`, tagData);
export const renameGroupTag = (groupId: string, tag: string, tagData: { newTagName: string }) => apiClient.put(`/groups/${groupId}/tags/${encodeURIComponent(tag)}`, tagData);
export const deleteGroupTag = (groupId: string, tag: string) => apiClient.delete(`/groups/${groupId}/tags/${encodeURIComponent(tag)}`);
export const updateGroupSettings = (groupId: string, settings: any) => apiClient.put(`/groups/${groupId}/settings`, settings);
export const sendGroupReport = (groupId: string, data: any) => apiClient.post(`/groups/${groupId}/send-report`, data);

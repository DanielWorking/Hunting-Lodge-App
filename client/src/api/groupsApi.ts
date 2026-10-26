/**
 * @module GroupsApi
 *
 * Provides client-side API methods for managing organizational groups.
 * Handles group CRUD operations, shift scheduling settings (shift types and time slots),
 * and site bookmark tag management.
 */

import apiClient from "./apiClient";

/**
 * Retrieves all groups accessible to the current authenticated user.
 *
 * System administrators receive all groups with calculated member counts,
 * whereas regular users receive only the groups they belong to.
 *
 * @returns {Promise<import("axios").AxiosResponse<import("../types").Group[]>>} Axios promise resolving to the list of accessible group records.
 */
export const getGroups = () => apiClient.get("/groups");

/**
 * Creates a new organizational group.
 *
 * Initializes a new group record with default settings and a default "General" site tag.
 * Restricted to system administrators.
 *
 * @param  {Object|import("../types").Group} groupData  The group payload containing at least the group name.
 * @returns {Promise<import("axios").AxiosResponse<import("../types").Group>>} Axios promise resolving to the newly created group record.
 */
export const createGroup = (groupData: any) => apiClient.post("/groups", groupData);

/**
 * Renames an existing group (the server accepts only `name` and rejects any other field;
 * settings go through {@link updateGroupSettings} and tags through the tag endpoints).
 *
 * Protected system administrator groups cannot be modified. Restricted to system administrators.
 *
 * @param  {string}           id         The unique identifier of the group to rename.
 * @param  {{ name: string }} groupData  The new group name.
 * @returns {Promise<import("axios").AxiosResponse<import("../types").Group>>} Axios promise resolving to the updated group record.
 */
export const updateGroup = (id: string, groupData: { name: string }) => apiClient.patch(`/groups/${id}`, groupData);

/**
 * Deletes a group and cleans up all associated resources.
 *
 * Removes the group record, strips group memberships from users, and cascades
 * deletion to all associated sites, shift schedules, and reports.
 * Cannot delete groups with active members or protected system groups. Restricted to administrators.
 *
 * @param  {string} id  The unique identifier of the group to delete.
 * @returns {Promise<import("axios").AxiosResponse<{ message: string }>>} Axios promise resolving to the deletion confirmation response.
 */
export const deleteGroup = (id: string) => apiClient.delete(`/groups/${id}`);

/**
 * Adds a new site category tag to a group.
 *
 * Appends the specified tag name to the group's site tags list for categorizing bookmarks.
 * Requires explicit group membership.
 *
 * @param  {string}                   groupId  The unique identifier of the target group.
 * @param  {{ tagName: string }|any}  tagData  Payload containing the name of the new tag to create.
 * @returns {Promise<import("axios").AxiosResponse<string[]>>} Axios promise resolving to the updated array of site tags.
 */
export const addGroupTag = (groupId: string, tagData: any) => apiClient.post(`/groups/${groupId}/tags`, tagData);

/**
 * Renames an existing site category tag and updates all associated sites.
 *
 * Updates the tag entry in the group's site tags array and cascades the rename
 * to all Site documents within the group that reference the old tag name.
 * The default "General" tag cannot be renamed. Requires explicit group membership.
 *
 * @param  {string}                    groupId  The unique identifier of the target group.
 * @param  {string}                    tag      The existing tag name to be renamed.
 * @param  {{ newTagName: string }}    tagData  Payload containing the new replacement tag name.
 * @returns {Promise<import("axios").AxiosResponse<{ message: string; siteTags: string[] }>>} Axios promise resolving to the rename confirmation and updated tags list.
 */
export const renameGroupTag = (groupId: string, tag: string, tagData: { newTagName: string }) =>
    // The names travel in the body, so "/" and spaces need no encoding
    apiClient.put(`/groups/${groupId}/tags`, { tagName: tag, newTagName: tagData.newTagName });

/**
 * Deletes a category tag from a group and moves associated sites to the default tag.
 *
 * Removes the tag from the group's site tags array and automatically reassigns
 * all sites under that tag to the "General" category. The default "General" tag
 * cannot be deleted. Requires explicit group membership.
 *
 * @param  {string} groupId  The unique identifier of the target group.
 * @param  {string} tag      The name of the tag to delete.
 * @returns {Promise<import("axios").AxiosResponse<{ message: string; siteTags: string[] }>>} Axios promise resolving to the deletion confirmation and updated tags list.
 */
export const deleteGroupTag = (groupId: string, tag: string) =>
    // A query parameter rather than a body: some proxies drop DELETE bodies. Axios encodes it.
    apiClient.delete(`/groups/${groupId}/tags`, { params: { tagName: tag } });

/**
 * Updates shift configuration settings (shift types and time slots) for a group.
 *
 * Modifies the group's scheduling configuration, including custom shift definitions
 * and time slot ranges. Enforces uniqueness across shift type names.
 * Restricted to Shift Managers of the group.
 *
 * @param  {string}                               groupId   The unique identifier of the target group.
 * @param  {import("../types").GroupSettings|any} settings  The updated settings payload containing shiftTypes and/or timeSlots.
 * @returns {Promise<import("axios").AxiosResponse<import("../types").Group>>} Axios promise resolving to the updated group record.
 */
export const updateGroupSettings = (groupId: string, settings: any) => apiClient.put(`/groups/${groupId}/settings`, settings);



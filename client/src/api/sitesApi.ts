/**
 * @module SitesApi
 *
 * Provides client-side API methods for managing group-specific web resources and bookmarks.
 * Communicates with backend endpoints to fetch accessible sites, create and update
 * bookmark records with URL uniqueness checks, delete resources, and toggle user favorites.
 */

import apiClient from "./apiClient";

/**
 * Retrieves all web resource bookmarks accessible to the authenticated user.
 *
 * Sites are filtered on the backend to match the organizational groups that the
 * requesting user belongs to. Each record contains metadata including URL, title,
 * category tag, and the list of user IDs who have favorited the bookmark.
 *
 * @returns {Promise<import("axios").AxiosResponse<import("../types").SiteCard[]>>} Axios promise resolving to the list of accessible site bookmark records.
 */
export const getSites = () => apiClient.get("/sites");

/**
 * Creates a new web resource bookmark entry for a specific group.
 *
 * Validates group membership and ensures the destination URL does not already exist
 * within the target group. Assigns the bookmark to the specified category tag.
 *
 * @param  {Object|Partial<import("../types").SiteCard>} siteData  The bookmark payload containing title, url, groupId, and optional tag, description, or imageUrl.
 * @returns {Promise<import("axios").AxiosResponse<import("../types").SiteCard>>} Axios promise resolving to the newly created site bookmark record.
 */
export const createSite = (siteData: any) => apiClient.post("/sites", siteData);

/**
 * Updates an existing web resource bookmark by its unique identifier.
 *
 * Checks for URL duplication within the target group and verifies that the user
 * has explicit membership in the site's group (and destination group if transferring).
 *
 * @param  {string}                                     id        The unique identifier of the site bookmark to update.
 * @param  {Object|Partial<import("../types").SiteCard>} siteData  The updated bookmark fields (title, url, tag, description, imageUrl, or groupId).
 * @returns {Promise<import("axios").AxiosResponse<import("../types").SiteCard>>} Axios promise resolving to the updated site bookmark record.
 */
export const updateSite = (id: string, siteData: any) => apiClient.put(`/sites/${id}`, siteData);

/**
 * Deletes a web resource bookmark from the repository by its unique identifier.
 *
 * Permanently removes the bookmark record from the database. Requires explicit
 * membership in the site's assigned group.
 *
 * @param  {string} id  The unique identifier of the site bookmark to delete.
 * @returns {Promise<import("axios").AxiosResponse<{ message: string }>>} Axios promise resolving to the deletion confirmation response.
 */
export const deleteSite = (id: string) => apiClient.delete(`/sites/${id}`);

/**
 * Toggles the favorite status of a web resource bookmark for the current user.
 *
 * Adds the authenticated user's ID to the bookmark's `favoritedBy` array if not
 * present, or removes it if previously favorited. Requires group membership.
 *
 * @param  {string} id  The unique identifier of the site bookmark to toggle.
 * @returns {Promise<import("axios").AxiosResponse<import("../types").SiteCard>>} Axios promise resolving to the updated site bookmark record.
 */
export const toggleFavoriteSite = (id: string) => apiClient.put(`/sites/${id}/favorite`);


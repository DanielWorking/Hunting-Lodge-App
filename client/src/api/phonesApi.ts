/**
 * @module PhonesApi
 *
 * Provides client-side API methods for managing the shared phone directory.
 * Communicates with backend endpoints to retrieve contacts with user-specific
 * favorite states, create, update, and delete phone records, and toggle favorites.
 */

import apiClient from "./apiClient";

/**
 * Retrieves all phone directory contacts accessible to the current user.
 *
 * Contacts are returned sorted alphabetically by name, with an added
 * dynamic `isFavorite` flag reflecting the authenticated user's preferences.
 *
 * @returns {Promise<import("axios").AxiosResponse<import("../types").PhoneRow[]>>} Axios promise resolving to the list of phone directory entries.
 */
export const getPhones = () => apiClient.get("/phones");

/**
 * Creates a new phone contact entry in the shared directory.
 *
 * Validates on the backend that the provided phone numbers do not conflict
 * with existing directory entries before saving.
 *
 * @param  {Object|Partial<import("../types").PhoneRow>} phoneData  The contact payload containing name, numbers, type, and description.
 * @returns {Promise<import("axios").AxiosResponse<import("../types").PhoneRow>>} Axios promise resolving to the newly created phone record.
 */
export const createPhone = (phoneData: any) => apiClient.post("/phones", phoneData);

/**
 * Updates an existing phone contact entry by its unique identifier.
 *
 * Checks for phone number uniqueness across all other contacts before applying updates.
 *
 * @param  {string}                                     id         The unique identifier of the phone contact to update.
 * @param  {Object|Partial<import("../types").PhoneRow>} phoneData  The updated phone contact fields (name, numbers, type, description).
 * @returns {Promise<import("axios").AxiosResponse<import("../types").PhoneRow>>} Axios promise resolving to the updated phone record.
 */
export const updatePhone = (id: string, phoneData: any) => apiClient.put(`/phones/${id}`, phoneData);

/**
 * Deletes a phone contact entry from the directory by its unique identifier.
 *
 * Removes the contact record permanently from the database.
 *
 * @param  {string} id  The unique identifier of the phone contact to delete.
 * @returns {Promise<import("axios").AxiosResponse<{ message: string }>>} Axios promise resolving to the deletion confirmation response.
 */
export const deletePhone = (id: string) => apiClient.delete(`/phones/${id}`);

/**
 * Toggles the favorite status of a specific phone contact for the current user.
 *
 * Appends the phone ID to the authenticated user's favorite list if not present,
 * or removes it if already favorited.
 *
 * @param  {string} id  The unique identifier of the phone contact to toggle.
 * @returns {Promise<import("axios").AxiosResponse<{ favoritePhones: string[] }>>} Axios promise resolving to the user's updated favorite phone IDs array.
 */
export const toggleFavoritePhone = (id: string) => apiClient.patch(`/phones/${id}/favorite`);


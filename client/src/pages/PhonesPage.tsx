/**
 * @module PhonesPage
 *
 * Provides a management interface for the phone directory.
 * Includes functionality for searching, filtering, adding, editing,
 * and deleting phone numbers, as well as toggling favorite status.
 */

import { useState } from "react";
import { Container, useTheme } from "@mui/material";
import axios from "axios";

import { useData } from "../context/DataContext";
import { useNotification } from "../context/NotificationContext";
import type { PhoneRow } from "../types";

// Internal components
import PhonesHeader from "../components/phones/PhonesHeader";
import PhonesTable from "../components/phones/PhonesTable";
import PhoneDialog from "../components/PhoneDialog";
import PhoneDetailsDialog from "../components/PhoneDetailsDialog";
import ConfirmDialog from "../components/ConfirmDialog";

/**
 * The directory management page for phone numbers.
 *
 * Manages the state and operations for the phone list, including
 * complex filtering and sorting logic based on names and numbers.
 *
 * @returns {JSX.Element} The rendered PhonesPage component.
 */
export default function PhonesPage() {
    const theme = useTheme(); // Keep for potential future use; logic moved to table
    const { phones, refreshData } = useData();
    const { showNotification } = useNotification();

    // === State Management ===
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPhone, setEditingPhone] = useState<PhoneRow | null>(null);
    const [viewingPhone, setViewingPhone] = useState<PhoneRow | null>(null);
    const [deleteItem, setDeleteItem] = useState<PhoneRow | null>(null);

    // Filtering and sorting state
    const [filterFav, setFilterFav] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [sortOrder, setSortOrder] = useState("name-asc");

    // --- Event Handlers ---

    /**
     * Prepares the dialog for adding a new phone entry.
     */
    const handleAddClick = () => {
        setEditingPhone(null);
        setIsDialogOpen(true);
    };

    /**
     * Prepares the dialog for editing an existing phone entry.
     *
     * @param {PhoneRow} phone The phone record to edit.
     */
    const handleEditClick = (phone: PhoneRow) => {
        setEditingPhone(phone);
        setIsDialogOpen(true);
    };

    /**
     * Triggers the details view for a specific phone entry.
     *
     * @param {PhoneRow} phone The phone record to view.
     */
    const handleRowClick = (phone: PhoneRow) => {
        setViewingPhone(phone);
    };

    /**
     * Triggers the deletion confirmation for a specific phone entry.
     *
     * @param {PhoneRow} phone The phone record to delete.
     */
    const handleDeleteClick = (phone: PhoneRow) => {
        setDeleteItem(phone);
    };

    /**
     * Toggles the sort order between ascending and descending by name.
     */
    const handleToggleSortOrder = () => {
        setSortOrder((prev) =>
            prev === "name-asc" ? "name-desc" : "name-asc",
        );
    };

    /**
     * Executes the deletion of the selected phone record.
     */
    const handleConfirmDelete = async () => {
        if (deleteItem) {
            const idToDelete = deleteItem._id || deleteItem.id;
            try {
                await axios.delete(`/api/phones/${idToDelete}`);
                showNotification("Phone deleted successfully", "success");
                refreshData();
            } catch (error) {
                showNotification("Error deleting phone", "error");
            } finally {
                setDeleteItem(null);
            }
        }
    };

    /**
     * Persists changes (create or update) for a phone entry.
     *
     * @param {Partial<PhoneRow>} phoneData The updated phone data.
     * @throws {Error} Propagates errors for the dialog to handle.
     */
    const handleSavePhone = async (phoneData: Partial<PhoneRow>) => {
        try {
            if (editingPhone) {
                await axios.put(
                    `/api/phones/${editingPhone._id || editingPhone.id}`,
                    phoneData,
                );
                showNotification("Phone updated successfully", "success");
            } else {
                await axios.post("/api/phones", phoneData);
                showNotification("Phone added successfully", "success");
            }
            refreshData();
            setIsDialogOpen(false); // Close only on success
        } catch (err: any) {
            // Do not close the dialog on error; propagate for display
            throw err;
        }
    };

    /**
     * Toggles the favorite status of a phone record on the server.
     *
     * @param {PhoneRow} phone The phone record to toggle.
     */
    const handleToggleFavorite = async (phone: PhoneRow) => {
        try {
            // Call the server endpoint to toggle favorite status
            await axios.patch(`/api/phones/${phone._id || phone.id}/favorite`);

            // Trigger data refresh to sync the UI
            refreshData();

            const newStatus = !phone.isFavorite;
            showNotification(
                newStatus ? "Added to favorites" : "Removed from favorites",
                "success",
            );
        } catch (err) {
            showNotification("Failed to update favorite", "error");
        }
    };

    // === Filtering & Sorting Logic ===

    const filteredPhones = phones.filter((phone) => {
        const searchLower = searchTerm.toLowerCase();
        const searchDigits = searchTerm.replace(/\D/g, "");

        const matchText =
            phone.name.toLowerCase().includes(searchLower) ||
            phone.description.toLowerCase().includes(searchLower);

        const matchNumber = phone.numbers.some((num) => {
            const cleanNum = num.replace(/\D/g, "");
            return (
                num.includes(searchLower) ||
                (searchDigits.length > 0 && cleanNum.includes(searchDigits))
            );
        });

        if (filterFav === "fav" && !phone.isFavorite) return false;

        return matchText || matchNumber;
    });

    const sortedPhones = [...filteredPhones].sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        if (sortOrder === "name-asc") return a.name.localeCompare(b.name);
        if (sortOrder === "name-desc") return b.name.localeCompare(a.name);
        return 0;
    });

    // === Render ===

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            {/* 1. Header Section */}
            <PhonesHeader
                filterFav={filterFav}
                setFilterFav={setFilterFav}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                sortOrder={sortOrder}
                onToggleSortOrder={handleToggleSortOrder}
                onAddClick={handleAddClick}
            />

            {/* 2. Table Section */}
            <PhonesTable
                phones={sortedPhones}
                onRowClick={handleRowClick}
                onEditClick={handleEditClick}
                onDeleteClick={handleDeleteClick}
                onToggleFavorite={handleToggleFavorite}
            />

            {/* 3. Dialogs (Hidden by default) */}
            <PhoneDialog
                open={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                onSave={handleSavePhone}
                initialData={editingPhone}
            />

            <PhoneDetailsDialog
                open={!!viewingPhone}
                onClose={() => setViewingPhone(null)}
                data={viewingPhone}
            />

            <ConfirmDialog
                open={!!deleteItem}
                title={
                    deleteItem ? `Delete "${deleteItem.name}"?` : "Delete Phone"
                }
                content={`Are you sure you want to delete the phone number for ${deleteItem?.name}? This action cannot be undone.`}
                onCancel={() => setDeleteItem(null)}
                onConfirm={handleConfirmDelete}
            />
        </Container>
    );
}

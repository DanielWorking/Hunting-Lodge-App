import { useState } from "react";
import { Container, useTheme } from "@mui/material";
import axios from "axios";

import { useData } from "../context/DataContext";
import { useNotification } from "../context/NotificationContext";
import type { PhoneRow } from "../types";

// רכיבים פנימיים
import PhonesHeader from "../components/phones/PhonesHeader";
import PhonesTable from "../components/phones/PhonesTable";
import PhoneDialog from "../components/PhoneDialog";
import PhoneDetailsDialog from "../components/PhoneDetailsDialog";
import ConfirmDialog from "../components/ConfirmDialog";

export default function PhonesPage() {
    const theme = useTheme(); // נשאר למקרה שנצטרך בעתיד, כרגע העברנו את השימוש בו לטבלה
    const { phones, refreshData } = useData();
    const { showNotification } = useNotification();

    // === State Management ===
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPhone, setEditingPhone] = useState<PhoneRow | null>(null);
    const [viewingPhone, setViewingPhone] = useState<PhoneRow | null>(null);
    const [deleteItem, setDeleteItem] = useState<PhoneRow | null>(null);

    // State לסינון ומיון
    const [filterFav, setFilterFav] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [sortOrder, setSortOrder] = useState("name-asc");

    // === Handlers (לוגיקה) ===

    const handleAddClick = () => {
        setEditingPhone(null);
        setIsDialogOpen(true);
    };

    const handleEditClick = (phone: PhoneRow) => {
        setEditingPhone(phone);
        setIsDialogOpen(true);
    };

    const handleRowClick = (phone: PhoneRow) => {
        setViewingPhone(phone);
    };

    const handleDeleteClick = (phone: PhoneRow) => {
        setDeleteItem(phone);
    };

    const handleToggleSortOrder = () => {
        setSortOrder((prev) =>
            prev === "name-asc" ? "name-desc" : "name-asc",
        );
    };

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

    const handleSavePhone = async (formData: Partial<PhoneRow>) => {
        // 1. בדיקת כפילות מספר
        const duplicateNumber = phones.find((p) => {
            if (
                editingPhone &&
                (p._id || p.id) === (editingPhone._id || editingPhone.id)
            )
                return false;

            const newNumbers = formData.numbers || [];
            return p.numbers.some((existingNum) =>
                newNumbers.includes(existingNum),
            );
        });

        if (duplicateNumber) {
            showNotification(
                "One of the phone numbers already exists.",
                "error",
            );
            return;
        }

        // 2. בדיקת כפילות שם
        const duplicateName = phones.find(
            (p) =>
                p.name.toLowerCase() === formData.name?.toLowerCase() &&
                (!editingPhone ||
                    (p._id || p.id) !== (editingPhone._id || editingPhone.id)),
        );

        if (duplicateName) {
            showNotification(
                "A phone with this exact name already exists.",
                "error",
            );
            return;
        }

        try {
            if (editingPhone) {
                const phoneId = editingPhone._id || editingPhone.id;
                await axios.put(`/api/phones/${phoneId}`, formData);
                showNotification("Phone updated successfully", "success");
            } else {
                await axios.post("/api/phones", formData);
                showNotification("New phone created successfully", "success");
            }
            refreshData();
        } catch (error) {
            showNotification("Error saving phone", "error");
        }
    };

    const handleToggleFavorite = async (phone: PhoneRow) => {
        try {
            const phoneId = phone._id || phone.id;
            await axios.put(`/api/phones/${phoneId}`, {
                isFavorite: !phone.isFavorite,
            });
            refreshData();
        } catch (error) {
            showNotification("Error updating favorite", "error");
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

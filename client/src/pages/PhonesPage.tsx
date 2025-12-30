import { useState } from "react";
import {
    Container,
    Typography,
    Box,
    TextField,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Chip,
    Tooltip,
    useTheme,
} from "@mui/material";
import { useData } from "../context/DataContext";
import type { PhoneRow, PhoneType } from "../types";
import PhoneDialog from "../components/PhoneDialog";
import PhoneDetailsDialog from "../components/PhoneDetailsDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import { useNotification } from "../context/NotificationContext";
import axios from "axios";

import AddIcon from "@mui/icons-material/Add";
import SortIcon from "@mui/icons-material/Sort";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

export default function PhonesPage() {
    const theme = useTheme();
    const { phones, setPhones, refreshData } = useData();
    const { showNotification } = useNotification();

    // State לניהול דיאלוגים
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPhone, setEditingPhone] = useState<PhoneRow | null>(null);
    const [viewingPhone, setViewingPhone] = useState<PhoneRow | null>(null);

    // State למחיקה - מחזיק את האובייקט המלא
    const [deleteItem, setDeleteItem] = useState<PhoneRow | null>(null);

    // State לסינון ומיון
    const [filterFav, setFilterFav] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [sortOrder, setSortOrder] = useState("name-asc");

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
        // 1. בדיקת כפילות מספר (בודקים אם *אחד* מהמספרים החדשים קיים כבר במערכת)
        const duplicateNumber = phones.find((p) => {
            // מדלגים על הטלפון שאנחנו עורכים כרגע
            if (
                editingPhone &&
                (p._id || p.id) === (editingPhone._id || editingPhone.id)
            )
                return false;

            // בודקים חפיפה בין המערכים
            const newNumbers = formData.numbers || [];
            return p.numbers.some((existingNum) =>
                newNumbers.includes(existingNum)
            );
        });

        if (duplicateNumber) {
            showNotification(
                "One of the phone numbers already exists.",
                "error"
            );
            return;
        }

        // 2. בדיקת כפילות שם
        const duplicateName = phones.find(
            (p) =>
                p.name.toLowerCase() === formData.name?.toLowerCase() &&
                (!editingPhone ||
                    (p._id || p.id) !== (editingPhone._id || editingPhone.id))
        );

        if (duplicateName) {
            showNotification(
                "A phone with this exact name already exists.",
                "error"
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

    const formatPhoneNumber = (number: string, type: PhoneType): string => {
        return number;
    };

    const getTypeColor = (type: PhoneType) => {
        switch (type) {
            case "Red":
                return "error";
            case "Black":
                return "default";
            case "Mobile":
                return "primary";
            case "Landline":
                return "success";
            default:
                return "default";
        }
    };

    const filteredPhones = phones.filter((phone) => {
        const searchLower = searchTerm.toLowerCase();

        // ניקוי תווים מיוחדים מהחיפוש (לחיפוש מספרים "נקי")
        const searchDigits = searchTerm.replace(/\D/g, "");

        // בדיקת שם ותיאור
        const matchText =
            phone.name.toLowerCase().includes(searchLower) ||
            phone.description.toLowerCase().includes(searchLower);

        // בדיקת מספרים (עוברים על כל המערך numbers)
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

    // צבע רקע לכותרת הטבלה (לתיקון Sticky ב-Dark Mode)
    const headerBgColor =
        theme.palette.mode === "dark"
            ? theme.palette.background.default
            : "#f5f5f5";

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box sx={{ mb: 4 }}>
                <Typography
                    variant="h4"
                    component="h1"
                    gutterBottom
                    sx={{ fontWeight: "bold" }}
                >
                    Phone Directory
                </Typography>
                <Typography variant="subtitle1" color="text.secondary">
                    Global contact list shared across all teams.
                </Typography>
            </Box>

            <Box
                sx={{
                    display: "flex",
                    gap: 2,
                    mb: 4,
                    flexWrap: "wrap",
                    alignItems: "center",
                    bgcolor: "background.paper",
                    p: 2,
                    borderRadius: 2,
                    boxShadow: 1,
                }}
            >
                <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Filter</InputLabel>
                    <Select
                        value={filterFav}
                        label="Filter"
                        onChange={(e) => setFilterFav(e.target.value)}
                    >
                        <MenuItem value="all">Show All</MenuItem>
                        <MenuItem value="fav">Favorites Only</MenuItem>
                    </Select>
                </FormControl>

                <TextField
                    size="small"
                    label="Search Phones..."
                    variant="outlined"
                    sx={{ flexGrow: 1 }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />

                <Button
                    variant="outlined"
                    startIcon={<SortIcon />}
                    onClick={() =>
                        setSortOrder((prev) =>
                            prev === "name-asc" ? "name-desc" : "name-asc"
                        )
                    }
                >
                    {sortOrder === "name-asc" ? "Name (A-Z)" : "Name (Z-A)"}
                </Button>

                <Button
                    variant="contained"
                    color="primary"
                    startIcon={<AddIcon />}
                    onClick={handleAddClick}
                >
                    Add Phone
                </Button>
            </Box>

            {/* טבלה עם גלילה */}
            <TableContainer
                component={Paper}
                sx={{ maxHeight: "65vh", overflowY: "auto" }}
            >
                <Table sx={{ minWidth: 650 }} stickyHeader>
                    <TableHead>
                        <TableRow>
                            {/* הגדרת רקע ו-zIndex לכל תא בכותרת */}
                            <TableCell
                                sx={{
                                    fontWeight: "bold",
                                    bgcolor: headerBgColor,
                                    zIndex: 10,
                                }}
                            >
                                Number
                            </TableCell>
                            <TableCell
                                sx={{
                                    fontWeight: "bold",
                                    bgcolor: headerBgColor,
                                    zIndex: 10,
                                }}
                            >
                                Type
                            </TableCell>
                            <TableCell
                                sx={{
                                    fontWeight: "bold",
                                    bgcolor: headerBgColor,
                                    zIndex: 10,
                                }}
                            >
                                Description
                            </TableCell>
                            <TableCell
                                sx={{
                                    fontWeight: "bold",
                                    bgcolor: headerBgColor,
                                    zIndex: 10,
                                }}
                            >
                                Name
                            </TableCell>
                            <TableCell
                                align="center"
                                sx={{
                                    fontWeight: "bold",
                                    bgcolor: headerBgColor,
                                    zIndex: 10,
                                }}
                            >
                                Favorite
                            </TableCell>
                            <TableCell
                                align="center"
                                sx={{
                                    fontWeight: "bold",
                                    bgcolor: headerBgColor,
                                    zIndex: 10,
                                }}
                            >
                                Actions
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sortedPhones.map((row) => (
                            <TableRow
                                key={row._id || row.id}
                                onClick={() => handleRowClick(row)}
                                sx={{
                                    cursor: "pointer",
                                    "&:hover": { bgcolor: "action.hover" },
                                    textDecoration: "none",
                                }}
                            >
                                {/* תצוגת מספר טלפון: מציג את הראשון, ואינדיקציה אם יש עוד */}
                                <TableCell
                                    component="th"
                                    scope="row"
                                    sx={{
                                        fontFamily: "monospace",
                                        fontSize: "1.1rem",
                                    }}
                                >
                                    {row.numbers && row.numbers.length > 0
                                        ? formatPhoneNumber(
                                              row.numbers[0],
                                              row.type
                                          )
                                        : ""}
                                    {row.numbers && row.numbers.length > 1 && (
                                        <Typography
                                            component="span"
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{ ml: 1, fontWeight: "bold" }}
                                        >
                                            (+{row.numbers.length - 1})
                                        </Typography>
                                    )}
                                </TableCell>

                                <TableCell>
                                    <Chip
                                        label={row.type}
                                        color={getTypeColor(row.type) as any}
                                        size="small"
                                        variant="outlined"
                                    />
                                </TableCell>

                                {/* תיאור מקוצר (Truncate) ל-15 תווים */}
                                <TableCell sx={{ maxWidth: 250 }}>
                                    {row.description.length > 15
                                        ? `${row.description.slice(0, 15)}...`
                                        : row.description}
                                </TableCell>

                                <TableCell sx={{ fontWeight: "bold" }}>
                                    {row.name}
                                </TableCell>

                                <TableCell align="center">
                                    <IconButton
                                        color="error"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleFavorite(row);
                                        }}
                                    >
                                        {row.isFavorite ? (
                                            <FavoriteIcon />
                                        ) : (
                                            <FavoriteBorderIcon />
                                        )}
                                    </IconButton>
                                </TableCell>

                                <TableCell align="center">
                                    <Tooltip title="Edit">
                                        <IconButton
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleEditClick(row);
                                            }}
                                        >
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                        <IconButton
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteClick(row); // שולחים את כל האובייקט
                                            }}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                        {sortedPhones.length === 0 && (
                            <TableRow>
                                <TableCell
                                    colSpan={6}
                                    align="center"
                                    sx={{ py: 3 }}
                                >
                                    No phones found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* חלון הוספה/עריכה */}
            <PhoneDialog
                open={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                onSave={handleSavePhone}
                initialData={editingPhone}
            />

            {/* חלון צפייה בפרטים */}
            <PhoneDetailsDialog
                open={!!viewingPhone}
                onClose={() => setViewingPhone(null)}
                data={viewingPhone}
            />

            {/* חלון מחיקה עם שם דינמי */}
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

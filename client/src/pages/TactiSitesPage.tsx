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
} from "@mui/material";
import Grid from "@mui/material/Grid";
import { useUser } from "../context/UserContext";
import { useData } from "../context/DataContext";
import SiteCard from "../components/SiteCard";
import SiteDialog from "../components/SiteDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import { useNotification } from "../context/NotificationContext";
import type { SiteCard as SiteCardType } from "../types";
import AddIcon from "@mui/icons-material/Add";
import SortIcon from "@mui/icons-material/Sort";
import axios from "axios";
import ThinkingLoader from "../components/ThinkingLoader";

export default function TactiSitesPage() {
    const { currentGroup } = useUser();
    const { showNotification } = useNotification();
    const { tactiSites, setTactiSites, refreshData, loading } = useData();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingSite, setEditingSite] = useState<SiteCardType | null>(null);

    // === שינוי: שמירת האובייקט המלא ===
    const [deleteItem, setDeleteItem] = useState<SiteCardType | null>(null);

    const [filterFav, setFilterFav] = useState("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [sortOrder, setSortOrder] = useState("newest");

    const handleAddClick = () => {
        setEditingSite(null);
        setIsDialogOpen(true);
    };

    const handleEditClick = (site: SiteCardType) => {
        setEditingSite(site);
        setIsDialogOpen(true);
    };

    const handleDeleteClick = (site: SiteCardType) => {
        setDeleteItem(site);
    };

    const handleConfirmDelete = async () => {
        if (deleteItem) {
            const idToDelete = deleteItem._id || deleteItem.id;
            try {
                await axios.delete(`/api/sites/${idToDelete}`);
                showNotification("Tacti Site deleted successfully", "success");
                refreshData();
            } catch (error) {
                console.error(error);
                showNotification("Error deleting site", "error");
            } finally {
                setDeleteItem(null);
            }
        }
    };

    const handleSaveSite = async (formData: Partial<SiteCardType>) => {
        if (!currentGroup) return;

        const duplicate = tactiSites.find(
            (s) =>
                s.url.toLowerCase() === formData.url?.toLowerCase() &&
                (!editingSite ||
                    (s._id || s.id) !== (editingSite._id || editingSite.id))
        );

        if (duplicate) {
            showNotification(
                "This URL already exists in Tacti Sites.",
                "error"
            );
            return;
        }

        try {
            if (editingSite) {
                const siteId = editingSite._id || editingSite.id;
                await axios.put(`/api/sites/${siteId}`, {
                    ...formData,
                    groupId: currentGroup.id || currentGroup._id,
                });
                showNotification("Tacti Site updated successfully", "success");
            } else {
                await axios.post("/api/sites", {
                    ...formData,
                    groupId: currentGroup.id || currentGroup._id,
                    isTacti: true,
                });
                showNotification(
                    "New Tacti Site created successfully",
                    "success"
                );
            }
            refreshData();
        } catch (error) {
            console.error(error);
            showNotification("Error saving tacti site", "error");
        }
    };

    const handleToggleFavorite = async (site: SiteCardType) => {
        try {
            const siteId = site._id || site.id;
            await axios.put(`/api/sites/${siteId}`, {
                isFavorite: !site.isFavorite,
            });
            refreshData();
        } catch (error) {
            showNotification("Error updating favorite", "error");
        }
    };

    const filteredSites = tactiSites.filter((site) => {
        const currentGroupId = currentGroup?.id || currentGroup?._id;
        if (site.groupId !== currentGroupId) return false;

        const matchesSearch = site.title
            .toLowerCase()
            .includes(searchTerm.toLowerCase());
        if (filterFav === "fav" && !site.isFavorite) return false;
        return matchesSearch;
    });

    const sortedSites = [...filteredSites].sort((a, b) => {
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        if (sortOrder === "newest")
            return b.createdAt.localeCompare(a.createdAt);
        return a.createdAt.localeCompare(b.createdAt);
    });

    if (loading && tactiSites.length === 0) {
        return <ThinkingLoader />;
    }

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box sx={{ mb: 4 }}>
                <Typography
                    variant="h4"
                    component="h1"
                    gutterBottom
                    sx={{ fontWeight: "bold", color: "#d32f2f" }}
                >
                    {currentGroup?.name.toUpperCase()} TACTI SITES
                </Typography>
                <Typography variant="subtitle1" color="text.secondary">
                    Operational and tactical resources for the group.
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
                    label="Search Tacti Sites..."
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
                            prev === "newest" ? "oldest" : "newest"
                        )
                    }
                >
                    {sortOrder === "newest" ? "Newest First" : "Oldest First"}
                </Button>

                <Button
                    variant="contained"
                    color="error"
                    startIcon={<AddIcon />}
                    onClick={handleAddClick}
                >
                    Add Tacti Site
                </Button>
            </Box>

            {sortedSites.length > 0 ? (
                <Grid container spacing={3}>
                    {sortedSites.map((site) => (
                        <Grid
                            key={site._id || site.id}
                            size={{ xs: 12, sm: 6, md: 4 }}
                        >
                            <SiteCard
                                data={site}
                                onEdit={() => handleEditClick(site)}
                                // === שינוי: שליחת האובייקט המלא ===
                                onDelete={() => handleDeleteClick(site)}
                                onToggleFavorite={() =>
                                    handleToggleFavorite(site)
                                }
                            />
                        </Grid>
                    ))}
                </Grid>
            ) : (
                <Box sx={{ textAlign: "center", mt: 8, opacity: 0.6 }}>
                    <Typography variant="h6">
                        No tactical sites found.
                    </Typography>
                </Box>
            )}

            <SiteDialog
                open={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                onSave={handleSaveSite}
                initialData={editingSite}
            />

            {/* === שינוי: כותרת דינמית === */}
            <ConfirmDialog
                open={!!deleteItem}
                title={
                    deleteItem
                        ? `Delete "${deleteItem.title}"?`
                        : "Delete Tacti Site"
                }
                content={`Are you sure you want to delete the site "${deleteItem?.title}"? This action cannot be undone.`}
                onCancel={() => setDeleteItem(null)}
                onConfirm={handleConfirmDelete}
            />
        </Container>
    );
}

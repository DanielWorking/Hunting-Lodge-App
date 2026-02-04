import { useState } from "react";
import {
    Container,
    Typography,
    Box,
    TextField,
    Button,
    Chip,
    Stack,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tooltip,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Grid,
} from "@mui/material";
import { useUser } from "../context/UserContext";
import { useData } from "../context/DataContext";
import SiteCard from "../components/SiteCard";
import SiteDialog from "../components/SiteDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import { useNotification } from "../context/NotificationContext";
import type { SiteCard as SiteCardType } from "../types";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SortIcon from "@mui/icons-material/Sort";
import axios from "axios";
import ThinkingLoader from "../components/ThinkingLoader";

export default function SitesPage() {
    const { currentGroup } = useUser();
    const { showNotification } = useNotification();
    const { sites, setSites, groups, refreshData, loading } = useData();

    // מציאת הקבוצה הפעילה מתוך הדאטה כדי לקבל את כל השדות שלה (כולל _id ו-siteTags)
    const activeGroup = groups.find(
        (g) => (g.id || g._id) === (currentGroup?.id || currentGroup?._id),
    );
    const groupTags =
        activeGroup?.siteTags && activeGroup.siteTags.length > 0
            ? activeGroup.siteTags
            : ["General"];

    // State
    const [selectedTag, setSelectedTag] = useState("All");
    const [searchTerm, setSearchTerm] = useState("");

    // Filters restored
    const [filterFav, setFilterFav] = useState("all");
    const [sortOrder, setSortOrder] = useState("newest"); // 'newest', 'oldest', 'a-z', 'z-a'

    // Dialogs State
    const [isSiteDialogOpen, setIsSiteDialogOpen] = useState(false);
    const [editingSite, setEditingSite] = useState<SiteCardType | null>(null);
    const [deleteSiteItem, setDeleteSiteItem] = useState<SiteCardType | null>(
        null,
    );

    // Tag Management State
    const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
    const [tagDialogMode, setTagDialogMode] = useState<"create" | "edit">(
        "create",
    );
    const [tagValue, setTagValue] = useState("");
    const [tagToDelete, setTagToDelete] = useState<string | null>(null);

    // === Site Management ===

    const handleAddSiteClick = () => {
        setEditingSite(null);
        setIsSiteDialogOpen(true);
    };

    const handleEditSiteClick = (site: SiteCardType) => {
        setEditingSite(site);
        setIsSiteDialogOpen(true);
    };

    const handleSaveSite = async (formData: Partial<SiteCardType>) => {
        if (!activeGroup) return;

        // FIX: Using _id (ObjectId) for the relationship, NOT the custom string id
        const groupIdToSend = activeGroup._id;

        try {
            if (editingSite) {
                const siteId = editingSite._id || editingSite.id;
                await axios.put(`/api/sites/${siteId}`, {
                    ...formData,
                    groupId: groupIdToSend,
                });
                showNotification("Site updated successfully", "success");
            } else {
                await axios.post("/api/sites", {
                    ...formData,
                    groupId: groupIdToSend,
                });
                showNotification("New site created successfully", "success");
            }
            refreshData();
        } catch (error) {
            console.error(error);
            showNotification("Error saving site", "error");
        }
    };

    const handleDeleteSiteClick = (site: SiteCardType) => {
        setDeleteSiteItem(site);
    };

    const handleConfirmDeleteSite = async () => {
        if (deleteSiteItem) {
            const idToDelete = deleteSiteItem._id || deleteSiteItem.id;
            try {
                await axios.delete(`/api/sites/${idToDelete}`);
                showNotification("Site deleted successfully", "success");
                refreshData();
            } catch (error) {
                console.error(error);
                showNotification("Error deleting site", "error");
            } finally {
                setDeleteSiteItem(null);
            }
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

    // === Tag Management ===

    const openCreateTagDialog = () => {
        setTagDialogMode("create");
        setTagValue("");
        setIsTagDialogOpen(true);
    };

    const openEditTagDialog = () => {
        if (selectedTag === "All" || selectedTag === "General") return;
        setTagDialogMode("edit");
        setTagValue(selectedTag);
        setIsTagDialogOpen(true);
    };

    const handleSaveTag = async () => {
        if (!tagValue.trim() || !activeGroup) return;
        // For tags URL: we use the custom ID string because that's how the route is defined (/:id/tags)
        const groupId = activeGroup.id;

        try {
            if (tagDialogMode === "create") {
                await axios.post(`/api/groups/${groupId}/tags`, {
                    tagName: tagValue,
                });
                showNotification("Tag created", "success");
                setSelectedTag(tagValue);
            } else {
                // Edit mode
                await axios.put(`/api/groups/${groupId}/tags/${selectedTag}`, {
                    newTagName: tagValue,
                });
                showNotification("Tag updated", "success");
                setSelectedTag(tagValue);
            }
            refreshData();
            setIsTagDialogOpen(false);
        } catch (error: any) {
            showNotification(
                error.response?.data?.message || "Error saving tag",
                "error",
            );
        }
    };

    const handleDeleteTagClick = () => {
        if (selectedTag === "All" || selectedTag === "General") return;
        setTagToDelete(selectedTag);
    };

    const handleConfirmDeleteTag = async () => {
        if (!tagToDelete || !activeGroup) return;
        const groupId = activeGroup.id;

        try {
            await axios.delete(`/api/groups/${groupId}/tags/${tagToDelete}`);
            showNotification("Tag deleted. Sites moved to General.", "success");
            setSelectedTag("General");
            refreshData();
        } catch (error: any) {
            showNotification("Error deleting tag", "error");
        } finally {
            setTagToDelete(null);
        }
    };

    // === Filtering & Sorting ===

    const filteredSites = sites.filter((site) => {
        // FIX: Compare ObjectId to ObjectId
        if (site.groupId !== activeGroup?._id) return false;

        // Tag Filtering
        const siteTag = site.tag || "General";
        if (selectedTag !== "All" && siteTag !== selectedTag) return false;

        // Favorite Filtering
        if (filterFav === "fav" && !site.isFavorite) return false;

        // Search Filtering
        const matchesSearch = site.title
            .toLowerCase()
            .includes(searchTerm.toLowerCase());
        return matchesSearch;
    });

    const sortedSites = [...filteredSites].sort((a, b) => {
        // Always prioritize favorites if "newest" or "oldest" isn't strictly overriding logic
        // (Usually users want favorites on top unless sorting by name)

        // Let's implement strict sorting based on user selection:

        if (sortOrder === "a-z") return a.title.localeCompare(b.title);
        if (sortOrder === "z-a") return b.title.localeCompare(a.title);
        if (sortOrder === "newest")
            return b.createdAt.localeCompare(a.createdAt);
        if (sortOrder === "oldest")
            return a.createdAt.localeCompare(b.createdAt);

        return 0;
    });

    if (loading && sites.length === 0) {
        return <ThinkingLoader />;
    }

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Box sx={{ mb: 3 }}>
                <Typography
                    variant="h4"
                    component="h1"
                    gutterBottom
                    sx={{ fontWeight: "bold" }}
                >
                    {activeGroup?.name.toUpperCase()} Sites
                </Typography>
            </Box>

            {/* Tag Filter Bar */}
            <Box sx={{ mb: 3 }}>
                <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ flexWrap: "wrap", gap: 1 }}
                >
                    <Chip
                        label="All Tags"
                        onClick={() => setSelectedTag("All")}
                        color={selectedTag === "All" ? "primary" : "default"}
                        variant={selectedTag === "All" ? "filled" : "outlined"}
                        clickable
                    />
                    {groupTags.map((tag) => (
                        <Chip
                            key={tag}
                            label={tag}
                            onClick={() => setSelectedTag(tag)}
                            color={selectedTag === tag ? "primary" : "default"}
                            variant={
                                selectedTag === tag ? "filled" : "outlined"
                            }
                            clickable
                        />
                    ))}
                    <Tooltip title="Create new tag">
                        <IconButton
                            size="small"
                            onClick={openCreateTagDialog}
                            sx={{ border: "1px dashed grey" }}
                        >
                            <AddIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>

                {selectedTag !== "All" && selectedTag !== "General" && (
                    <Box
                        sx={{
                            mt: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                        }}
                    >
                        <Typography variant="caption" color="text.secondary">
                            Tag Actions:
                        </Typography>
                        <Tooltip title="Rename Tag">
                            <IconButton
                                size="small"
                                onClick={openEditTagDialog}
                                color="primary"
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete Tag">
                            <IconButton
                                size="small"
                                onClick={handleDeleteTagClick}
                                color="error"
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                )}
            </Box>

            {/* Controls Bar: Filter, Search, Sort, Add */}
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
                {/* 1. Filter Favorites */}
                <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Show</InputLabel>
                    <Select
                        value={filterFav}
                        label="Show"
                        onChange={(e) => setFilterFav(e.target.value)}
                    >
                        <MenuItem value="all">All Sites</MenuItem>
                        <MenuItem value="fav">Favorites Only</MenuItem>
                    </Select>
                </FormControl>

                {/* 2. Search */}
                <TextField
                    size="small"
                    label="Search Sites..."
                    variant="outlined"
                    sx={{ flexGrow: 1 }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />

                {/* 3. Sort */}
                <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Sort By</InputLabel>
                    <Select
                        value={sortOrder}
                        label="Sort By"
                        onChange={(e) => setSortOrder(e.target.value)}
                        startAdornment={
                            <SortIcon
                                fontSize="small"
                                sx={{ mr: 1, color: "action.active" }}
                            />
                        }
                    >
                        <MenuItem value="newest">Newest</MenuItem>
                        <MenuItem value="oldest">Oldest</MenuItem>
                        <MenuItem value="a-z">Name (A-Z)</MenuItem>
                        <MenuItem value="z-a">Name (Z-A)</MenuItem>
                    </Select>
                </FormControl>

                {/* 4. Add Button */}
                <Button
                    variant="contained"
                    color="primary"
                    startIcon={<AddIcon />}
                    onClick={handleAddSiteClick}
                >
                    Add Site
                </Button>
            </Box>

            {/* Sites Grid */}
            {sortedSites.length > 0 ? (
                <Grid container spacing={3}>
                    {sortedSites.map((site) => (
                        <Grid
                            key={site._id || site.id}
                            size={{ xs: 12, sm: 6, md: 4 }}
                        >
                            <SiteCard
                                data={site}
                                onEdit={() => handleEditSiteClick(site)}
                                onDelete={() => handleDeleteSiteClick(site)}
                                onToggleFavorite={() =>
                                    handleToggleFavorite(site)
                                }
                            />
                        </Grid>
                    ))}
                </Grid>
            ) : (
                <Box sx={{ textAlign: "center", mt: 8, opacity: 0.6 }}>
                    <Typography variant="h6">No sites found.</Typography>
                </Box>
            )}

            <SiteDialog
                open={isSiteDialogOpen}
                onClose={() => setIsSiteDialogOpen(false)}
                onSave={handleSaveSite}
                initialData={editingSite}
                currentGroup={activeGroup}
            />

            <ConfirmDialog
                open={!!deleteSiteItem}
                title={
                    deleteSiteItem
                        ? `Delete "${deleteSiteItem.title}"?`
                        : "Delete Site"
                }
                content={`Are you sure you want to delete "${deleteSiteItem?.title}"?`}
                onCancel={() => setDeleteSiteItem(null)}
                onConfirm={handleConfirmDeleteSite}
            />

            <Dialog
                open={isTagDialogOpen}
                onClose={() => setIsTagDialogOpen(false)}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>
                    {tagDialogMode === "create" ? "New Tag" : "Rename Tag"}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Tag Name"
                        fullWidth
                        variant="outlined"
                        value={tagValue}
                        onChange={(e) => setTagValue(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsTagDialogOpen(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSaveTag}
                        variant="contained"
                        color="primary"
                    >
                        Save
                    </Button>
                </DialogActions>
            </Dialog>

            <ConfirmDialog
                open={!!tagToDelete}
                title={`Delete Tag "${tagToDelete}"?`}
                content={`Are you sure? All sites under this tag will be moved to "General".`}
                onCancel={() => setTagToDelete(null)}
                onConfirm={handleConfirmDeleteTag}
            />
        </Container>
    );
}

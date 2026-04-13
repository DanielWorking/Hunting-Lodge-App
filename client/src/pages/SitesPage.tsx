/**
 * @module SitesPage
 *
 * Provides a management interface for group-specific sites and bookmarks.
 * Includes features for categorization via tags, searching, filtering favorites,
 * and performing CRUD operations on both sites and tags.
 */

import { useState } from "react";
// ... (imports remain unchanged)
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

/**
 * The primary sites management page component.
 *
 * Manages the state for site listings, tag-based filtering, and administrative
 * actions. Implements complex sorting and filtering logic to provide a
 * responsive user experience.
 *
 * @returns {JSX.Element} The rendered SitesPage component.
 */
export default function SitesPage() {
    const { user, currentGroup } = useUser();
    const { showNotification } = useNotification();
    const { sites, setSites, groups, refreshData, loading } = useData();

    // Locate the active group within the data context to access extended fields
    // such as the database _id and site-specific tags.
    const activeGroup = groups.find(
        (g) => (g.id || g._id) === (currentGroup?.id || currentGroup?._id),
    );
    const groupTags =
        activeGroup?.siteTags && activeGroup.siteTags.length > 0
            ? activeGroup.siteTags
            : ["General"];

    // --- State ---
    const [selectedTag, setSelectedTag] = useState("All");
    const [searchTerm, setSearchTerm] = useState("");

    // Filtering and Sorting state
    const [filterFav, setFilterFav] = useState("all");
    const [sortOrder, setSortOrder] = useState("newest"); // 'newest', 'oldest', 'a-z', 'z-a'

    // Dialog Management state
    const [isSiteDialogOpen, setIsSiteDialogOpen] = useState(false);
    const [editingSite, setEditingSite] = useState<SiteCardType | null>(null);
    const [deleteSiteItem, setDeleteSiteItem] = useState<SiteCardType | null>(
        null,
    );

    // Tag Management state
    const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
    const [tagDialogMode, setTagDialogMode] = useState<"create" | "edit">(
        "create",
    );
    const [tagValue, setTagValue] = useState("");
    const [tagToDelete, setTagToDelete] = useState<string | null>(null);

    // === Site Management Handlers ===

    /**
     * Prepares and opens the dialog for adding a new site.
     */
    const handleAddSiteClick = () => {
        setEditingSite(null);
        setIsSiteDialogOpen(true);
    };

    /**
     * Prepares and opens the dialog for editing an existing site.
     *
     * @param {SiteCardType} site The site object to be edited.
     */
    const handleEditSiteClick = (site: SiteCardType) => {
        setEditingSite(site);
        setIsSiteDialogOpen(true);
    };

    /**
     * Persists site changes (create or update) to the server.
     *
     * @param {Partial<SiteCardType>} formData The site data to be saved.
     */
    const handleSaveSite = async (formData: Partial<SiteCardType>) => {
        if (!activeGroup) return;

        // Ensure we use the MongoDB _id for relationship consistency
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

    /**
     * Sets the site to be deleted and triggers the confirmation dialog.
     *
     * @param {SiteCardType} site The site marked for deletion.
     */
    const handleDeleteSiteClick = (site: SiteCardType) => {
        setDeleteSiteItem(site);
    };

    /**
     * Executes the deletion of the selected site on the server.
     */
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

    /**
     * Toggles the favorite status of a site for the current user.
     *
     * @param {SiteCardType} site The site to toggle.
     */
    const handleToggleFavorite = async (site: SiteCardType) => {
        try {
            const siteId = site._id || site.id;
            await axios.put(`/api/sites/${siteId}/favorite`);
            refreshData();
        } catch (error) {
            showNotification("Error updating favorite", "error");
        }
    };

    // === Tag Management Handlers ===

    /**
     * Initializes the dialog for creating a new tag.
     */
    const openCreateTagDialog = () => {
        setTagDialogMode("create");
        setTagValue("");
        setIsTagDialogOpen(true);
    };

    /**
     * Initializes the dialog for renaming an existing tag.
     */
    const openEditTagDialog = () => {
        if (selectedTag === "All" || selectedTag === "General") return;
        setTagDialogMode("edit");
        setTagValue(selectedTag);
        setIsTagDialogOpen(true);
    };

    /**
     * Persists tag changes (create or rename) to the server.
     */
    const handleSaveTag = async () => {
        if (!tagValue.trim() || !activeGroup) return;
        // The group route expects the string-based ID for tag operations
        const groupId = activeGroup.id;

        try {
            if (tagDialogMode === "create") {
                await axios.post(`/api/groups/${groupId}/tags`, {
                    tagName: tagValue,
                });
                showNotification("Tag created", "success");
                setSelectedTag(tagValue);
            } else {
                // Perform tag rename operation
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

    /**
     * Triggers the deletion confirmation for the currently selected tag.
     */
    const handleDeleteTagClick = () => {
        if (selectedTag === "All" || selectedTag === "General") return;
        setTagToDelete(selectedTag);
    };

    /**
     * Executes the tag deletion on the server and moves associated sites to "General".
     */
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
        // Compare ObjectId to ObjectId
        if (site.groupId !== activeGroup?._id) return false;

        // Tag Filtering
        const siteTag = site.tag || "General";
        if (selectedTag !== "All" && siteTag !== selectedTag) return false;

        // Favorite Filtering (Per User)
        const userId = user?._id || user?.id;
        const isFav =
            userId && site.favoritedBy
                ? site.favoritedBy.includes(userId)
                : false;
        if (filterFav === "fav" && !isFav) return false;

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
            {/* Header Section: Displays the current group name */}
            <Box sx={{ mb: 3 }}>
                <Typography
                    variant="h4"
                    component="h1"
                    gutterBottom
                    sx={{
                        fontWeight: "bold",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                    }}
                >
                    {activeGroup?.name} Sites
                </Typography>
            </Box>

            {/* Tag Filter Bar: Provides horizontal navigation for categorized sites.
                Includes an entry point for creating new tags. */}
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

                {/* Contextual Tag Actions: Displayed only when a user-defined tag is selected.
                    Excludes "All" and "General" to prevent modification of system-level filters. */}
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

            {/* Controls Bar: A unified toolbar for filtering, searching, and adding new sites.
                Uses a flexbox layout to remain responsive on smaller screens. */}
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
                {/* 1. Favorite Filter: Toggles between all sites and user-specific favorites. */}
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

                {/* 2. Text Search: Filters site titles in real-time. */}
                <TextField
                    size="small"
                    label="Search Sites..."
                    variant="outlined"
                    sx={{ flexGrow: 1 }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />

                {/* 3. Sort Control: Allows ordering by date (newest/oldest) or title. */}
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

                {/* 4. Primary Action: Opens the site creation dialog. */}
                <Button
                    variant="contained"
                    color="primary"
                    startIcon={<AddIcon />}
                    onClick={handleAddSiteClick}
                >
                    Add Site
                </Button>
            </Box>

            {/* Sites Grid: Renders the filtered and sorted list of sites.
                Displays an empty state message if no sites match the current criteria. */}
            {sortedSites.length > 0 ? (
                <Grid container spacing={3}>
                    {sortedSites.map((site) => (
                        <Grid
                            key={site._id || site.id}
                            size={{ xs: 12, sm: 6, md: 4 }}
                        >
                            <SiteCard
                                data={{
                                    ...site,
                                    isFavorite:
                                        (user?._id || user?.id) &&
                                        site.favoritedBy
                                            ? site.favoritedBy.includes(
                                                  user._id || user.id,
                                              )
                                            : false,
                                }}
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

            {/* Modal Dialogs for data entry and confirmation */}
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

            {/* Tag Management Dialog: Used for both creating and renaming tags. */}
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

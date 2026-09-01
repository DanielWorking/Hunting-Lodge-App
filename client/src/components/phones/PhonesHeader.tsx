/**
 * @module PhonesHeader
 *
 * Provides the header section for the Phone Directory, including search,
 * filtering, and action controls.
 */

import {
    Box,
    Typography,
    TextField,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Button,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SortIcon from "@mui/icons-material/Sort";

/**
 * Properties for the {@link PhonesHeader} component.
 */
interface PhonesHeaderProps {
    /** The current favorite filter state ('all' or 'fav'). */
    filterFav: string;
    /** Callback to update the favorite filter state. */
    setFilterFav: (value: string) => void;
    /** The current search query string. */
    searchTerm: string;
    /** Callback to update the search term as the user types. */
    setSearchTerm: (value: string) => void;
    /** The current sort identifier (e.g., 'name-asc'). */
    sortOrder: string;
    /** Callback to toggle between ascending and descending sort orders. */
    onToggleSortOrder: () => void;
    /** Callback triggered when the 'Add Phone' action is initiated. */
    onAddClick: () => void;
}

/**
 * Renders the top navigation and action bar for the Phone Directory.
 *
 * Includes the page title, description, and a toolbar with filtering by
 * favorites, search by name/number, sorting, and adding new records.
 *
 * @param {PhonesHeaderProps} props  The properties for the component.
 * @returns {JSX.Element}             The rendered header component.
 */
export default function PhonesHeader({
    filterFav,
    setFilterFav,
    searchTerm,
    setSearchTerm,
    sortOrder,
    onToggleSortOrder,
    onAddClick,
}: PhonesHeaderProps) {
    return (
        <>
            <Box
                sx={{
                    mb: 2,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                }}
            >
                <Typography
                    variant="h4"
                    component="h1"
                    gutterBottom
                    sx={{ fontWeight: "bold" }}
                >
                    Phone Directory
                </Typography>
                <Typography variant="subtitle1" component="p" color="text.secondary">
                    Global contact list shared across all teams.
                </Typography>
            </Box>

            <Box
                sx={{
                    display: "flex",
                    gap: 2,
                    mb: 2,
                    flexWrap: "wrap",
                    alignItems: "center",
                    bgcolor: "background.paper",
                    p: 2,
                    borderRadius: 2,
                    boxShadow: 1,
                }}
            >
                <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel id="phone-filter-label">Filter</InputLabel>
                    <Select
                        labelId="phone-filter-label"
                        id="phone-filter-select"
                        value={filterFav}
                        label="Filter"
                        inputProps={{
                            "aria-label": "Filter",
                        }}
                        sx={{ minHeight: 44 }}
                        onChange={(e) => setFilterFav(e.target.value)}
                    >
                        <MenuItem value="all">Show All</MenuItem>
                        <MenuItem value="fav">Favorites Only</MenuItem>
                    </Select>
                </FormControl>

                <TextField
                    id="phone-search-input"
                    size="small"
                    label="Search by name, number, or description..."
                    variant="outlined"
                    sx={{ flexGrow: 1, minHeight: 44 }}
                    value={searchTerm}
                    inputProps={{
                        "aria-label": "Search by name, number, or description",
                        role: "searchbox",
                    }}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />

                <Button
                    variant="outlined"
                    startIcon={<SortIcon />}
                    onClick={onToggleSortOrder}
                    sx={{ minHeight: 44 }}
                    aria-label={
                        sortOrder === "name-asc"
                            ? "Sort by name (A-Z), click to sort descending"
                            : "Sort by name (Z-A), click to sort ascending"
                    }
                >
                    {sortOrder === "name-asc" ? "Name (A-Z)" : "Name (Z-A)"}
                </Button>

                <Button
                    variant="contained"
                    color="primary"
                    startIcon={<AddIcon />}
                    onClick={onAddClick}
                    sx={{ minHeight: 44 }}
                    aria-label="Add Phone"
                >
                    Add Phone
                </Button>
            </Box>
        </>
    );
}

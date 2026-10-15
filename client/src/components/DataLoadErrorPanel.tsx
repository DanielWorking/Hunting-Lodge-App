/**
 * @module DataLoadErrorPanel
 *
 * Full-page message shown when the app could not load the groups or users it needs, instead of an
 * empty app with no group. Nothing retries on its own: the user decides when with Retry.
 */

import { Box, Button, Paper, Typography } from "@mui/material";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import type { DataLoadError } from "../context/DataContext";

interface DataLoadErrorPanelProps {
    error: DataLoadError;
    onRetry: () => void;
}

export default function DataLoadErrorPanel({ error, onRetry }: DataLoadErrorPanelProps) {
    return (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flexGrow: 1, p: 2 }}>
            <Paper role="alert" sx={{ p: 4, maxWidth: 480, textAlign: "center" }}>
                <CloudOffIcon color="error" sx={{ fontSize: 48, mb: 1 }} aria-hidden="true" />
                <Typography variant="h5" component="h1" gutterBottom>
                    Couldn't load your data
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 3 }}>
                    {error.message}
                </Typography>
                <Button variant="contained" onClick={onRetry}>
                    Retry
                </Button>
            </Paper>
        </Box>
    );
}

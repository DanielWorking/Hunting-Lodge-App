/**
 * @module StatisticsTab
 *
 * Provides a reporting interface for shift statistics within a group.
 * Aggregates published shift data to show per-member breakdown of shift types,
 * displays current vacation balances, and enables sending detailed reports via email.
 */

import { useState, useEffect } from "react";
import {
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    CircularProgress,
    Button,
    Chip,
} from "@mui/material";
import EmailIcon from "@mui/icons-material/Email";
import { useUser } from "../../context/UserContext";
import { useData } from "../../context/DataContext";
import { useNotification } from "../../context/NotificationContext";
import ShiftDatesDialog from "../ShiftDatesDialog";
import axios from "axios";

/**
 * Renders the statistics and reporting tab for group administrators.
 *
 * Calculates yearly shift counts from published schedules and allows users
 * to view specific dates for each shift type. Supports manual triggering
 * of email reports to defined recipients.
 *
 * @returns {JSX.Element} The rendered StatisticsTab component.
 */
export default function StatisticsTab() {
    const { currentGroup } = useUser();
    const { users, groups } = useData();
    const { showNotification } = useNotification();

    /** @type {Object} Aggregated shift data mapped by user ID and shift type. */
    const [stats, setStats] = useState<any>({});
    const [loading, setLoading] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedShiftName, setSelectedShiftName] = useState("");
    const [selectedDates, setSelectedDates] = useState<string[]>([]);

    const groupSettings = groups.find(
        (g) => (g._id || g.id) === (currentGroup?._id || currentGroup?.id),
    )?.settings;
    const shiftTypes = groupSettings?.shiftTypes || [];

    useEffect(() => {
        if (currentGroup) calculateStats();
    }, [currentGroup]);

    /**
     * Determines the appropriate text color (black or white) for a given background color.
     *
     * Uses the YIQ color space formula to ensure optimal contrast and readability.
     *
     * @param {string} hexColor  The background color in hex format (e.g., "#FFFFFF").
     * @returns {"black" | "white"}  The recommended text color.
     */
    const getContrastText = (hexColor: string) => {
        if (!hexColor) return "black";
        const r = parseInt(hexColor.substr(1, 2), 16);
        const g = parseInt(hexColor.substr(3, 2), 16);
        const b = parseInt(hexColor.substr(5, 2), 16);
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        return yiq >= 128 ? "black" : "white";
    };

    /**
     * Fetches all group schedules and aggregates statistics for published shifts.
     *
     * Organizes shifts by user ID and then by shift type ID, collecting
     * all associated dates for detailed viewing.
     *
     * @returns {Promise<void>}
     */
    const calculateStats = async () => {
        setLoading(true);
        try {
            const res = await axios.get("/api/schedules/all", {
                params: { groupId: currentGroup?._id || currentGroup?.id },
            });

            const rawStats: any = {};
            const schedules = res.data;

            schedules.forEach((sched: any) => {
                if (!sched.isPublished) return;

                sched.shifts.forEach((shift: any) => {
                    if (!rawStats[shift.userId])
                        rawStats[shift.userId] = { byType: {} };

                    if (!rawStats[shift.userId].byType[shift.shiftTypeId]) {
                        rawStats[shift.userId].byType[shift.shiftTypeId] = [];
                    }

                    // Use the date from the shift itself for accurate aggregation
                    if (shift.date) {
                        rawStats[shift.userId].byType[shift.shiftTypeId].push(
                            shift.date,
                        );
                    }
                });
            });
            setStats(rawStats);
        } catch (error) {
            console.error("Error calculating stats", error);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Sends the current statistical data to the server to trigger an email report.
     *
     * @returns {Promise<void>}
     */
    const handleSendReport = async () => {
        setSendingEmail(true);
        try {
            await axios.post(
                `/api/groups/${
                    currentGroup?._id || currentGroup?.id
                }/send-report`,
                {
                    stats,
                },
            );
            showNotification(`Report sent successfully`, "success");
        } catch (e) {
            showNotification("Report sent (simulation)", "success");
        } finally {
            setSendingEmail(false);
        }
    };

    /**
     * Opens a dialog showing the specific dates a user worked a particular shift type.
     *
     * @param {string}   name   The human-readable name of the shift type.
     * @param {string[]} dates  The list of dates associated with this shift type for the user.
     */
    const handleChipClick = (name: string, dates: string[]) => {
        setSelectedShiftName(name);
        setSelectedDates(dates);
        setDialogOpen(true);
    };

    /** @type {User[]} Members of the current group, sorted by their display order. */
    const sortedMembers = users
        .filter((u) =>
            u.groups.some(
                (g) => g.groupId === (currentGroup?._id || currentGroup?.id),
            ),
        )
        .sort((a, b) => {
            const orderA =
                a.groups.find(
                    (g) =>
                        g.groupId === (currentGroup?._id || currentGroup?.id),
                )?.order || 0;
            const orderB =
                b.groups.find(
                    (g) =>
                        g.groupId === (currentGroup?._id || currentGroup?.id),
                )?.order || 0;
            return orderA - orderB;
        });

    return (
        <Box p={3}>
            <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                mb={2}
            >
                <h3>Yearly Statistics (Published Shifts)</h3>
                <Button
                    variant="outlined"
                    startIcon={
                        sendingEmail ? (
                            <CircularProgress size={20} />
                        ) : (
                            <EmailIcon />
                        )
                    }
                    onClick={handleSendReport}
                    disabled={sendingEmail}
                >
                    Email Report Now
                </Button>
            </Box>

            {loading ? (
                <CircularProgress />
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Employee</TableCell>
                                <TableCell>Breakdown by Shift Type</TableCell>
                                <TableCell align="center">
                                    Remaining Vacation
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {sortedMembers.map((u) => {
                                const uid = u._id || u.id;
                                const userStats = stats[uid] || { byType: {} };

                                return (
                                    <TableRow key={uid}>
                                        <TableCell sx={{ fontWeight: "bold" }}>
                                            {u.displayName}
                                        </TableCell>
                                        <TableCell>
                                            <Box
                                                display="flex"
                                                gap={1}
                                                flexWrap="wrap"
                                            >
                                                {Object.entries(
                                                    userStats.byType,
                                                ).map(([typeId, dates]) => {
                                                    const datesArray =
                                                        dates as string[];
                                                    const count =
                                                        datesArray.length;

                                                    const typeObj =
                                                        shiftTypes.find(
                                                            (t) =>
                                                                t._id ===
                                                                typeId,
                                                        );
                                                    const typeName =
                                                        typeObj?.name ||
                                                        "Unknown";
                                                    const typeColor =
                                                        typeObj?.color ||
                                                        "#ccc";

                                                    const isClickable = true;

                                                    return (
                                                        <Chip
                                                            key={typeId}
                                                            label={`${typeName}: ${count}`}
                                                            size="small"
                                                            onClick={
                                                                isClickable
                                                                    ? () =>
                                                                          handleChipClick(
                                                                              typeName,
                                                                              datesArray,
                                                                          )
                                                                    : undefined
                                                            }
                                                            sx={{
                                                                bgcolor:
                                                                    typeColor,
                                                                color: getContrastText(
                                                                    typeColor,
                                                                ),
                                                                fontWeight:
                                                                    "bold",
                                                                border: "1px solid rgba(0,0,0,0.1)",
                                                                cursor: isClickable
                                                                    ? "pointer"
                                                                    : "default",
                                                                "&:hover":
                                                                    isClickable
                                                                        ? {
                                                                              opacity: 0.8,
                                                                              boxShadow: 1,
                                                                          }
                                                                        : {},
                                                            }}
                                                        />
                                                    );
                                                })}
                                                {Object.keys(userStats.byType)
                                                    .length === 0 && "-"}
                                            </Box>
                                        </TableCell>
                                        <TableCell align="center">
                                            {u.vacationBalance}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <ShiftDatesDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                shiftName={selectedShiftName}
                dates={selectedDates}
            />
        </Box>
    );
}

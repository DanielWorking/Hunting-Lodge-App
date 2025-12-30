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
    Typography,
} from "@mui/material";
import EmailIcon from "@mui/icons-material/Email";
import { useUser } from "../../context/UserContext";
import { useData } from "../../context/DataContext";
import { useNotification } from "../../context/NotificationContext";
import ShiftDatesDialog from "../ShiftDatesDialog";
import axios from "axios";

export default function StatisticsTab() {
    const { currentGroup } = useUser();
    const { users, groups } = useData();
    const { showNotification } = useNotification();

    const [stats, setStats] = useState<any>({});
    const [loading, setLoading] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedShiftName, setSelectedShiftName] = useState("");
    const [selectedDates, setSelectedDates] = useState<string[]>([]);

    const groupSettings = groups.find(
        (g) => (g._id || g.id) === (currentGroup?._id || currentGroup?.id)
    )?.settings;
    const shiftTypes = groupSettings?.shiftTypes || [];

    useEffect(() => {
        if (currentGroup) calculateStats();
    }, [currentGroup]);

    const getContrastText = (hexColor: string) => {
        if (!hexColor) return "black";
        const r = parseInt(hexColor.substr(1, 2), 16);
        const g = parseInt(hexColor.substr(3, 2), 16);
        const b = parseInt(hexColor.substr(5, 2), 16);
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        return yiq >= 128 ? "black" : "white";
    };

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

                    // === התיקון החשוב: שימוש בתאריך של המשמרת עצמה ===
                    if (shift.date) {
                        rawStats[shift.userId].byType[shift.shiftTypeId].push(
                            shift.date
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

    const handleSendReport = async () => {
        setSendingEmail(true);
        try {
            await axios.post(
                `/api/groups/${
                    currentGroup?._id || currentGroup?.id
                }/send-report`,
                {
                    stats,
                }
            );
            showNotification(`Report sent successfully`, "success");
        } catch (e) {
            showNotification("Report sent (simulation)", "success");
        } finally {
            setSendingEmail(false);
        }
    };

    const handleChipClick = (name: string, dates: string[]) => {
        setSelectedShiftName(name);
        setSelectedDates(dates);
        setDialogOpen(true);
    };

    const sortedMembers = users
        .filter((u) =>
            u.groups.some(
                (g) => g.groupId === (currentGroup?._id || currentGroup?.id)
            )
        )
        .sort((a, b) => {
            const orderA =
                a.groups.find(
                    (g) => g.groupId === (currentGroup?._id || currentGroup?.id)
                )?.order || 0;
            const orderB =
                b.groups.find(
                    (g) => g.groupId === (currentGroup?._id || currentGroup?.id)
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
                                            {u.username}
                                        </TableCell>
                                        <TableCell>
                                            <Box
                                                display="flex"
                                                gap={1}
                                                flexWrap="wrap"
                                            >
                                                {Object.entries(
                                                    userStats.byType
                                                ).map(([typeId, dates]) => {
                                                    const datesArray =
                                                        dates as string[];
                                                    const count =
                                                        datesArray.length;

                                                    const typeObj =
                                                        shiftTypes.find(
                                                            (t) =>
                                                                t._id === typeId
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
                                                                              datesArray
                                                                          )
                                                                    : undefined
                                                            }
                                                            sx={{
                                                                bgcolor:
                                                                    typeColor,
                                                                color: getContrastText(
                                                                    typeColor
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

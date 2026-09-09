/**
 * @module VacationModal
 * 
 * Provides a user-friendly, accessible modal dialog for booking vacation time
 * or tagging a shift with fractional duration: Full Day (1.0) vs Half Day (0.5).
 */

import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    RadioGroup,
    Radio,
    FormControlLabel,
    FormControl,
    FormLabel,
    Typography,
    Box,
    Alert,
} from "@mui/material";
import { format } from "date-fns";
import type { VacationValue } from "../types";

export interface VacationModalSubmitData {
    userId?: string;
    date: Date | string;
    vacationValue: VacationValue;
    notes?: string;
}

export interface VacationModalProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: VacationModalSubmitData) => Promise<void> | void;
    currentBalance?: number;
    initialDate?: Date;
    initialVacationValue?: VacationValue;
    title?: string;
    userId?: string;
}

export default function VacationModal({
    open,
    onClose,
    onSubmit,
    currentBalance = 18,
    initialDate = new Date(),
    initialVacationValue = 1.0,
    title = "Book Vacation",
    userId,
}: VacationModalProps) {
    const [vacationValue, setVacationValue] = useState<VacationValue>(initialVacationValue);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            setVacationValue(initialVacationValue);
            setSubmitting(false);
        }
    }, [open, initialVacationValue]);

    const projectedBalance = Number((currentBalance - vacationValue).toFixed(2));
    const isInsufficient = currentBalance < vacationValue;

    const handleValueChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = parseFloat(event.target.value);
        if (parsed === 0.5 || parsed === 1.0) {
            setVacationValue(parsed);
        }
    };

    const handleConfirm = async () => {
        if (isInsufficient) return;
        try {
            setSubmitting(true);
            await onSubmit({
                userId,
                date: initialDate,
                vacationValue,
            });
            onClose();
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            aria-labelledby="vacation-modal-title"
            maxWidth="xs"
            fullWidth
        >
            <DialogTitle id="vacation-modal-title" sx={{ fontWeight: "bold" }}>
                {title}
            </DialogTitle>
            <DialogContent dividers>
                <Box display="flex" flexDirection="column" gap={2} my={1}>
                    <Typography variant="body2" color="text.secondary">
                        Date: <strong>{format(initialDate, "dd/MM/yyyy")}</strong>
                    </Typography>

                    <FormControl component="fieldset">
                        <FormLabel id="vacation-duration-label" component="legend">
                            Vacation Duration
                        </FormLabel>
                        <RadioGroup
                            aria-labelledby="vacation-duration-label"
                            name="vacation-value-group"
                            value={vacationValue}
                            onChange={handleValueChange}
                        >
                            <FormControlLabel
                                value={1.0}
                                control={<Radio />}
                                label="Full Day (1.0 day)"
                            />
                            <FormControlLabel
                                value={0.5}
                                control={<Radio />}
                                label="Half Day (0.5 day)"
                            />
                        </RadioGroup>
                    </FormControl>

                    <Box bgcolor="action.hover" p={1.5} borderRadius={1}>
                        <Typography variant="body2">
                            Current balance: <strong>{currentBalance} days</strong>
                        </Typography>
                        <Typography
                            variant="body2"
                            data-testid="projected-balance"
                            color={projectedBalance < 0 ? "error.main" : "text.primary"}
                        >
                            Projected balance: <strong>{projectedBalance} days</strong>
                        </Typography>
                    </Box>

                    {isInsufficient && (
                        <Alert severity="error" sx={{ mt: 1 }}>
                            Insufficient vacation balance. You cannot book {vacationValue} day with {currentBalance} remaining.
                        </Alert>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={submitting}>
                    Cancel
                </Button>
                <Button
                    onClick={handleConfirm}
                    variant="contained"
                    color="primary"
                    disabled={isInsufficient || submitting}
                >
                    Confirm
                </Button>
            </DialogActions>
        </Dialog>
    );
}

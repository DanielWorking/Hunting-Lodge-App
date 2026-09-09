import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import VacationModal from "../components/VacationModal";

describe("VacationModal Component", () => {
    it("renders modal dialog with vacation duration radio options when open", () => {
        render(
            <VacationModal
                open={true}
                onClose={vi.fn()}
                onSubmit={vi.fn()}
                currentBalance={18}
                initialDate={new Date("2026-09-15")}
            />
        );

        expect(screen.getByRole("heading", { name: /Book Vacation/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/Full Day \(1\.0 day\)/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Half Day \(0\.5 day\)/i)).toBeInTheDocument();
    });

    it("defaults to Full Day (1.0 day) selection", () => {
        render(
            <VacationModal
                open={true}
                onClose={vi.fn()}
                onSubmit={vi.fn()}
                currentBalance={18}
            />
        );

        const fullDayRadio = screen.getByLabelText(/Full Day \(1\.0 day\)/i) as HTMLInputElement;
        const halfDayRadio = screen.getByLabelText(/Half Day \(0\.5 day\)/i) as HTMLInputElement;

        expect(fullDayRadio.checked).toBe(true);
        expect(halfDayRadio.checked).toBe(false);
    });

    it("updates projected remaining balance when switching between Full Day and Half Day", () => {
        render(
            <VacationModal
                open={true}
                onClose={vi.fn()}
                onSubmit={vi.fn()}
                currentBalance={10}
            />
        );

        // Initially with 1.0 day: 10 - 1.0 = 9
        expect(screen.getByTestId("projected-balance")).toHaveTextContent("Projected balance: 9 days");

        // Switch to Half Day (0.5 day)
        const halfDayRadio = screen.getByLabelText(/Half Day \(0\.5 day\)/i);
        fireEvent.click(halfDayRadio);

        // Projected balance: 10 - 0.5 = 9.5
        expect(screen.getByTestId("projected-balance")).toHaveTextContent("Projected balance: 9.5 days");
    });

    it("submits correct vacationValue 0.5 when Half Day is selected", () => {
        const handleSubmit = vi.fn();
        render(
            <VacationModal
                open={true}
                onClose={vi.fn()}
                onSubmit={handleSubmit}
                currentBalance={10}
                initialDate={new Date("2026-09-15")}
            />
        );

        const halfDayRadio = screen.getByLabelText(/Half Day \(0\.5 day\)/i);
        fireEvent.click(halfDayRadio);

        const submitBtn = screen.getByRole("button", { name: /Confirm/i });
        fireEvent.click(submitBtn);

        expect(handleSubmit).toHaveBeenCalledTimes(1);
        expect(handleSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                vacationValue: 0.5,
            })
        );
    });

    it("submits correct vacationValue 1.0 when Full Day is selected", () => {
        const handleSubmit = vi.fn();
        render(
            <VacationModal
                open={true}
                onClose={vi.fn()}
                onSubmit={handleSubmit}
                currentBalance={10}
                initialDate={new Date("2026-09-15")}
            />
        );

        const submitBtn = screen.getByRole("button", { name: /Confirm/i });
        fireEvent.click(submitBtn);

        expect(handleSubmit).toHaveBeenCalledTimes(1);
        expect(handleSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                vacationValue: 1.0,
            })
        );
    });

    it("disables submit button and shows warning when current balance is insufficient", () => {
        render(
            <VacationModal
                open={true}
                onClose={vi.fn()}
                onSubmit={vi.fn()}
                currentBalance={0.3} // Less than 0.5
            />
        );

        const submitBtn = screen.getByRole("button", { name: /Confirm/i });
        expect(submitBtn).toBeDisabled();
        expect(screen.getByText(/Insufficient vacation balance/i)).toBeInTheDocument();
    });

    it("calls onClose when Cancel button is clicked", () => {
        const handleClose = vi.fn();
        render(
            <VacationModal
                open={true}
                onClose={handleClose}
                onSubmit={vi.fn()}
                currentBalance={10}
            />
        );

        const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
        fireEvent.click(cancelBtn);
        expect(handleClose).toHaveBeenCalledTimes(1);
    });
});

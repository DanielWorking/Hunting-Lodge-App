import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import SiteDialog from "../components/SiteDialog";
import type { SiteCard } from "../types";

describe("SiteDialog closes only after a save succeeds", () => {
    const initialData = {
        _id: "site-1",
        title: "Portal Alpha",
        url: "https://portal.alpha",
        description: "Operational portal",
        tag: "General",
        groupId: "group-1",
        favoritedBy: [],
        createdAt: new Date().toISOString(),
    } as SiteCard;

    it("stays open while the save is pending and closes once it succeeds", async () => {
        let resolveSave!: (ok: boolean) => void;
        const onSave = vi.fn(
            () =>
                new Promise<boolean>((resolve) => {
                    resolveSave = resolve;
                }),
        );
        const onClose = vi.fn();

        render(
            <SiteDialog open onClose={onClose} onSave={onSave} initialData={initialData} />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();

        await act(async () => {
            resolveSave(true);
        });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("stays open when the save fails so the user keeps their edits", async () => {
        const onSave = vi.fn().mockResolvedValue(false);
        const onClose = vi.fn();

        render(
            <SiteDialog open onClose={onClose} onSave={onSave} initialData={initialData} />,
        );
        fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

        await act(async () => {});

        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
    });
});

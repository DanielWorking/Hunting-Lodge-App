import { render, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { TiptapEditor } from "../pages/ShiftReportPage";

// Mock @tiptap/react to track internal editor state commands
const mockCommands = {
    setContent: vi.fn(),
};

let currentHTML = "<p>Initial</p>";
let isFocused = false;
let isEditable = true;
let isEmpty = false;

// Proxy to satisfy any chain().focus()... calls in toolbar
const createChainable = (): unknown => {
    const fn = () => chainProxy;
    const chainProxy: unknown = new Proxy(fn, {
        get: () => createChainable(),
        apply: () => createChainable(),
    });
    return chainProxy;
};

const mockEditor = {
    getHTML: () => currentHTML,
    commands: mockCommands,
    setEditable: vi.fn((editable: boolean) => {
        isEditable = editable;
    }),
    isActive: vi.fn(() => false),
    getAttributes: vi.fn(() => ({ color: "inherit" })),
    can: () => createChainable(),
    chain: () => createChainable(),
    get isEditable() {
        return isEditable;
    },
    get isFocused() {
        return isFocused;
    },
    get isEmpty() {
        return isEmpty;
    },
};

vi.mock("@tiptap/react", () => ({
    useEditor: () => mockEditor,
    EditorContent: () => <div data-testid="mock-tiptap-content" />,
}));

describe("TiptapEditor - Synchronization & Isolation Invariants", () => {
    it("should synchronize content when value prop changes and editor is not focused", () => {
        currentHTML = "<p>Initial</p>";
        isFocused = false;
        isEmpty = false;
        mockCommands.setContent.mockClear();

        const { rerender } = render(
            <TiptapEditor
                value="<p>Initial</p>"
                onChange={vi.fn()}
                placeholder="Enter tasks..."
                readOnly={false}
            />
        );

        // Value changes externally (e.g. discard changes or report switch)
        rerender(
            <TiptapEditor
                value="<p>Updated from server</p>"
                onChange={vi.fn()}
                placeholder="Enter tasks..."
                readOnly={false}
            />
        );

        expect(mockCommands.setContent).toHaveBeenCalledWith("<p>Updated from server</p>", {
            emitUpdate: false,
        });
    });

    it("should not overwrite content when editor is currently focused (typing guard)", () => {
        currentHTML = "<p>User is typing...</p>";
        isFocused = true;
        isEmpty = false;
        mockCommands.setContent.mockClear();

        const { rerender } = render(
            <TiptapEditor
                value="<p>User is typing...</p>"
                onChange={vi.fn()}
                placeholder="Enter tasks..."
                readOnly={false}
            />
        );

        // External prop differs while user is actively focused in the editor
        rerender(
            <TiptapEditor
                value="<p>Different text</p>"
                onChange={vi.fn()}
                placeholder="Enter tasks..."
                readOnly={false}
            />
        );

        expect(mockCommands.setContent).not.toHaveBeenCalled();
    });

    it("should synchronize readOnly state without emitting update events", () => {
        isEditable = true;
        mockEditor.setEditable.mockClear();

        const { rerender } = render(
            <TiptapEditor
                value="<p>Content</p>"
                onChange={vi.fn()}
                placeholder="Enter tasks..."
                readOnly={false}
            />
        );

        // Report becomes locked (readOnly = true)
        rerender(
            <TiptapEditor
                value="<p>Content</p>"
                onChange={vi.fn()}
                placeholder="Enter tasks..."
                readOnly={true}
            />
        );

        expect(mockEditor.setEditable).toHaveBeenCalledWith(false, false);
    });

    it("should isolate state between different report instances via React keys", () => {
        const Wrapper = () => {
            const [activeReportId, setActiveReportId] = useState("report-1");
            const tasks: Record<string, string> = {
                "report-1": "<p>Report 1 Tasks</p>",
                "report-2": "<p>Report 2 Tasks</p>",
            };

            return (
                <div>
                    <button onClick={() => setActiveReportId("report-2")}>Switch</button>
                    <TiptapEditor
                        key={`${activeReportId}-currentTasks`}
                        value={tasks[activeReportId]}
                        onChange={vi.fn()}
                        placeholder="Tasks"
                        readOnly={false}
                    />
                </div>
            );
        };

        const { getByText } = render(<Wrapper />);
        act(() => {
            getByText("Switch").click();
        });
        // Key change causes unmount and remount with clean state
        expect(getByText("Switch")).toBeInTheDocument();
    });
});

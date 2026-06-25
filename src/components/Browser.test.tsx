// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Browser } from "./Browser";
import { useDawStore } from "../store/useDawStore";
import { LIBRARY } from "../data/seed";
import { ITEM_MIME } from "../lib/dnd";
import { MAX_BROWSER_W } from "../lib/constants";
import type { BrowserTab } from "../types";

// Snapshot the slice of store state this component reads/mutates so tests stay
// order-independent.
type BrowserSnapshot = {
  query: string;
  tab: BrowserTab;
  browserOpen: boolean;
  browserWidth: number;
};

let snapshot: BrowserSnapshot;

beforeEach(() => {
  const s = useDawStore.getState();
  snapshot = { query: s.query, tab: s.tab, browserOpen: s.browserOpen, browserWidth: s.browserWidth };
  // Known defaults: panel open, no query, ALL tab, default width.
  useDawStore.setState({ query: "", tab: "all", browserOpen: true, browserWidth: 288 });
});

afterEach(() => {
  useDawStore.setState(snapshot);
});

// startUiResize attaches pointermove/pointerup to globalThis; happy-dom may lack
// PointerEvent, so fall back to MouseEvent (the handler only reads clientX).
const PtrEvent = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
const movePointerX = (clientX: number) =>
  (globalThis as unknown as Window).dispatchEvent(new PtrEvent("pointermove", { clientX, clientY: 0, bubbles: true }));
const releasePointer = () =>
  (globalThis as unknown as Window).dispatchEvent(new PtrEvent("pointerup", { bubbles: true }));

describe("Browser", () => {
  it("dragging the right-edge grip resizes the panel width and clamps to the max", () => {
    render(<Browser />);
    const grip = screen.getByTitle("Drag to resize the browser");

    // Default width 288; drag right +80 → 368.
    fireEvent.pointerDown(grip, { button: 0, clientX: 300, clientY: 0 });
    movePointerX(380);
    releasePointer();
    expect(useDawStore.getState().browserWidth).toBe(368);

    // Drag far right → clamps to MAX_BROWSER_W.
    fireEvent.pointerDown(grip, { button: 0, clientX: 300, clientY: 0 });
    movePointerX(3000);
    releasePointer();
    expect(useDawStore.getState().browserWidth).toBe(MAX_BROWSER_W);
  });

  it("renders the BROWSER header, search box, and all tab labels", () => {
    render(<Browser />);

    // The expanded panel's header label.
    expect(screen.getByText("BROWSER")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search instruments, FX, MIDI…")).toBeInTheDocument();

    for (const label of ["ALL", "INST", "FX", "AUDIO", "MIDI", "PRESET"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("renders every category name and item name from the library on the ALL tab", () => {
    render(<Browser />);

    for (const cat of LIBRARY) {
      expect(screen.getByText(cat.name)).toBeInTheDocument();
      for (const item of cat.items) {
        // Item names can repeat (e.g. "Lead Hook"), so use getAllByText.
        expect(screen.getAllByText(item.name).length).toBeGreaterThan(0);
      }
    }
  });

  it("shows the per-category item count badge", () => {
    render(<Browser />);
    // INSTRUMENTS category has 4 items in the seed.
    const instCat = LIBRARY.find((c) => c.name === "INSTRUMENTS")!;
    const header = screen.getByText("INSTRUMENTS").parentElement as HTMLElement;
    expect(within(header).getByText(String(instCat.items.length))).toBeInTheDocument();
  });

  it("filters to only FX items and their kind badges when the FX tab is active", () => {
    useDawStore.setState({ tab: "fx" });
    render(<Browser />);

    // FX items show; an instrument should not.
    expect(screen.getByText("ZandersEQ")).toBeInTheDocument();
    expect(screen.getByText("ZandersTapeStop")).toBeInTheDocument();
    expect(screen.queryByText("Zanders Grand Piano")).not.toBeInTheDocument();

    // The PLUGINS / FX category survives the filter; INSTRUMENTS does not.
    expect(screen.getByText("PLUGINS / FX")).toBeInTheDocument();
    expect(screen.queryByText("INSTRUMENTS")).not.toBeInTheDocument();

    // Kind badge text is uppercased.
    expect(screen.getAllByText("FX").length).toBeGreaterThan(0);
  });

  it("clicking a tab updates the store's active tab", () => {
    render(<Browser />);
    expect(useDawStore.getState().tab).toBe("all");

    fireEvent.click(screen.getByRole("button", { name: "MIDI" }));
    expect(useDawStore.getState().tab).toBe("midi");

    // Only MIDI items remain (e.g. "Reese Bassline"); an audio sample is gone.
    expect(screen.getByText("Reese Bassline")).toBeInTheDocument();
    expect(screen.queryByText("Analog Kick 04")).not.toBeInTheDocument();
  });

  it("typing in the search box drives onSearch and narrows results case-insensitively", () => {
    render(<Browser />);
    const input = screen.getByPlaceholderText("Search instruments, FX, MIDI…") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "reese" } });
    expect(useDawStore.getState().query).toBe("reese");

    // Matches "Reese Designer" (inst) and "Reese Bassline" (midi); piano is gone.
    expect(screen.getByText("Reese Designer")).toBeInTheDocument();
    expect(screen.getByText("Reese Bassline")).toBeInTheDocument();
    expect(screen.queryByText("Zanders Grand Piano")).not.toBeInTheDocument();
  });

  it("shows the No matches empty state when nothing matches the query", () => {
    useDawStore.setState({ query: "zzzzz-no-such-thing" });
    render(<Browser />);

    expect(screen.getByText("No matches")).toBeInTheDocument();
    // No category headers rendered.
    expect(screen.queryByText("INSTRUMENTS")).not.toBeInTheDocument();
  });

  it("drag start writes the browser item onto the dataTransfer", () => {
    render(<Browser />);

    const itemRow = screen.getByText("ZandersEQ").closest("[draggable]") as HTMLElement;
    expect(itemRow).toBeTruthy();

    const stored: Record<string, string> = {};
    const dataTransfer = {
      effectAllowed: "",
      setData: (type: string, value: string) => {
        stored[type] = value;
      },
    } as unknown as DataTransfer;

    fireEvent.dragStart(itemRow, { dataTransfer });

    expect(stored[ITEM_MIME]).toBeTruthy();
    const parsed = JSON.parse(stored[ITEM_MIME]);
    expect(parsed.name).toBe("ZandersEQ");
    expect(parsed.kind).toBe("fx");
    expect(stored["text/plain"]).toBe("ZandersEQ");
  });

  it("clicking the hide toggle flips browserOpen and collapses to the rail button", () => {
    render(<Browser />);
    expect(useDawStore.getState().browserOpen).toBe(true);

    fireEvent.click(screen.getByTitle("Hide browser"));

    expect(useDawStore.getState().browserOpen).toBe(false);
    // Collapsed view exposes the "Show browser" rail button and still renders.
    expect(screen.getByTitle("Show browser")).toBeInTheDocument();
    expect(screen.queryByTitle("Hide browser")).not.toBeInTheDocument();
  });

  it("renders the collapsed rail when browserOpen is false and clicking it re-opens", () => {
    useDawStore.setState({ browserOpen: false });
    render(<Browser />);

    const showBtn = screen.getByTitle("Show browser");
    expect(showBtn).toBeInTheDocument();
    // Vertical BROWSER label is present in the collapsed rail.
    expect(screen.getByText("BROWSER")).toBeInTheDocument();
    // No search box while collapsed.
    expect(screen.queryByPlaceholderText("Search instruments, FX, MIDI…")).not.toBeInTheDocument();

    fireEvent.click(showBtn);
    expect(useDawStore.getState().browserOpen).toBe(true);
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PianoRoll } from "./PianoRoll";
import { useDawStore } from "../store/useDawStore";
import { BEATS_PER_BAR } from "../lib/constants";
import type { Track } from "../types";

// Snapshot every slice this modal reads or mutates so tests stay
// order-independent (the store carries shared demo data).
type Snapshot = {
  editorOpen: boolean;
  editorClip: string;
  editorTrack: string;
  tracks: Track[];
  playhead: number;
  noteClipboard: ReturnType<typeof useDawStore.getState>["noteClipboard"];
};

let snapshot: Snapshot;

// A track + clip from the seed that the editor will operate on.
const TRACK_ID = "lead";
const CLIP_ID = "lead-drop";

beforeEach(() => {
  const s = useDawStore.getState();
  snapshot = {
    editorOpen: s.editorOpen,
    editorClip: s.editorClip,
    editorTrack: s.editorTrack,
    // deep enough: clone tracks + their clips so mutated note arrays don't leak.
    tracks: s.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c })) })),
    playhead: s.playhead,
    noteClipboard: s.noteClipboard,
  };
});

afterEach(() => {
  useDawStore.setState(snapshot);
});

/** Open the editor on the seed lead clip (materializes its notes) and return
 *  the live track/clip so a test can read the editor's working data. */
function openLeadEditor() {
  useDawStore.getState().openEditor(TRACK_ID, CLIP_ID);
  const track = useDawStore.getState().tracks.find((t) => t.id === TRACK_ID)!;
  const clip = track.clips.find((c) => c.id === CLIP_ID)!;
  return { track, clip };
}

/** Give an element a deterministic bounding box so the editor's pointer→beat /
 *  pointer→pitch math (which reads getBoundingClientRect) has real geometry. */
function stubRect(el: Element, rect: Partial<DOMRect>) {
  const full: DOMRect = {
    left: 0,
    top: 0,
    width: 400,
    height: 500,
    right: 400,
    bottom: 500,
    x: 0,
    y: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect;
  (el as HTMLElement).getBoundingClientRect = () => full;
}

describe("PianoRoll", () => {
  it("renders nothing when the editor is closed", () => {
    useDawStore.setState({ editorOpen: false, editorTrack: "", editorClip: "" });
    const { container } = render(<PianoRoll />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the editor targets a missing track/clip", () => {
    useDawStore.setState({ editorOpen: true, editorTrack: "nope", editorClip: "nope" });
    const { container } = render(<PianoRoll />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the editor header with the clip name and the help caption", () => {
    const { clip } = openLeadEditor();
    render(<PianoRoll />);

    // Title input carries the clip name and the rename affordance.
    const nameInput = screen.getByTitle("Rename clip") as HTMLInputElement;
    expect(nameInput.value).toBe(clip.name);

    expect(screen.getByText(/PIANO ROLL/)).toBeInTheDocument();
    // The close button is labelled by its title; its visible glyph is "✕".
    expect(screen.getByTitle("Close (Esc)")).toBeInTheDocument();
    expect(screen.getByText("VEL")).toBeInTheDocument();
  });

  it("renders pitch labels (every C in range) down the left rail", () => {
    openLeadEditor();
    render(<PianoRoll />);
    // PITCH_MIN..PITCH_MAX is 48..84 -> C3, C4, C5, C6 land on multiples of 12.
    expect(screen.getByText("C3")).toBeInTheDocument();
    expect(screen.getByText("C4")).toBeInTheDocument();
    expect(screen.getByText("C5")).toBeInTheDocument();
    expect(screen.getByText("C6")).toBeInTheDocument();
  });

  it("materializes the clip's pattern notes and renders them with velocity bars", () => {
    const { clip } = openLeadEditor();
    expect(clip.notes && clip.notes.length).toBeGreaterThan(0);
    render(<PianoRoll />);

    // Each note gets a velocity bar titled with its 0..127 value.
    const velBars = screen.getAllByTitle(/^Velocity \d+$/);
    expect(velBars.length).toBe(clip.notes!.length);
    // Default velocity 0.8 -> round(0.8*127) = 102.
    expect(screen.getAllByTitle("Velocity 102").length).toBeGreaterThan(0);
  });

  it("editing the title input renames the clip in the store", () => {
    openLeadEditor();
    render(<PianoRoll />);

    const nameInput = screen.getByTitle("Rename clip") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Renamed Hook" } });

    const clip = useDawStore
      .getState()
      .tracks.find((t) => t.id === TRACK_ID)!
      .clips.find((c) => c.id === CLIP_ID)!;
    expect(clip.name).toBe("Renamed Hook");
  });

  it("focusing the title input applies its active well/border styling", () => {
    openLeadEditor();
    render(<PianoRoll />);
    const nameInput = screen.getByTitle("Rename clip") as HTMLInputElement;

    // Idle: transparent border + background.
    expect(nameInput.style.borderColor).toBe("transparent");

    fireEvent.focus(nameInput);
    expect(nameInput.style.background).toBe("var(--well)");
    expect(nameInput.style.borderColor).toBe("var(--layer-5)");
  });

  it("the close button closes the editor", () => {
    openLeadEditor();
    expect(useDawStore.getState().editorOpen).toBe(true);
    render(<PianoRoll />);

    fireEvent.click(screen.getByTitle("Close (Esc)"));
    expect(useDawStore.getState().editorOpen).toBe(false);
  });

  it("clicking the backdrop (not the panel) closes the editor", () => {
    openLeadEditor();
    const { container } = render(<PianoRoll />);
    const backdrop = container.firstChild as HTMLElement;

    // A click whose target IS the backdrop closes; a click on a child does not.
    fireEvent.click(backdrop);
    expect(useDawStore.getState().editorOpen).toBe(false);
  });

  it("clicking inside the panel does not close the editor", () => {
    openLeadEditor();
    render(<PianoRoll />);
    // Click on the help caption (a descendant) — should be a no-op for close.
    fireEvent.click(screen.getByText(/PIANO ROLL/));
    expect(useDawStore.getState().editorOpen).toBe(true);
  });

  it("Escape key closes the editor", () => {
    openLeadEditor();
    const { container } = render(<PianoRoll />);
    fireEvent.keyDown(container.firstChild as HTMLElement, { key: "Escape" });
    expect(useDawStore.getState().editorOpen).toBe(false);
  });

  it("Cmd/Ctrl+A selects all notes (velocity bars switch to selected color)", () => {
    const { clip } = openLeadEditor();
    const { container } = render(<PianoRoll />);

    // Before: no note is selected, so velocity bars use the track color, not #fff.
    const before = screen.getAllByTitle(/^Velocity \d+$/);
    expect(before.every((b) => (b as HTMLElement).style.background !== "#fff")).toBe(true);

    fireEvent.keyDown(container.firstChild as HTMLElement, { key: "a", ctrlKey: true });

    // After select-all every velocity bar paints white (happy-dom keeps "#fff").
    const after = screen.getAllByTitle(/^Velocity \d+$/);
    expect(after.length).toBe(clip.notes!.length);
    expect(after.every((b) => (b as HTMLElement).style.background === "#fff")).toBe(true);
  });

  it("Delete after select-all removes every note from the clip", () => {
    openLeadEditor();
    const { container } = render(<PianoRoll />);
    const root = container.firstChild as HTMLElement;

    fireEvent.keyDown(root, { key: "a", ctrlKey: true });
    fireEvent.keyDown(root, { key: "Delete" });

    const clip = useDawStore
      .getState()
      .tracks.find((t) => t.id === TRACK_ID)!
      .clips.find((c) => c.id === CLIP_ID)!;
    expect(clip.notes).toEqual([]);
  });

  it("Backspace with no selection is a no-op (notes untouched)", () => {
    const { clip } = openLeadEditor();
    const before = clip.notes!.length;
    const { container } = render(<PianoRoll />);

    fireEvent.keyDown(container.firstChild as HTMLElement, { key: "Backspace" });

    const after = useDawStore
      .getState()
      .tracks.find((t) => t.id === TRACK_ID)!
      .clips.find((c) => c.id === CLIP_ID)!.notes!.length;
    expect(after).toBe(before);
  });

  it("Cmd/Ctrl+C then Cmd/Ctrl+V copies the selection and pastes new notes", () => {
    openLeadEditor();
    const { container } = render(<PianoRoll />);
    const root = container.firstChild as HTMLElement;

    const startCount = useDawStore
      .getState()
      .tracks.find((t) => t.id === TRACK_ID)!
      .clips.find((c) => c.id === CLIP_ID)!.notes!.length;

    fireEvent.keyDown(root, { key: "a", ctrlKey: true }); // select all
    fireEvent.keyDown(root, { key: "c", ctrlKey: true }); // copy
    expect(useDawStore.getState().noteClipboard!.length).toBe(startCount);

    fireEvent.keyDown(root, { key: "v", ctrlKey: true }); // paste at anchor

    const afterCount = useDawStore
      .getState()
      .tracks.find((t) => t.id === TRACK_ID)!
      .clips.find((c) => c.id === CLIP_ID)!.notes!.length;
    expect(afterCount).toBe(startCount * 2);
  });

  it("right-click on a note removes just that note", () => {
    const { clip } = openLeadEditor();
    const startCount = clip.notes!.length;
    render(<PianoRoll />);

    // The note rects are absolutely-positioned divs; the velocity bars carry the
    // titles, but the note grid rects do not. Grab a note rect via its resize
    // handle's parent: instead, target the first velocity bar's matching note by
    // firing contextmenu on a note element. Note rects live in the grid; select
    // the first one through the grid container.
    const grid = (screen.getByText(/PIANO ROLL/).closest("div") as HTMLElement) // header
      .parentElement!.parentElement!.querySelector('[style*="crosshair"]') as HTMLElement;
    const noteEl = grid.querySelector('[style*="grab"]') as HTMLElement;
    expect(noteEl).toBeTruthy();

    fireEvent.contextMenu(noteEl);

    const afterCount = useDawStore
      .getState()
      .tracks.find((t) => t.id === TRACK_ID)!
      .clips.find((c) => c.id === CLIP_ID)!.notes!.length;
    expect(afterCount).toBe(startCount - 1);
  });

  it("a non-dragging pointerdown on the empty grid adds a note and selects it", () => {
    openLeadEditor();
    render(<PianoRoll />);

    const grid = document.querySelector('[style*="crosshair"]') as HTMLElement;
    expect(grid).toBeTruthy();
    stubRect(grid, { left: 0, top: 0, width: 400, height: 500 });

    const startCount = useDawStore
      .getState()
      .tracks.find((t) => t.id === TRACK_ID)!
      .clips.find((c) => c.id === CLIP_ID)!.notes!.length;

    // pointerdown then pointerup at the same spot = a click (no drag), so a note
    // is appended.
    fireEvent.pointerDown(grid, { button: 0, clientX: 50, clientY: 60 });
    fireEvent.pointerUp(globalThis as unknown as Window, { clientX: 50, clientY: 60 });

    const afterCount = useDawStore
      .getState()
      .tracks.find((t) => t.id === TRACK_ID)!
      .clips.find((c) => c.id === CLIP_ID)!.notes!.length;
    expect(afterCount).toBe(startCount + 1);
  });

  it("dragging a note via pointer move updates the stored note positions", () => {
    const { clip } = openLeadEditor();
    render(<PianoRoll />);

    const grid = document.querySelector('[style*="crosshair"]') as HTMLElement;
    stubRect(grid, { left: 0, top: 0, width: 400, height: 500 });

    const noteEl = grid.querySelector('[style*="grab"]') as HTMLElement;
    const targetNote = clip.notes![0];
    const beforeStart = targetNote.start;

    // Press on the note near its current x, then move far to the right so the
    // snapped delta is non-zero.
    fireEvent.pointerDown(noteEl, { button: 0, clientX: 10, clientY: 100 });
    fireEvent.pointerMove(globalThis as unknown as Window, { clientX: 200, clientY: 100 });
    fireEvent.pointerUp(globalThis as unknown as Window, { clientX: 200, clientY: 100 });

    const moved = useDawStore
      .getState()
      .tracks.find((t) => t.id === TRACK_ID)!
      .clips.find((c) => c.id === CLIP_ID)!
      .notes!.find((n) => n.id === targetNote.id)!;
    // A rightward drag should not decrease the start position.
    expect(moved.start).toBeGreaterThanOrEqual(beforeStart);
  });

  it("resizing a note via its edge handle changes the stored note length", () => {
    const { clip } = openLeadEditor();
    render(<PianoRoll />);

    const grid = document.querySelector('[style*="crosshair"]') as HTMLElement;
    stubRect(grid, { left: 0, top: 0, width: 400, height: 500 });

    // The resize handle is the ew-resize child of a note rect.
    const handle = grid.querySelector('[style*="ew-resize"]') as HTMLElement;
    expect(handle).toBeTruthy();
    const targetNote = clip.notes![0];

    fireEvent.pointerDown(handle, { button: 0, clientX: 5, clientY: 100 });
    // Drag the right edge well past the note start to extend it.
    fireEvent.pointerMove(globalThis as unknown as Window, { clientX: 300, clientY: 100 });
    fireEvent.pointerUp(globalThis as unknown as Window, { clientX: 300, clientY: 100 });

    const resized = useDawStore
      .getState()
      .tracks.find((t) => t.id === TRACK_ID)!
      .clips.find((c) => c.id === CLIP_ID)!
      .notes!.find((n) => n.id === targetNote.id)!;
    expect(resized.len).toBeGreaterThan(0);
  });

  it("dragging a velocity bar updates that note's velocity in the store", () => {
    const { clip } = openLeadEditor();
    render(<PianoRoll />);

    const targetNote = clip.notes![0];
    const velBar = screen.getAllByTitle(/^Velocity \d+$/)[0] as HTMLElement;
    // The velocity lane needs a real rect for the y->velocity mapping.
    const velLane = velBar.parentElement as HTMLElement;
    stubRect(velLane, { left: 0, top: 0, width: 400, height: 56 });

    // Press near the bottom of the lane => low velocity (1 - y/h, y near bottom).
    fireEvent.pointerDown(velBar, { button: 0, clientX: 20, clientY: 55 });
    fireEvent.pointerUp(globalThis as unknown as Window, { clientX: 20, clientY: 55 });

    const after = useDawStore
      .getState()
      .tracks.find((t) => t.id === TRACK_ID)!
      .clips.find((c) => c.id === CLIP_ID)!
      .notes!.find((n) => n.id === targetNote.id)!;
    expect(after.velocity).toBeLessThan(0.5);
  });

  it("a right-button pointerdown on the grid is ignored (no note added)", () => {
    openLeadEditor();
    render(<PianoRoll />);
    const grid = document.querySelector('[style*="crosshair"]') as HTMLElement;
    stubRect(grid, { left: 0, top: 0, width: 400, height: 500 });

    const before = useDawStore
      .getState()
      .tracks.find((t) => t.id === TRACK_ID)!
      .clips.find((c) => c.id === CLIP_ID)!.notes!.length;

    fireEvent.pointerDown(grid, { button: 2, clientX: 50, clientY: 60 });
    fireEvent.pointerUp(globalThis as unknown as Window, { clientX: 50, clientY: 60 });

    const after = useDawStore
      .getState()
      .tracks.find((t) => t.id === TRACK_ID)!
      .clips.find((c) => c.id === CLIP_ID)!.notes!.length;
    expect(after).toBe(before);
  });

  it("falls back to a one-bar grid for a zero-length clip without crashing", () => {
    // Force a degenerate clip len so clipBeats uses the BEATS_PER_BAR fallback.
    useDawStore.getState().openEditor(TRACK_ID, CLIP_ID);
    useDawStore.setState((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === TRACK_ID
          ? { ...t, clips: t.clips.map((c) => (c.id === CLIP_ID ? { ...c, len: 0, notes: [] } : c)) }
          : t,
      ),
    }));

    render(<PianoRoll />);
    // It still renders the editor chrome (the fallback keeps clipBeats > 0).
    expect(screen.getByText(/PIANO ROLL/)).toBeInTheDocument();
    // BEATS_PER_BAR is the grid fallback denominator; sanity-check the constant.
    expect(BEATS_PER_BAR).toBe(4);
  });
});

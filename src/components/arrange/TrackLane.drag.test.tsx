// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TrackLane } from "./TrackLane";
import { useDawStore } from "../../store/useDawStore";
import type { Track } from "../../types";

// These cases exercise the pointer-drag MOVE / RESIZE geometry in TrackLane.
// startDrag (lib/timeline) attaches pointermove/pointerup listeners to globalThis,
// and barsAt() reads the lane's getBoundingClientRect. We stub that rect to a
// fixed 1000px-wide, left:0 frame so the math is fully deterministic:
//   barsAt(clientX) = (clientX / 1000) * TOTAL_BARS(=32) = clientX * 0.032
// i.e. clientX 500 -> bar 16, 750 -> bar 24, 625 -> bar 20.

// Snapshot just the slices these drags can mutate so order doesn't matter.
type DragSnapshot = {
  tracks: Track[];
  selClip: string;
  selClips: string[];
};
let snapshot: DragSnapshot;

const cloneTracks = (tracks: Track[]): Track[] =>
  tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c })) }));

beforeEach(() => {
  const s = useDawStore.getState();
  snapshot = {
    tracks: cloneTracks(s.tracks),
    selClip: s.selClip,
    selClips: [...s.selClips],
  };
  // Start from a clean single-selection state for predictable (non-multi) drags.
  useDawStore.setState({ selClip: "", selClips: [] });
});

afterEach(() => {
  useDawStore.setState({
    tracks: cloneTracks(snapshot.tracks),
    selClip: snapshot.selClip,
    selClips: [...snapshot.selClips],
  });
});

const trackById = (id: string): Track =>
  useDawStore.getState().tracks.find((t) => t.id === id) as Track;

const clipById = (trackId: string, clipId: string) =>
  trackById(trackId).clips.find((c) => c.id === clipId);

/** A fixed lane rect so barsAt() maps clientX deterministically. */
const FIXED_RECT = {
  left: 0,
  top: 0,
  right: 1000,
  bottom: 108,
  width: 1000,
  height: 108,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

/** Stub getBoundingClientRect on the lane element (and any element passed). */
const stubRect = (el: HTMLElement) => {
  el.getBoundingClientRect = () => FIXED_RECT;
};

/** Render a lane and pin every element's rect to FIXED_RECT (lane + clips). */
function renderLane(trackId: string) {
  const track = trackById(trackId);
  const utils = render(<TrackLane track={track} />);
  const lane = utils.container.querySelector(`[data-track-id="${trackId}"]`) as HTMLElement;
  stubRect(lane);
  // The lane geometry is what barsAt reads (laneRef), but stub clip rects too so
  // any rect read is consistent.
  utils.container.querySelectorAll<HTMLElement>("[data-clip-id]").forEach(stubRect);
  return { ...utils, lane };
}

// happy-dom may not implement PointerEvent; fall back to MouseEvent (the drag
// handlers only read clientX/clientY/altKey off the event).
const PtrEvent = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;

/** Dispatch a pointermove on globalThis with a given clientX (drag in progress). */
const movePointer = (clientX: number, opts: { altKey?: boolean } = {}) => {
  const win = globalThis as unknown as Window;
  win.dispatchEvent(new PtrEvent("pointermove", { clientX, clientY: 10, bubbles: true, ...opts }));
};
const releasePointer = () => {
  const win = globalThis as unknown as Window;
  win.dispatchEvent(new PtrEvent("pointerup", { bubbles: true }));
};

const clipEl = (container: HTMLElement, clipId: string): HTMLElement =>
  container.querySelector(`[data-clip-id="${clipId}"]`) as HTMLElement;

const resizeHandles = (clip: HTMLElement): HTMLElement[] =>
  // The two edge handles are the clip's first two child <div>s (left, then right).
  Array.from(clip.children).filter((c) => c instanceof HTMLDivElement) as HTMLElement[];

describe("TrackLane pointer-drag geometry", () => {
  it("body drag moves the clip's start bar by the snapped pointer delta", () => {
    // reese-d starts at bar 16, len 8.
    const { container } = renderLane("reese");
    const clip = clipEl(container, "reese-d");

    // pointerDown at clientX 500 -> barsAt = 16 == clip.bar, so grabOffset = 0.
    fireEvent.pointerDown(clip, { button: 0, clientX: 500, clientY: 10 });
    // Drag to clientX 750 -> barsAt = 24, snapped delta keeps bar = 24.
    movePointer(750);
    releasePointer();

    expect(clipById("reese", "reese-d")!.bar).toBe(24);
  });

  it("a sub-3px jitter is treated as a click, not a move (clip stays put)", () => {
    const { container } = renderLane("reese");
    const clip = clipEl(container, "reese-d");

    fireEvent.pointerDown(clip, { button: 0, clientX: 500, clientY: 10 });
    // Only 2px of travel -> below the drag threshold, position unchanged.
    movePointer(502);
    releasePointer();

    expect(clipById("reese", "reese-d")!.bar).toBe(16);
  });

  it("a non-primary (button !== 0) pointer-down does not start a drag", () => {
    const { container } = renderLane("reese");
    const clip = clipEl(container, "reese-d");

    // Right/middle button: startMove returns before wiring listeners.
    fireEvent.pointerDown(clip, { button: 2, clientX: 500, clientY: 10 });
    movePointer(900);
    releasePointer();

    expect(clipById("reese", "reese-d")!.bar).toBe(16);
  });

  it("right-resize handle changes the clip length to the snapped pointer position", () => {
    // reese-d: bar 16, len 8. resizeClip(len = barsAt(x) - bar).
    const { container } = renderLane("reese");
    const clip = clipEl(container, "reese-d");
    const [, right] = resizeHandles(clip);

    fireEvent.pointerDown(right, { button: 0, clientX: 700, clientY: 10 });
    // clientX 625 -> barsAt 20 -> len = snap(20 - 16) = 4.
    movePointer(625);
    releasePointer();

    const c = clipById("reese", "reese-d")!;
    expect(c.len).toBe(4);
    expect(c.bar).toBe(16); // right-resize never moves the start
  });

  it("left-resize handle moves the start bar while keeping the right edge fixed", () => {
    // reese-d: bar 16, len 8 -> right edge at bar 24.
    const { container } = renderLane("reese");
    const clip = clipEl(container, "reese-d");
    const [left] = resizeHandles(clip);

    fireEvent.pointerDown(left, { button: 0, clientX: 500, clientY: 10 });
    // clientX 625 -> barsAt 20 -> newBar 20, len = 24 - 20 = 4.
    movePointer(625);
    releasePointer();

    const c = clipById("reese", "reese-d")!;
    expect(c.bar).toBe(20);
    expect(c.len).toBe(4);
    expect(c.bar + c.len).toBe(24); // right edge preserved
  });

  it("Alt during a body drag uses the fine quarter-bar grid", () => {
    const { container } = renderLane("reese");
    const clip = clipEl(container, "reese-d");

    fireEvent.pointerDown(clip, { button: 0, clientX: 500, clientY: 10 });
    // clientX 508 -> barsAt = 16.256; fine snap (0.25) rounds to 16.25.
    movePointer(508, { altKey: true });
    releasePointer();

    expect(clipById("reese", "reese-d")!.bar).toBeCloseTo(16.25, 5);
  });

  it("a multi-clip selection drags every selected clip by the same bar delta", () => {
    // Select both reese clips (bar 16 and bar 24); dragging the group shifts both.
    useDawStore.setState({ selClip: "reese-d", selClips: ["reese-d", "reese-d2"] });
    const { container } = renderLane("reese");
    const clip = clipEl(container, "reese-d");

    // grabbed clip reese-d is at bar 16 -> pointerDown clientX 500.
    fireEvent.pointerDown(clip, { button: 0, clientX: 500, clientY: 10 });
    // Drag +250px -> +8 bars: reese-d 16->24, reese-d2 24->? (clamped at 32-8=24).
    movePointer(750);
    releasePointer();

    // delta = snap(barsAt(750) - 16) = snap(24 - 16) = 8.
    expect(clipById("reese", "reese-d")!.bar).toBe(24);
    // reese-d2 was at 24; +8 = 32 but clamps to TOTAL_BARS - len = 32 - 8 = 24.
    expect(clipById("reese", "reese-d2")!.bar).toBe(24);
  });

  it("shift+pointer-down toggles selection and does not start a drag", () => {
    const { container } = renderLane("reese");
    const clip = clipEl(container, "reese-d");

    fireEvent.pointerDown(clip, { button: 0, shiftKey: true, clientX: 500, clientY: 10 });
    // No drag wired: a subsequent global move must not change geometry.
    movePointer(900);
    releasePointer();

    expect(useDawStore.getState().selClips).toContain("reese-d");
    expect(clipById("reese", "reese-d")!.bar).toBe(16);
  });
});

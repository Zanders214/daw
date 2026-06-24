import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDawStore } from "../store/useDawStore";
import { serializeSession } from "./session";
import {
  startHistory,
  undo,
  redo,
  canUndo,
  canRedo,
  clearHistory,
  beginTransaction,
  endTransaction,
  COMMIT_DEBOUNCE_MS,
} from "./history";

const pristine = { ...useDawStore.getState() };
const get = () => useDawStore.getState();
const doc = () => JSON.stringify(serializeSession(get()));

let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  useDawStore.setState(pristine, true);
  stop = startHistory(); // seeds the baseline from the (reset) state
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe("history — snapshot undo/redo", () => {
  it("records a settled edit and restores it on undo, re-applies on redo", () => {
    const before = doc();
    get().setBpm(140);
    vi.advanceTimersByTime(COMMIT_DEBOUNCE_MS);

    expect(canUndo()).toBe(true);
    expect(get().bpm).toBe(140);

    undo();
    expect(get().bpm).toBe(124);
    expect(doc()).toBe(before);
    expect(canRedo()).toBe(true);

    redo();
    expect(get().bpm).toBe(140);
  });

  it("collapses a debounced burst of edits into ONE undo entry", () => {
    get().setBpm(130);
    get().setBpm(131);
    get().setBpm(132);
    vi.advanceTimersByTime(COMMIT_DEBOUNCE_MS);

    expect(get().undoDepth).toBe(1);
    undo();
    expect(get().bpm).toBe(124); // back to baseline in a single step
  });

  it("collapses a transaction (drag gesture) into ONE undo entry", () => {
    beginTransaction();
    get().setBpm(130);
    get().setBpm(140);
    endTransaction();

    expect(get().undoDepth).toBe(1);
    undo();
    expect(get().bpm).toBe(124);
  });

  it("does NOT record transient rAF writes (tick / meters)", () => {
    useDawStore.setState({ playing: true });
    get().tick(0.1); // advances playhead + reel (not part of the document)
    get().setMeterLevels({ kick: 0.9 }, {}, [0, 0], 0.7);
    vi.advanceTimersByTime(COMMIT_DEBOUNCE_MS);

    expect(canUndo()).toBe(false);
    expect(get().undoDepth).toBe(0);
  });

  it("does NOT record selection changes", () => {
    get().selectClip("sub-d", "sub");
    vi.advanceTimersByTime(COMMIT_DEBOUNCE_MS);
    expect(canUndo()).toBe(false);
  });

  it("clearHistory empties both stacks and resets depths", () => {
    get().setBpm(150);
    vi.advanceTimersByTime(COMMIT_DEBOUNCE_MS);
    expect(canUndo()).toBe(true);

    clearHistory();
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
    expect(get().undoDepth).toBe(0);
    expect(get().redoDepth).toBe(0);
  });

  it("undo flushes an in-flight (un-debounced) edit, then undoes it", () => {
    get().setBpm(160); // no timer advance — commit still pending
    expect(canUndo()).toBe(false); // nothing committed yet
    undo(); // flush seals it, then undoes
    expect(get().bpm).toBe(124);
  });
});

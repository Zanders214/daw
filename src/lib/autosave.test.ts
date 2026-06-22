import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the storage backend so sessionBackend.save / savePrefs are spies.
// Keep the real AUTOSAVE_NAME export so we can assert the save target name.
vi.mock("./sessionStore", () => ({
  AUTOSAVE_NAME: "__autosave__",
  sessionBackend: {
    save: vi.fn(async () => true),
    savePrefs: vi.fn(async () => {}),
  },
}));

import { startAutosave } from "./autosave";
import { sessionBackend, AUTOSAVE_NAME } from "./sessionStore";
import { SESSION_VERSION } from "./session";
import { useDawStore } from "../store/useDawStore";

const save = sessionBackend.save as unknown as ReturnType<typeof vi.fn>;
const savePrefs = sessionBackend.savePrefs as unknown as ReturnType<typeof vi.fn>;

// Snapshot the full store so each test starts from the demo seed and order
// does not matter. The store is restored (replace=true) in beforeEach.
const pristine = { ...useDawStore.getState() };

// Track disposers so a thrown assertion can never leak a live subscription
// into the next test (zustand keeps listeners across setState replace=true).
const disposers: Array<() => void> = [];
const begin = (): (() => void) => {
  const d = startAutosave();
  disposers.push(d);
  return d;
};

beforeEach(() => {
  vi.useFakeTimers();
  useDawStore.setState(pristine, true);
  save.mockClear();
  savePrefs.mockClear();
});

afterEach(() => {
  while (disposers.length) disposers.pop()!();
  vi.clearAllTimers();
  vi.useRealTimers();
  useDawStore.setState(pristine, true);
});

describe("startAutosave — debounced musical save", () => {
  it("debounces a session save (~800ms) when autoSave is on and musical state changes", () => {
    useDawStore.setState({ autoSave: true });
    const dispose = begin();

    // Mutate musical state — schedules a debounced save.
    useDawStore.getState().setBpm(140);

    // Nothing fires before the debounce window elapses.
    vi.advanceTimersByTime(700);
    expect(save).not.toHaveBeenCalled();

    // Crossing ~800ms flushes the save.
    vi.advanceTimersByTime(200);
    expect(save).toHaveBeenCalledTimes(1);

    dispose();
  });

  it("writes to the reserved autosave session with version + serialized ui", () => {
    useDawStore.setState({ autoSave: true, currentSessionName: "My Jam" });
    const dispose = begin();

    useDawStore.getState().setBpm(150);
    vi.advanceTimersByTime(800);

    expect(save).toHaveBeenCalledTimes(1);
    const [name, data] = save.mock.calls[0];
    expect(name).toBe(AUTOSAVE_NAME);
    expect(data.version).toBe(SESSION_VERSION);
    expect(data.name).toBe("My Jam");
    // The persisted payload reflects the freshly-set tempo.
    expect(data.ui.bpm).toBe(150);
    dispose();
  });

  it("falls back to the 'Autosave' name when no session name is set", () => {
    useDawStore.setState({ autoSave: true, currentSessionName: null });
    const dispose = begin();

    useDawStore.getState().setBpm(133);
    vi.advanceTimersByTime(800);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1].name).toBe("Autosave");
    dispose();
  });

  it("coalesces rapid musical edits into a single debounced save", () => {
    useDawStore.setState({ autoSave: true });
    const dispose = begin();

    const setBpm = useDawStore.getState().setBpm;
    setBpm(125);
    vi.advanceTimersByTime(300);
    setBpm(126);
    vi.advanceTimersByTime(300);
    setBpm(127);
    // Still within a debounce window of the last edit.
    vi.advanceTimersByTime(300);
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500); // total 800ms past the last edit
    expect(save).toHaveBeenCalledTimes(1);
    // The flushed payload carries the latest value, not an intermediate one.
    expect(save.mock.calls[0][1].ui.bpm).toBe(127);
    dispose();
  });

  it("triggers a save when only the node racks change (engine-owned)", () => {
    useDawStore.setState({ autoSave: true });
    const dispose = begin();

    // nodeRacks is part of change-detection even though serializeSession's
    // tracked fields are otherwise unchanged.
    useDawStore.setState({ nodeRacks: { kick: [{ id: "fx1" }] } as never });
    vi.advanceTimersByTime(800);

    expect(save).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("does not save musical state when autoSave is off", () => {
    useDawStore.setState({ autoSave: false });
    const dispose = begin();

    useDawStore.getState().setBpm(160);
    vi.advanceTimersByTime(2000);

    expect(save).not.toHaveBeenCalled();
    dispose();
  });

  it("does not save when nothing musical changed", () => {
    useDawStore.setState({ autoSave: true });
    const dispose = begin();

    // Re-set the SAME value: serialized state is identical → no save.
    const bpm = useDawStore.getState().bpm;
    useDawStore.getState().setBpm(bpm);
    vi.advanceTimersByTime(2000);

    expect(save).not.toHaveBeenCalled();
    dispose();
  });
});

describe("startAutosave — prefs always persist", () => {
  it("debounces a prefs save when a pref changes, regardless of autoSave", () => {
    useDawStore.setState({ autoSave: false });
    const dispose = begin();

    // A pref change (theme) persists even though musical autosave is off.
    useDawStore.setState({ theme: "midnight" });
    vi.advanceTimersByTime(700);
    expect(savePrefs).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(savePrefs).toHaveBeenCalledTimes(1);
    expect(savePrefs.mock.calls[0][0].theme).toBe("midnight");
    // No musical save happened.
    expect(save).not.toHaveBeenCalled();
    dispose();
  });

  it("persists the autoSave toggle itself via prefs", () => {
    useDawStore.setState({ autoSave: true });
    const dispose = begin();

    // Toggling autoSave off is a pref change → must be saved.
    useDawStore.getState().toggleAutoSave();
    vi.advanceTimersByTime(800);

    expect(savePrefs).toHaveBeenCalledTimes(1);
    expect(savePrefs.mock.calls[0][0].autoSave).toBe(false);
    dispose();
  });

  it("does not save prefs when no pref changed", () => {
    // Bake autoSave:false into the baseline BEFORE subscribing, so the only
    // post-subscribe mutation is musical — prefs serialization is unchanged.
    useDawStore.setState({ autoSave: false });
    const dispose = begin();

    useDawStore.getState().setBpm(170);
    vi.advanceTimersByTime(2000);

    expect(savePrefs).not.toHaveBeenCalled();
    dispose();
  });
});

describe("startAutosave — disposer", () => {
  it("unsubscribes so later mutations schedule nothing", () => {
    useDawStore.setState({ autoSave: true });
    const dispose = begin();
    dispose();

    useDawStore.getState().setBpm(180);
    useDawStore.setState({ theme: "midnight" });
    vi.advanceTimersByTime(2000);

    expect(save).not.toHaveBeenCalled();
    expect(savePrefs).not.toHaveBeenCalled();
  });

  it("cancels an in-flight debounced save when disposed before it fires", () => {
    useDawStore.setState({ autoSave: true });
    const dispose = begin();

    useDawStore.getState().setBpm(190);
    useDawStore.setState({ theme: "light" });
    // Both timers are pending here.
    vi.advanceTimersByTime(400);
    dispose();
    vi.advanceTimersByTime(2000);

    // Disposer cleared both timers → neither callback runs.
    expect(save).not.toHaveBeenCalled();
    expect(savePrefs).not.toHaveBeenCalled();
  });
});

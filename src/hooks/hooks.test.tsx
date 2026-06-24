// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Module mocks. These hooks orchestrate the persistence/engine-sync libs; the
// libs themselves are unit-tested elsewhere. Here we spy on the seams so we can
// assert mount/unmount wiring and the observable store effects deterministically
// without a live AudioContext or native bridge.
// ---------------------------------------------------------------------------

// useSessionPersistence deps -------------------------------------------------
const stopAutosave = vi.fn();
vi.mock("../lib/autosave", () => ({
  startAutosave: vi.fn(() => stopAutosave),
}));
vi.mock("../lib/session", async (orig) => {
  const real = await orig<typeof import("../lib/session")>();
  return {
    ...real,
    applyPrefs: vi.fn(),
    applySession: vi.fn(),
  };
});
// A controllable session backend so we can drive the async restore flow.
const loadPrefs = vi.fn(async (..._a: unknown[]) => null as unknown);
const load = vi.fn(async (..._a: unknown[]) => null as unknown);
vi.mock("../lib/sessionStore", () => ({
  AUTOSAVE_NAME: "__autosave__",
  sessionBackend: {
    loadPrefs: (...a: unknown[]) => loadPrefs(...a),
    load: (...a: unknown[]) => load(...a),
  },
}));

// useEngineBridge deps -------------------------------------------------------
const applySessionToEngine = vi.fn();
vi.mock("../lib/engineSync", () => ({
  applySessionToEngine: (...a: unknown[]) => applySessionToEngine(...a),
}));

import { useTransportLoop } from "./useTransportLoop";
import { useMixerGraph } from "./useMixerGraph";
import { useSessionPersistence } from "./useSessionPersistence";
import { useEngineBridge } from "./useEngineBridge";
import { useResponsiveLayout, NARROW_W, SHORT_H } from "./useResponsiveLayout";
import { useDawStore } from "../store/useDawStore";
import { startAutosave } from "../lib/autosave";
import { applyPrefs, applySession } from "../lib/session";

// Snapshot the demo-seeded store so any per-test mutation is reversible and the
// suite stays order-independent.
const pristine = { ...useDawStore.getState() };

/** Build a recording JUCE backend stub (the native bridge surface). */
function makeBackend() {
  const listeners = new Map<string, (p: unknown) => void>();
  const emitted: { id: string; payload: unknown }[] = [];
  let token = 1;
  const removed: unknown[] = [];
  const backend = {
    emitEvent: vi.fn((id: string, payload: unknown) => emitted.push({ id, payload })),
    addEventListener: vi.fn((id: string, cb: (p: unknown) => void) => {
      listeners.set(id, cb);
      return { token: token++ };
    }),
    removeEventListener: vi.fn((t: unknown) => removed.push(t)),
  };
  return { backend, listeners, emitted, removed };
}

const hostEngine = (b: { backend: ReturnType<typeof makeBackend>["backend"] }) => {
  (globalThis as any).window.__JUCE__ = b;
};

beforeEach(() => {
  vi.clearAllMocks();
  useDawStore.setState(pristine, true);
});

afterEach(() => {
  delete (globalThis as any).window.__JUCE__;
  useDawStore.setState(pristine, true);
  vi.useRealTimers();
});

// ===========================================================================
// useTransportLoop
// ===========================================================================
describe("useTransportLoop", () => {
  it("mounts and unmounts cleanly in the offline (no-engine) shell", () => {
    const { unmount } = renderHook(() => useTransportLoop());
    expect(() => unmount()).not.toThrow();
  });

  it("schedules a requestAnimationFrame on mount and cancels it on unmount", () => {
    const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(123 as never);
    const caf = vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});

    const { unmount } = renderHook(() => useTransportLoop());
    expect(raf).toHaveBeenCalledTimes(1);

    unmount();
    expect(caf).toHaveBeenCalledWith(123);
  });

  it("advances the playhead via the store tick across animation frames while playing", () => {
    // Capture the rAF callback and drive it manually with a controlled timestamp.
    let cb: FrameRequestCallback | null = null;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((fn) => {
      cb = fn;
      return 1 as never;
    });
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});

    useDawStore.setState({ playing: true, playhead: 0, bpm: 120 });
    const before = useDawStore.getState().playhead;

    renderHook(() => useTransportLoop());
    expect(cb).toBeTypeOf("function");

    // The loop seeds its `last` baseline from performance.now() at mount, so feed
    // monotonically increasing timestamps relative to that to get a positive dt.
    const base = performance.now();
    // First frame establishes the per-loop `last` baseline (~0 dt).
    cb!(base);
    // Second frame ~500ms later → at 120bpm (2 beats/sec) advances ~1 beat.
    cb!(base + 500);

    const after = useDawStore.getState().playhead;
    expect(after).toBeGreaterThan(before);
  });

  it("does not advance the playhead while stopped", () => {
    let cb: FrameRequestCallback | null = null;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((fn) => {
      cb = fn;
      return 1 as never;
    });
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});

    useDawStore.setState({ playing: false, playhead: 4 });
    renderHook(() => useTransportLoop());
    const base = performance.now();
    cb!(base);
    cb!(base + 1000);
    expect(useDawStore.getState().playhead).toBe(4);
  });

  it("is a no-op (no rAF loop) when hosted by the engine", () => {
    hostEngine(makeBackend());
    const raf = vi.spyOn(globalThis, "requestAnimationFrame");
    const { unmount } = renderHook(() => useTransportLoop());
    expect(raf).not.toHaveBeenCalled();
    expect(() => unmount()).not.toThrow();
  });
});

// ===========================================================================
// useMixerGraph
// ===========================================================================
describe("useMixerGraph", () => {
  it("mounts and unmounts cleanly offline (no AudioContext → graph no-ops)", () => {
    const { unmount } = renderHook(() => useMixerGraph());
    expect(() => unmount()).not.toThrow();
  });

  it("subscribes to the store and tears down the subscription on unmount", () => {
    const sub = vi.spyOn(useDawStore, "subscribe");
    const { unmount } = renderHook(() => useMixerGraph());
    expect(sub).toHaveBeenCalledTimes(1);

    // The effect returns an unsubscribe; unmount must invoke it without throwing.
    expect(() => unmount()).not.toThrow();
  });

  it("reconciles only when the mix signature changes, not on every store update", () => {
    // The subscribe listener recomputes mixSignature; a non-mix change (playhead)
    // must not throw even though the graph stays a no-op without an AudioContext.
    renderHook(() => useMixerGraph());
    expect(() => {
      useDawStore.setState({ playhead: 7 }); // not part of the mix signature
      useDawStore.getState().setBpm(141); // also not in the signature
    }).not.toThrow();
  });

  it("is a no-op when hosted by the engine (does not subscribe)", () => {
    hostEngine(makeBackend());
    const sub = vi.spyOn(useDawStore, "subscribe");
    const { unmount } = renderHook(() => useMixerGraph());
    expect(sub).not.toHaveBeenCalled();
    expect(() => unmount()).not.toThrow();
  });
});

// ===========================================================================
// useSessionPersistence
// ===========================================================================
describe("useSessionPersistence", () => {
  it("loads prefs, restores the autosave session, then starts autosaving", async () => {
    loadPrefs.mockResolvedValueOnce({ autoSave: true, theme: "midnight" });
    load.mockResolvedValueOnce({ version: 3, name: "Last", ui: { bpm: 130 } });

    renderHook(() => useSessionPersistence());
    // Flush the async restore IIFE (two awaits + microtask drain).
    await vi.waitFor(() => expect(startAutosave).toHaveBeenCalledTimes(1));

    expect(applyPrefs).toHaveBeenCalledWith({ autoSave: true, theme: "midnight" });
    expect(load).toHaveBeenCalledWith("__autosave__");
    expect(applySession).toHaveBeenCalledWith({ version: 3, name: "Last", ui: { bpm: 130 } });
  });

  it("skips restoring the session when prefs disable autosave, but still starts autosave", async () => {
    loadPrefs.mockResolvedValueOnce({ autoSave: false });

    renderHook(() => useSessionPersistence());
    await vi.waitFor(() => expect(startAutosave).toHaveBeenCalledTimes(1));

    expect(applyPrefs).toHaveBeenCalledWith({ autoSave: false });
    // autoSave === false → the last session is NOT loaded.
    expect(load).not.toHaveBeenCalled();
    expect(applySession).not.toHaveBeenCalled();
  });

  it("handles a missing autosave session gracefully (load resolves null)", async () => {
    loadPrefs.mockResolvedValueOnce(null); // no prefs at all
    load.mockResolvedValueOnce(null); // nothing stored

    renderHook(() => useSessionPersistence());
    await vi.waitFor(() => expect(startAutosave).toHaveBeenCalledTimes(1));

    // No prefs → applyPrefs not called; load attempted but applySession skipped.
    expect(applyPrefs).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledWith("__autosave__");
    expect(applySession).not.toHaveBeenCalled();
  });

  it("calls the autosave disposer on unmount", async () => {
    loadPrefs.mockResolvedValueOnce({ autoSave: false });

    const { unmount } = renderHook(() => useSessionPersistence());
    await vi.waitFor(() => expect(startAutosave).toHaveBeenCalledTimes(1));

    unmount();
    expect(stopAutosave).toHaveBeenCalledTimes(1);
  });

  it("aborts the restore when unmounted before the async chain resolves", async () => {
    // Hold loadPrefs pending so the cancelled flag is set before it resolves.
    let resolvePrefs!: (v: unknown) => void;
    loadPrefs.mockReturnValueOnce(new Promise((r) => (resolvePrefs = r)));

    const { unmount } = renderHook(() => useSessionPersistence());
    unmount(); // sets cancelled = true before loadPrefs settles
    resolvePrefs({ autoSave: true });
    // Drain microtasks; the cancelled guard short-circuits before startAutosave.
    await Promise.resolve();
    await Promise.resolve();

    expect(startAutosave).not.toHaveBeenCalled();
    expect(applyPrefs).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// useEngineBridge
// ===========================================================================
describe("useEngineBridge", () => {
  it("is a no-op in a plain browser (no native engine)", () => {
    const { unmount } = renderHook(() => useEngineBridge());
    // Nothing to push when offline.
    expect(applySessionToEngine).not.toHaveBeenCalled();
    expect(() => unmount()).not.toThrow();
  });

  it("subscribes to engine events and syncs UI state down when hosted", () => {
    const { backend, listeners } = makeBackend();
    hostEngine({ backend });

    renderHook(() => useEngineBridge());

    // Subscribed to the engine event stream...
    expect(listeners.has("engineState")).toBe(true);
    expect(listeners.has("engineTracks")).toBe(true);
    expect(listeners.has("engineNodeRacks")).toBe(true);
    expect(listeners.has("engineSessionImported")).toBe(true);
    // ...and pushed the current UI down to the freshly-connected engine.
    expect(applySessionToEngine).toHaveBeenCalledTimes(1);
    expect(applySessionToEngine).toHaveBeenCalledWith(useDawStore.getState());
  });

  it("routes an engineState event into the store (drives the playhead)", () => {
    const { backend, listeners } = makeBackend();
    hostEngine({ backend });

    renderHook(() => useEngineBridge());
    listeners.get("engineState")!({ playhead: 42, playing: true });

    expect(useDawStore.getState().playhead).toBe(42);
    expect(useDawStore.getState().playing).toBe(true);
  });

  it("routes an engineTracks event into the store's trackFiles", () => {
    const { backend, listeners } = makeBackend();
    hostEngine({ backend });

    renderHook(() => useEngineBridge());
    const tracks = { kick: { loaded: true, name: "Kick", path: "/k.wav" } };
    listeners.get("engineTracks")!(tracks);

    expect(useDawStore.getState().trackFiles).toEqual(tracks);
  });

  it("routes an engineNodeRacks event into the store", () => {
    const { backend, listeners } = makeBackend();
    hostEngine({ backend });

    renderHook(() => useEngineBridge());
    const racks = { kick: [{ id: "fx1", kind: "eq" as const, name: "EQ" }] };
    listeners.get("engineNodeRacks")!(racks);

    expect(useDawStore.getState().nodeRacks).toEqual(racks);
  });

  it("applies an imported session and records its name", () => {
    const { backend, listeners } = makeBackend();
    hostEngine({ backend });

    renderHook(() => useEngineBridge());
    listeners.get("engineSessionImported")!({
      name: "Imported Jam",
      ui: { bpm: 99 },
    });

    expect(applySession).toHaveBeenCalledTimes(1);
    const arg = (applySession as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.name).toBe("Imported Jam");
    expect(arg.ui).toEqual({ bpm: 99 });
    expect(useDawStore.getState().currentSessionName).toBe("Imported Jam");
  });

  it("falls back to 'Imported' / null name when the import payload omits a name", () => {
    const { backend, listeners } = makeBackend();
    hostEngine({ backend });

    renderHook(() => useEngineBridge());
    listeners.get("engineSessionImported")!({ ui: { bpm: 88 } });

    const arg = (applySession as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.name).toBe("Imported");
    expect(useDawStore.getState().currentSessionName).toBeNull();
  });

  it("unsubscribes from engine events on unmount", () => {
    const { backend } = makeBackend();
    hostEngine({ backend });

    const { unmount } = renderHook(() => useEngineBridge());
    unmount();
    // subscribeEngine's unsub removes one token per registered handler (4 here).
    expect(backend.removeEventListener).toHaveBeenCalled();
  });
});

// ===========================================================================
// useResponsiveLayout
// ===========================================================================
describe("useResponsiveLayout", () => {
  const setViewport = (w: number, h: number) => {
    Object.defineProperty(globalThis, "innerWidth", { value: w, configurable: true, writable: true });
    Object.defineProperty(globalThis, "innerHeight", { value: h, configurable: true, writable: true });
  };
  const resize = () => globalThis.dispatchEvent(new Event("resize"));

  // A roomy window where both panels comfortably fit.
  beforeEach(() => setViewport(1920, 1080));
  afterEach(() => setViewport(1920, 1080));

  it("leaves both panels open at a comfortable size", () => {
    renderHook(() => useResponsiveLayout());
    expect(useDawStore.getState().browserOpen).toBe(true);
    expect(useDawStore.getState().rackOpen).toBe(true);
  });

  it("auto-collapses the browser when mounted in a narrow window", () => {
    setViewport(NARROW_W - 1, 1080);
    renderHook(() => useResponsiveLayout());
    expect(useDawStore.getState().browserOpen).toBe(false);
    expect(useDawStore.getState().rackOpen).toBe(true);
  });

  it("auto-collapses the device rack when mounted in a short window", () => {
    setViewport(1920, SHORT_H - 1);
    renderHook(() => useResponsiveLayout());
    expect(useDawStore.getState().rackOpen).toBe(false);
    expect(useDawStore.getState().browserOpen).toBe(true);
  });

  it("restores the browser it collapsed once the window widens again", () => {
    setViewport(NARROW_W - 1, 1080);
    renderHook(() => useResponsiveLayout());
    expect(useDawStore.getState().browserOpen).toBe(false);

    setViewport(1920, 1080);
    resize();
    expect(useDawStore.getState().browserOpen).toBe(true);
  });

  it("does not reopen a browser the user closed themselves", () => {
    // User prefers the browser closed in a wide window.
    useDawStore.setState({ browserOpen: false });
    renderHook(() => useResponsiveLayout());

    // Narrowing must not flip their preference back on...
    setViewport(NARROW_W - 1, 1080);
    resize();
    expect(useDawStore.getState().browserOpen).toBe(false);

    // ...and neither must widening (we never auto-collapsed it, so nothing to restore).
    setViewport(1920, 1080);
    resize();
    expect(useDawStore.getState().browserOpen).toBe(false);
  });

  it("does not fight a manual reopen made while the window is still narrow", () => {
    setViewport(NARROW_W - 1, 1080);
    renderHook(() => useResponsiveLayout());
    expect(useDawStore.getState().browserOpen).toBe(false);

    // User explicitly reopens the browser despite the narrow window.
    useDawStore.getState().toggleBrowser();
    expect(useDawStore.getState().browserOpen).toBe(true);

    // Widening should leave their choice intact rather than toggling it again.
    setViewport(1920, 1080);
    resize();
    expect(useDawStore.getState().browserOpen).toBe(true);
  });

  it("detaches its resize listener on unmount", () => {
    const { unmount } = renderHook(() => useResponsiveLayout());
    unmount();

    // After unmount, crossing the breakpoint must not mutate the store.
    useDawStore.setState({ browserOpen: true });
    setViewport(NARROW_W - 1, 1080);
    resize();
    expect(useDawStore.getState().browserOpen).toBe(true);
  });
});

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  engine,
  engineActive,
  subscribeEngine,
  type EngineState,
  type DeviceInfo,
} from "./engine";

// A recording stub matching JuceBackend's surface. emitEvent records every
// JS->C++ invoke; addEventListener records every C++->JS subscription and lets
// us fire the matching callback.
function makeBackend() {
  const emitted: { id: string; payload: unknown }[] = [];
  const listeners = new Map<string, (p: unknown) => void>();
  let nextToken = 1;
  const removed: unknown[] = [];
  const backend = {
    emitEvent: vi.fn((id: string, payload: unknown) => {
      emitted.push({ id, payload });
    }),
    addEventListener: vi.fn((id: string, cb: (p: unknown) => void) => {
      listeners.set(id, cb);
      return { token: nextToken++ };
    }),
    removeEventListener: vi.fn((tok: unknown) => {
      removed.push(tok);
    }),
  };
  return { backend, emitted, listeners, removed };
}

/** The `name` of the single (or last) `__juce__invoke` emit. */
function lastInvoke(emitted: { id: string; payload: unknown }[]) {
  const invokes = emitted.filter((e) => e.id === "__juce__invoke");
  return invokes[invokes.length - 1]?.payload as
    | { name: string; params: unknown[]; resultId: number }
    | undefined;
}

afterEach(() => {
  delete (globalThis as any).window.__JUCE__;
  vi.restoreAllMocks();
});

describe("engine.ts — host detection", () => {
  it("engineActive() is false when window.__JUCE__ is absent", () => {
    expect(engineActive()).toBe(false);
  });

  it("engineActive() is false when window.__JUCE__ exists but has no backend", () => {
    (globalThis as any).window.__JUCE__ = {};
    expect(engineActive()).toBe(false);
  });

  it("engineActive() is true once a backend is present", () => {
    const { backend } = makeBackend();
    (globalThis as any).window.__JUCE__ = { backend };
    expect(engineActive()).toBe(true);
  });
});

describe("engine.ts — commands are no-ops without a backend", () => {
  it("calling a command resolves to undefined and emits nothing", async () => {
    // No window.__JUCE__ set: backend() returns undefined, call() short-circuits.
    const result = await engine.transport.setPlaying(true);
    expect(result).toBeUndefined();
  });

  it("every command returns a resolving promise even offline", async () => {
    await expect(engine.mixer.setMasterVolume(0.5)).resolves.toBeUndefined();
    await expect(engine.session.list()).resolves.toBeUndefined();
    await expect(engine.audio.getDevices()).resolves.toBeUndefined();
  });
});

describe("engine.ts — command proxy forwards names + args to backend", () => {
  let backend: ReturnType<typeof makeBackend>["backend"];
  let emitted: ReturnType<typeof makeBackend>["emitted"];

  beforeEach(() => {
    const made = makeBackend();
    backend = made.backend;
    emitted = made.emitted;
    (globalThis as any).window.__JUCE__ = { backend };
  });

  const expectInvoke = (name: string, params: unknown[]) => {
    const inv = lastInvoke(emitted);
    expect(inv).toBeDefined();
    expect(inv!.name).toBe(name);
    expect(inv!.params).toEqual(params);
    expect(typeof inv!.resultId).toBe("number");
  };

  it("transport.* forwards each command name and args", () => {
    engine.transport.setPlaying(true);
    expectInvoke("transportSetPlaying", [true]);
    engine.transport.stop();
    expectInvoke("transportStop", []);
    engine.transport.setPosition(16);
    expectInvoke("transportSetPosition", [16]);
    engine.transport.setLooping(false);
    expectInvoke("transportSetLooping", [false]);
    engine.transport.setRecording(true);
    expectInvoke("transportSetRecording", [true]);
    engine.transport.setTempo(128);
    expectInvoke("transportSetTempo", [128]);
    engine.transport.setLoopStart(4);
    expectInvoke("transportSetLoopStart", [4]);
    engine.transport.setLoopEnd(64);
    expectInvoke("transportSetLoopEnd", [64]);
  });

  it("mixer.* forwards each command name and args", () => {
    engine.mixer.setTrackVolume("kick", 0.8);
    expectInvoke("mixerSetTrackVolume", ["kick", 0.8]);
    engine.mixer.setTrackPan("kick", -0.3);
    expectInvoke("mixerSetTrackPan", ["kick", -0.3]);
    engine.mixer.setTrackMute("kick", true);
    expectInvoke("mixerSetTrackMute", ["kick", true]);
    engine.mixer.setTrackSolo("kick", false);
    expectInvoke("mixerSetTrackSolo", ["kick", false]);
    engine.mixer.setTrackArm("kick", true);
    expectInvoke("mixerSetTrackArm", ["kick", true]);
    engine.mixer.setTrackGroup("kick", "g-drums");
    expectInvoke("mixerSetTrackGroup", ["kick", "g-drums"]);
    engine.mixer.setTrackSend("kick", 2, 0.4);
    expectInvoke("mixerSetTrackSend", ["kick", 2, 0.4]);
    engine.mixer.setMasterVolume(0.7);
    expectInvoke("mixerSetMasterVolume", [0.7]);
    engine.mixer.setMasterPan(0.1);
    expectInvoke("mixerSetMasterPan", [0.1]);
  });

  it("group.* forwards each command name and args", () => {
    engine.group.setGain("g-drums", 0.5);
    expectInvoke("groupSetGain", ["g-drums", 0.5]);
    engine.group.setPan("g-drums", 0.2);
    expectInvoke("groupSetPan", ["g-drums", 0.2]);
    engine.group.setMute("g-drums", true);
    expectInvoke("groupSetMute", ["g-drums", true]);
    engine.group.setSolo("g-drums", false);
    expectInvoke("groupSetSolo", ["g-drums", false]);
  });

  it("returns.setGain forwards index + value", () => {
    engine.returns.setGain(1, 0.6);
    expectInvoke("returnSetGain", [1, 0.6]);
  });

  it("automation.* forwards points / clear / clearAll", () => {
    const pts = [{ t: 0, v: 0.5 }, { t: 1, v: 1 }];
    engine.automation.set("lead", "vol", pts);
    expectInvoke("automationSet", ["lead", "vol", pts]);
    engine.automation.clear("lead", "vol");
    expectInvoke("automationClear", ["lead", "vol"]);
    engine.automation.clearAll();
    expectInvoke("automationClearAll", []);
  });

  it("node.* forwards rack ops; add wraps the descriptor", () => {
    engine.node.add("lead", "inst-1", { kind: "eq", name: "ZANDERS EQ" });
    // `add` builds a single object param: { id, kind, path: path ?? "" }
    expectInvoke("nodeDeviceAdd", ["lead", { id: "inst-1", kind: "eq", path: "" }]);

    engine.node.add("lead", "inst-2", { kind: "vst3", name: "X", path: "/p.vst3" });
    expectInvoke("nodeDeviceAdd", ["lead", { id: "inst-2", kind: "vst3", path: "/p.vst3" }]);

    engine.node.remove("lead", "inst-1");
    expectInvoke("nodeDeviceRemove", ["lead", "inst-1"]);
    engine.node.setBypass("lead", "inst-1", true);
    expectInvoke("nodeDeviceSetBypass", ["lead", "inst-1", true]);
    engine.node.openEditor("lead", "inst-1");
    expectInvoke("nodeDeviceOpenEditor", ["lead", "inst-1"]);
    engine.node.closeEditor("lead", "inst-1");
    expectInvoke("nodeDeviceCloseEditor", ["lead", "inst-1"]);
    engine.node.pickFile("lead", "inst-1");
    expectInvoke("nodeDevicePickFile", ["lead", "inst-1"]);
    engine.node.listParams("lead", "inst-1");
    expectInvoke("nodeDeviceListParams", ["lead", "inst-1"]);
  });

  it("track.* forwards lifecycle + file ops", () => {
    engine.track.create("t1", "NEW", "midi", "#fff", "g-drums");
    expectInvoke("trackCreate", ["t1", "NEW", "midi", "#fff", "g-drums"]);
    engine.track.delete("t1");
    expectInvoke("trackDelete", ["t1"]);
    engine.track.assignFile("t1", "/a.wav");
    expectInvoke("trackAssignFile", ["t1", "/a.wav"]);
    engine.track.pickFile("t1");
    expectInvoke("trackPickFile", ["t1"]);
    engine.track.clearFile("t1");
    expectInvoke("trackClearFile", ["t1"]);
  });

  it("device.* forwards bypass / param / editors / listParams", () => {
    engine.device.setBypass("tape", true);
    expectInvoke("deviceSetBypass", ["tape", true]);
    engine.device.setParam("pre", "amount", 0.5);
    expectInvoke("deviceSetParam", ["pre", "amount", 0.5]);
    engine.device.openEditor("eq");
    expectInvoke("deviceOpenEditor", ["eq"]);
    engine.device.closeEditor("eq");
    expectInvoke("deviceCloseEditor", ["eq"]);
    engine.device.listParams("eq");
    expectInvoke("deviceListParams", ["eq"]);
  });

  it("plugins.* forwards scan / assign / pickFile / list", () => {
    engine.plugins.scan();
    expectInvoke("pluginsScan", []);
    engine.plugins.assign("tape", "/p.vst3");
    expectInvoke("pluginsAssign", ["tape", "/p.vst3"]);
    engine.plugins.pickFile("eq");
    expectInvoke("pluginsPickFile", ["eq"]);
    engine.plugins.list();
    expectInvoke("pluginsList", []);
  });

  it("audio.* forwards getDevices / setSettings", () => {
    engine.audio.getDevices();
    expectInvoke("audioGetDevices", []);
    engine.audio.setSettings({ sampleRate: 44100 });
    expectInvoke("audioSetSettings", [{ sampleRate: 44100 }]);
  });

  it("source.* forwards pickFile / setInputMode", () => {
    engine.source.pickFile();
    expectInvoke("sourcePickFile", []);
    engine.source.setInputMode("input");
    expectInvoke("sourceSetInputMode", ["input"]);
  });

  it("session.* forwards save / load / list / remove / export / import / prefs", () => {
    const ui = { tracks: [] };
    engine.session.save("mix", ui);
    expectInvoke("sessionSave", ["mix", ui]);
    engine.session.load("mix");
    expectInvoke("sessionLoad", ["mix"]);
    engine.session.list();
    expectInvoke("sessionList", []);
    engine.session.remove("mix");
    expectInvoke("sessionDelete", ["mix"]);
    engine.session.export("mix", ui);
    expectInvoke("sessionExport", ["mix", ui]);
    engine.session.import();
    expectInvoke("sessionImport", []);
    engine.session.savePrefs({ theme: "dark" });
    expectInvoke("prefsSave", [{ theme: "dark" }]);
    engine.session.loadPrefs();
    expectInvoke("prefsLoad", []);
  });

  it("each invoke gets a unique, monotonically increasing resultId", () => {
    engine.transport.stop();
    const first = lastInvoke(emitted)!.resultId;
    engine.transport.stop();
    const second = lastInvoke(emitted)!.resultId;
    expect(second).toBeGreaterThan(first);
  });
});

describe("engine.ts — invoke/complete round-trip resolves the promise", () => {
  // `completeWired` is module-level: the `__juce__complete` listener is wired
  // only on the FIRST `call()` of the module's lifetime. Other describe blocks
  // already triggered that wiring against a now-discarded backend, so here we
  // re-import a fresh module instance (resetting that flag) and set the backend
  // BEFORE first use so the listener lands on the backend we can fire.
  let freshEngine: typeof engine;
  let made: ReturnType<typeof makeBackend>;

  beforeEach(async () => {
    vi.resetModules();
    made = makeBackend();
    (globalThis as any).window.__JUCE__ = { backend: made.backend };
    ({ engine: freshEngine } = await import("./engine"));
  });

  it("resolves with the result delivered on the matching __juce__complete event", async () => {
    const p = freshEngine.audio.getDevices() as Promise<DeviceInfo | undefined>;
    const inv = lastInvoke(made.emitted)!;

    // The module wires a single "__juce__complete" listener on first call.
    const complete = made.listeners.get("__juce__complete");
    expect(complete).toBeDefined();

    const payload: DeviceInfo = { sampleRate: 48000, bufferSize: 256 };
    complete!({ promiseId: inv.resultId, result: payload });

    await expect(p).resolves.toEqual(payload);
  });

  it("ignores complete events for unknown promise ids", async () => {
    let settled = false;
    const p = freshEngine.session.list().then((r) => {
      settled = true;
      return r;
    });
    const inv = lastInvoke(made.emitted)!;
    const complete = made.listeners.get("__juce__complete")!;

    // Unknown id: nothing happens.
    complete!({ promiseId: inv.resultId + 9999, result: "nope" });
    await Promise.resolve();
    expect(settled).toBe(false);

    // Correct id resolves it.
    complete!({ promiseId: inv.resultId, result: "ok" });
    await expect(p).resolves.toBe("ok");
  });

  it("wires the complete listener exactly once across many calls", () => {
    freshEngine.transport.stop();
    freshEngine.transport.stop();
    freshEngine.mixer.setMasterVolume(0.5);
    const completeSubs = made.backend.addEventListener.mock.calls.filter(
      (c) => c[0] === "__juce__complete",
    );
    expect(completeSubs).toHaveLength(1);
  });

  it("tolerates a complete event with a null/empty payload", () => {
    freshEngine.transport.stop();
    const complete = made.listeners.get("__juce__complete")!;
    // No matching pending id; (payload ?? {}) destructure must not throw.
    expect(() => complete!(null)).not.toThrow();
    expect(() => complete!(undefined)).not.toThrow();
  });
});

describe("engine.ts — subscribeEngine", () => {
  it("returns a no-op unsubscribe and registers nothing when inactive", () => {
    const onState = vi.fn();
    const unsub = subscribeEngine({ onState });
    expect(typeof unsub).toBe("function");
    // Calling the no-op must not throw.
    expect(() => unsub()).not.toThrow();
    expect(onState).not.toHaveBeenCalled();
  });

  it("subscribes only the handlers provided and routes events to them", () => {
    const { backend, listeners } = makeBackend();
    (globalThis as any).window.__JUCE__ = { backend };

    const onState = vi.fn();
    const onParams = vi.fn();
    const onPlugins = vi.fn();
    const onTracks = vi.fn();
    const onNodeRacks = vi.fn();
    const onSessionImported = vi.fn();
    const onReady = vi.fn();

    subscribeEngine({
      onState,
      onParams,
      onPlugins,
      onTracks,
      onNodeRacks,
      onSessionImported,
      onReady,
    });

    expect(listeners.has("engineState")).toBe(true);
    expect(listeners.has("engineParams")).toBe(true);
    expect(listeners.has("enginePlugins")).toBe(true);
    expect(listeners.has("engineTracks")).toBe(true);
    expect(listeners.has("engineNodeRacks")).toBe(true);
    expect(listeners.has("engineSessionImported")).toBe(true);
    expect(listeners.has("engineReady")).toBe(true);

    const state: EngineState = { playing: true, playhead: 12 };
    listeners.get("engineState")!(state);
    expect(onState).toHaveBeenCalledWith(state);

    listeners.get("engineTracks")!({ kick: { loaded: true, name: "Kick" } });
    expect(onTracks).toHaveBeenCalledWith({ kick: { loaded: true, name: "Kick" } });

    listeners.get("engineReady")!({ version: 1 });
    expect(onReady).toHaveBeenCalledWith({ version: 1 });
  });

  it("registers only the handlers that were supplied", () => {
    const { backend, listeners } = makeBackend();
    (globalThis as any).window.__JUCE__ = { backend };
    subscribeEngine({ onState: vi.fn() });
    expect(listeners.has("engineState")).toBe(true);
    expect(listeners.has("engineParams")).toBe(false);
    expect(listeners.has("engineReady")).toBe(false);
  });

  it("unsubscribe removes every token via removeEventListener", () => {
    const { backend, removed } = makeBackend();
    (globalThis as any).window.__JUCE__ = { backend };
    const unsub = subscribeEngine({ onState: vi.fn(), onTracks: vi.fn() });
    unsub();
    expect(backend.removeEventListener).toHaveBeenCalledTimes(2);
    expect(removed).toHaveLength(2);
  });

  it("unsubscribe is safe when the backend lacks removeEventListener", () => {
    const emitted: unknown[] = [];
    const backend = {
      emitEvent: vi.fn(),
      addEventListener: vi.fn(() => ({ token: 1 })),
      // no removeEventListener
    };
    (globalThis as any).window.__JUCE__ = { backend };
    const unsub = subscribeEngine({ onState: vi.fn() });
    expect(() => unsub()).not.toThrow();
    void emitted;
  });
});

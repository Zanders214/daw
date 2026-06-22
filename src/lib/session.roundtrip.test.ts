import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPrefs,
  applySession,
  buildSession,
  serializePrefs,
  serializeSession,
  SESSION_VERSION,
  type PrefsData,
  type SessionData,
  type SessionUi,
} from "./session";
import { useDawStore } from "../store/useDawStore";
import type { DeviceInfo } from "./engine";

const get = () => useDawStore.getState();

// Full snapshot of the seeded demo store so every test is order-independent.
const pristine = { ...useDawStore.getState() };

beforeEach(() => {
  useDawStore.setState(pristine, true);
});

afterEach(() => {
  // Remove any hosted-bridge stub a test may have installed (engineActive()
  // reads globalThis.window.__JUCE__?.backend live each call, so deleting the
  // whole window object restores the offline/plain-browser path).
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// serializeSession — every field of the SessionUi contract is carried over.
// ---------------------------------------------------------------------------
describe("serializeSession — full field contract", () => {
  it("copies every musical field straight off the store (no transforms)", () => {
    const customRacks = { lead: [{ id: "d1", kind: "eq" as const, name: "EQ" }] };
    useDawStore.setState({
      bpm: 77,
      loop: false,
      loopStart: 4,
      loopEnd: 200,
      volumes: { lead: 0.8 },
      pans: { lead: 0.25 },
      mutes: { kick: true },
      solos: { bass: true },
      arms: { lead: true },
      masterVolume: 0.4,
      masterPan: 0.6,
      groupVolumes: { drums: 0.9 },
      groupPans: { drums: 0.3 },
      groupMutes: { drums: true },
      groupSolos: { drums: false },
      sends: { lead: [0.1, 0.2] },
      returnGains: [0.5, 0.7],
      trackFiles: { lead: { loaded: true, path: "/x.wav" } },
      devices: { eq: false, tape: true, pre: false },
      preAmount: 0.33,
      autoLanes: { lead: true },
      autoParam: { lead: "pan" },
      autoData: { "lead:pan": [{ t: 0, v: 0.5 }] },
      metronome: true,
      countIn: 2,
      nodeRacks: customRacks,
    });

    const s = get();
    const ui = serializeSession(s);

    // Identity preservation: each value is referentially the store's value.
    expect(ui.tracks).toBe(s.tracks);
    expect(ui.groups).toBe(s.groups);
    expect(ui.nodeRacks).toBe(customRacks);
    expect(ui.bpm).toBe(77);
    expect(ui.loop).toBe(false);
    expect(ui.loopStart).toBe(4);
    expect(ui.loopEnd).toBe(200);
    expect(ui.volumes).toEqual({ lead: 0.8 });
    expect(ui.pans).toEqual({ lead: 0.25 });
    expect(ui.mutes).toEqual({ kick: true });
    expect(ui.solos).toEqual({ bass: true });
    expect(ui.arms).toEqual({ lead: true });
    expect(ui.masterVolume).toBe(0.4);
    expect(ui.masterPan).toBe(0.6);
    expect(ui.groupVolumes).toEqual({ drums: 0.9 });
    expect(ui.groupPans).toEqual({ drums: 0.3 });
    expect(ui.groupMutes).toEqual({ drums: true });
    expect(ui.groupSolos).toEqual({ drums: false });
    expect(ui.sends).toEqual({ lead: [0.1, 0.2] });
    expect(ui.returnGains).toEqual([0.5, 0.7]);
    expect(ui.trackFiles).toEqual({ lead: { loaded: true, path: "/x.wav" } });
    expect(ui.devices).toEqual({ eq: false, tape: true, pre: false });
    expect(ui.preAmount).toBe(0.33);
    expect(ui.autoLanes).toEqual({ lead: true });
    expect(ui.autoParam).toEqual({ lead: "pan" });
    expect(ui.autoData).toEqual({ "lead:pan": [{ t: 0, v: 0.5 }] });
    expect(ui.metronome).toBe(true);
    expect(ui.countIn).toBe(2);
  });

  it("emits exactly the documented key set (no extras leak through)", () => {
    const ui = serializeSession(get());
    expect(Object.keys(ui).sort()).toEqual(
      [
        "arms",
        "autoData",
        "autoLanes",
        "autoParam",
        "bpm",
        "countIn",
        "devices",
        "groupMutes",
        "groupPans",
        "groupSolos",
        "groupVolumes",
        "groups",
        "loop",
        "loopEnd",
        "loopStart",
        "masterPan",
        "masterVolume",
        "metronome",
        "mutes",
        "nodeRacks",
        "pans",
        "preAmount",
        "returnGains",
        "sends",
        "solos",
        "tracks",
        "trackFiles",
        "volumes",
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// serializePrefs — the global prefs contract.
// ---------------------------------------------------------------------------
describe("serializePrefs — full field contract", () => {
  it("copies every preference field off the store", () => {
    useDawStore.setState({
      theme: "midnight",
      tracksRight: true,
      showGrid: false,
      vibrantClips: true,
      sampleRate: 48,
      bufferSize: 256,
      outputDevice: "Interface",
      midiInput: "Port A",
      midiThru: true,
      autoSave: false,
    });
    const p = serializePrefs(get());
    expect(p).toEqual({
      theme: "midnight",
      tracksRight: true,
      showGrid: false,
      vibrantClips: true,
      sampleRate: 48,
      bufferSize: 256,
      outputDevice: "Interface",
      midiInput: "Port A",
      midiThru: true,
      autoSave: false,
    });
  });
});

// ---------------------------------------------------------------------------
// buildSession → applySession — round-trip a real store snapshot.
// ---------------------------------------------------------------------------
describe("buildSession + applySession — round-trip", () => {
  it("round-trips a full mutated snapshot through serialize → apply", () => {
    useDawStore.setState({
      bpm: 132,
      loop: false,
      loopStart: 8,
      loopEnd: 512,
      masterVolume: 0.7,
      masterPan: 0.2,
      volumes: { lead: 0.55, bass: 0.9 },
      mutes: { kick: true },
      solos: { snare: true },
      arms: { lead: true },
      sends: { lead: [0.3, 0.4] },
      returnGains: [0.6, 0.8],
      devices: { eq: false, tape: true, pre: false },
      preAmount: 0.42,
      metronome: true,
      countIn: 1,
      autoLanes: { lead: true },
      autoData: { "lead:vol": [{ t: 0, v: 0.1 }, { t: 64, v: 0.9 }] },
    });

    const data = buildSession("Demo Song");
    expect(data.version).toBe(SESSION_VERSION);
    expect(data.name).toBe("Demo Song");
    expect(typeof data.savedAt).toBe("string");

    // Wipe back to defaults, then re-apply the captured session.
    useDawStore.setState(pristine, true);
    expect(get().bpm).toBe(124);

    applySession(data);

    const s = get();
    expect(s.bpm).toBe(132);
    expect(s.loop).toBe(false);
    expect(s.loopStart).toBe(8);
    expect(s.loopEnd).toBe(512);
    expect(s.masterVolume).toBe(0.7);
    expect(s.masterPan).toBe(0.2);
    expect(s.volumes).toEqual({ lead: 0.55, bass: 0.9 });
    expect(s.mutes).toEqual({ kick: true });
    expect(s.solos).toEqual({ snare: true });
    expect(s.arms).toEqual({ lead: true });
    expect(s.sends).toEqual({ lead: [0.3, 0.4] });
    expect(s.returnGains).toEqual([0.6, 0.8]);
    expect(s.devices).toEqual({ eq: false, tape: true, pre: false });
    expect(s.preAmount).toBe(0.42);
    expect(s.metronome).toBe(true);
    expect(s.countIn).toBe(1);
    expect(s.autoLanes).toEqual({ lead: true });
    expect(s.autoData).toEqual({ "lead:vol": [{ t: 0, v: 0.1 }, { t: 64, v: 0.9 }] });
  });

  it("applySession with a partial v1/v2-style ui falls back to seed defaults", () => {
    // A legacy session that omits the arrangement structure (tracks/groups/racks)
    // and most mixer maps — hydrateSession must keep the seed defaults for those.
    const seedTrackCount = get().tracks.length;
    const seedGroupCount = get().groups.length;

    const legacy = { bpm: 95, countIn: 3 } as unknown as SessionUi;
    applySession({ version: 1, name: "legacy", ui: legacy });

    const s = get();
    expect(s.bpm).toBe(95);
    expect(s.countIn).toBe(3);
    // Structure untouched: still the seeded arrangement.
    expect(s.tracks).toHaveLength(seedTrackCount);
    expect(s.groups).toHaveLength(seedGroupCount);
  });

  it("applySession is a no-op when ui is missing", () => {
    const before = get().bpm;
    applySession({ version: SESSION_VERSION, name: "x" } as unknown as SessionData);
    expect(get().bpm).toBe(before);
  });

  it("applySession tolerates a null/undefined argument", () => {
    const before = get().bpm;
    expect(() => applySession(undefined as unknown as SessionData)).not.toThrow();
    expect(get().bpm).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// applyPrefs — offline path + nullish guard.
// ---------------------------------------------------------------------------
describe("applyPrefs — offline (no engine)", () => {
  it("hydrates appearance + device prefs without touching hardware", () => {
    applyPrefs({ theme: "light", autoSave: false, bufferSize: 512, sampleRate: 96 });
    const s = get();
    expect(s.theme).toBe("light");
    expect(s.autoSave).toBe(false);
    expect(s.bufferSize).toBe(512);
    expect(s.sampleRate).toBe(96);
  });

  it("partial prefs leave the unspecified fields at their defaults", () => {
    const beforeTheme = get().theme;
    applyPrefs({ autoSave: false });
    expect(get().autoSave).toBe(false);
    expect(get().theme).toBe(beforeTheme);
  });

  it("ignores a nullish prefs argument", () => {
    const before = get().theme;
    applyPrefs(null as unknown as Partial<PrefsData>);
    expect(get().theme).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// applyPrefs — HOSTED path (lines ~159-167): engine.audio.setSettings + the
// opts-building branches. Driven via a real window.__JUCE__.backend stub so the
// genuine invoke→complete promise chain runs into setDeviceInfo.
// ---------------------------------------------------------------------------

/**
 * A single, stable JUCE backend stub for the whole file. engine.ts wires its
 * `__juce__complete` listener exactly once (module-level `completeWired` flag)
 * against the FIRST backend object it sees, so we must keep one backend identity
 * and merely vary the canned reply / reset the capture between tests. Otherwise
 * later tests' replies would never resolve their promise.
 */
let bridgeInvokes: { name: string; params: unknown[] }[] = [];
let bridgeReply: DeviceInfo | undefined;
let bridgeCompleteCb: ((p: unknown) => void) | undefined;

const sharedBackend = {
  emitEvent: (id: string, payload: unknown) => {
    if (id !== "__juce__invoke") return;
    const { name, params, resultId } = payload as {
      name: string;
      params: unknown[];
      resultId: number;
    };
    bridgeInvokes.push({ name, params });
    // Resolve the pending call() promise with the canned DeviceInfo (or undefined).
    bridgeCompleteCb?.({ promiseId: resultId, result: bridgeReply });
  },
  addEventListener: (id: string, cb: (p: unknown) => void) => {
    if (id === "__juce__complete") bridgeCompleteCb = cb;
    return id;
  },
  removeEventListener: () => {},
};

/** Mark the app "hosted" and arm the next audioSetSettings reply. */
function installHostedBridge(reply?: DeviceInfo) {
  bridgeInvokes = [];
  bridgeReply = reply;
  // Under the node test env there is no global window; create a minimal one so
  // engine.ts's backend() can find __JUCE__.backend and treat us as "hosted".
  const g = globalThis as { window?: { __JUCE__?: unknown } };
  if (!g.window) g.window = {};
  g.window.__JUCE__ = { backend: sharedBackend };
  return bridgeInvokes;
}

describe("applyPrefs — hosted (engine active)", () => {
  it("pushes audio device settings and folds the returned DeviceInfo into the store", async () => {
    const reply: DeviceInfo = {
      outputDevice: "Studio Out",
      sampleRate: 48000, // Hz → store keeps kHz
      bufferSize: 256,
      sampleRates: [44100, 48000],
      bufferSizes: [128, 256],
      outputs: ["Studio Out", "Headphones"],
    };
    const invokes = installHostedBridge(reply);

    applyPrefs({ sampleRate: 44.1, bufferSize: 128, outputDevice: "Iface" });

    // One audioSetSettings invoke with the kHz→Hz rounded sampleRate.
    const call = invokes.find((i) => i.name === "audioSetSettings");
    expect(call).toBeDefined();
    expect(call!.params[0]).toEqual({
      sampleRate: 44100, // 44.1 kHz * 1000, rounded
      bufferSize: 128,
      outputDevice: "Iface",
    });

    // The DeviceInfo reply flows through .then → setDeviceInfo. Flush microtasks.
    await Promise.resolve();
    await Promise.resolve();

    const s = get();
    expect(s.outputDevice).toBe("Studio Out");
    expect(s.sampleRate).toBe(48); // 48000 Hz → 48 kHz
    expect(s.bufferSize).toBe(256);
    expect(s.availableOutputs).toEqual(["Studio Out", "Headphones"]);
    expect(s.availableSampleRates).toEqual([44.1, 48]);
    expect(s.availableBufferSizes).toEqual([128, 256]);
  });

  it("rounds the sampleRate from kHz to Hz before sending", () => {
    const invokes = installHostedBridge();
    applyPrefs({ sampleRate: 44.1 });
    const call = invokes.find((i) => i.name === "audioSetSettings");
    expect(call!.params[0]).toEqual({ sampleRate: 44100 });
  });

  it("omits fields of the wrong type from the opts payload", () => {
    const invokes = installHostedBridge();
    // bufferSize as a string and outputDevice as a number must be dropped.
    applyPrefs({
      sampleRate: 48,
      bufferSize: "big" as unknown as number,
      outputDevice: 7 as unknown as string,
    });
    const call = invokes.find((i) => i.name === "audioSetSettings");
    expect(call!.params[0]).toEqual({ sampleRate: 48000 });
  });

  it("sends only the provided field (outputDevice only)", () => {
    const invokes = installHostedBridge();
    applyPrefs({ outputDevice: "Mon A" });
    const call = invokes.find((i) => i.name === "audioSetSettings");
    expect(call!.params[0]).toEqual({ outputDevice: "Mon A" });
  });

  it("does NOT call setSettings when no audio-device field is present", () => {
    const invokes = installHostedBridge();
    // Only appearance prefs → opts stays empty → the gate skips the engine call.
    applyPrefs({ theme: "midnight", autoSave: true, midiThru: true });
    expect(invokes.some((i) => i.name === "audioSetSettings")).toBe(false);
    // …but the store still hydrated the appearance prefs.
    expect(get().theme).toBe("midnight");
  });

  it("does not crash when the engine reply is undefined (no setDeviceInfo)", async () => {
    installHostedBridge(undefined);
    const before = get().outputDevice;
    applyPrefs({ outputDevice: "Phantom" });
    await Promise.resolve();
    await Promise.resolve();
    // hydratePrefs set it from the prefs; the undefined reply left it as hydrated.
    expect(get().outputDevice).toBe("Phantom");
    expect(typeof before).toBe("string");
  });
});

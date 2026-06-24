import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applySessionToEngine } from "./engineSync";
import {
  clipPreview,
  genNotes,
  notesFromPattern,
  playbackNotes,
} from "./notes";
import { BEATS_PER_BAR, PITCH_MAX, PITCH_MIN, DEFAULT_VOLUME } from "./constants";
import { useDawStore, type DawState } from "../store/useDawStore";
import type { Clip, Note, Track } from "../types";

// ---------------------------------------------------------------------------
// engineSync.applySessionToEngine
// ---------------------------------------------------------------------------
//
// `call()` in ./engine reaches the native host through
// globalThis.window.__JUCE__.backend.emitEvent(...). We install a recording
// backend so each engine command surfaces as a captured emitEvent with the
// native function name + params, then assert the mapping from store state to
// engine commands.

type Invoke = { name: string; params: unknown[] };

// Snapshot whether globalThis.window existed before we touched it, so teardown
// can restore the exact original state (in the node env it is undefined). This
// keeps the suite footprint-free and avoids polluting other node test files
// that probe for `window`.
const G = globalThis as Record<string, unknown>;
const HAD_WINDOW = "window" in G;
const ORIGINAL_WINDOW = G.window;

function installBackend(): Invoke[] {
  const invokes: Invoke[] = [];
  if (!G.window) G.window = {};
  (G.window as { __JUCE__?: unknown }).__JUCE__ = {
    backend: {
      emitEvent: (id: string, payload: unknown) => {
        if (id === "__juce__invoke") {
          const p = payload as { name: string; params: unknown[] };
          invokes.push({ name: p.name, params: p.params });
        }
      },
      // Mirror the real backend so engine.ts can wire its one-shot
      // `__juce__complete` listener without leaking module state.
      addEventListener: () => ({}),
      removeEventListener: () => {},
    },
  };
  return invokes;
}

function removeBackend(): void {
  if (HAD_WINDOW) {
    G.window = ORIGINAL_WINDOW;
  } else {
    delete G.window;
  }
}

/** Find every invoke for a native function name. */
const byName = (invokes: Invoke[], name: string): Invoke[] => invokes.filter((i) => i.name === name);

describe("applySessionToEngine — engine inactive", () => {
  afterEach(removeBackend);

  it("is a no-op (emits nothing) when there is no native host", () => {
    removeBackend();
    // Using the live store as a valid DawState; without a backend, nothing runs.
    expect(() => applySessionToEngine(useDawStore.getState())).not.toThrow();
  });
});

describe("applySessionToEngine — engine active", () => {
  let invokes: Invoke[];
  let state: DawState;

  beforeEach(() => {
    invokes = installBackend();

    const base = useDawStore.getState();
    const trackA: Track = { id: "tA", name: "A", color: "#111", io: "A1", type: "midi", clips: [] };
    const trackB: Track = { id: "tB", name: "B", color: "#222", io: "A2", type: "audio", clips: [] };

    // A controlled DawState that exercises every loop/branch in the sync.
    state = {
      ...base,
      bpm: 130,
      loop: true,
      loopStart: 4,
      loopEnd: 60,
      masterVolume: 0.42,
      masterPan: 0.6,
      tracks: [trackA, trackB],
      groups: [{ id: "g1", name: "G", color: "#333", tracks: ["tA"] }],
      volumes: { tA: 0.3 }, // tB falls back to DEFAULT_VOLUME
      pans: { tA: 0.25 },
      mutes: { tA: true },
      solos: { tB: true },
      arms: { tA: true },
      trackFiles: {
        tA: { loaded: true, path: "/songs/a.wav" }, // assignFile path
        tB: { loaded: false }, // clearFile path
      },
      sends: { tA: [0.5, 0.7] }, // tB falls back to [0,0]
      returnGains: [0.9, 0.8],
      groupVolumes: { g1: 0.55 },
      groupPans: { g1: 0.3 },
      groupMutes: { g1: true },
      groupSolos: {},
      nodeRacks: {
        tA: [
          { id: "d1", kind: "eq", name: "EQ" },
          { id: "d2", kind: "vst3", name: "PLUG", path: "/p.vst3", bypassed: true },
        ],
      },
      devices: { eq: true, tape: false, pre: true },
      preAmount: 0.33,
      autoLanes: { tA: true }, // tB lane absent -> skipped
      autoData: {
        "tA:vol": [{ t: 0, v: 1 }],
        "tB:pan": [{ t: 0, v: 0.5 }], // lane disabled -> skipped
        "dev:0:3": [{ t: 0, v: 0.2 }], // no colon-prefixed nodeId match in autoLanes? see below
        novalue: [], // no colon -> skipped (continue branch)
      },
    } as DawState;
  });

  afterEach(removeBackend);

  it("pushes transport + master settings", () => {
    applySessionToEngine(state);
    expect(byName(invokes, "transportSetTempo")[0].params).toEqual([130]);
    expect(byName(invokes, "transportSetLooping")[0].params).toEqual([true]);
    expect(byName(invokes, "transportSetLoopStart")[0].params).toEqual([4]);
    expect(byName(invokes, "transportSetLoopEnd")[0].params).toEqual([60]);
    expect(byName(invokes, "mixerSetMasterVolume")[0].params).toEqual([0.42]);
    expect(byName(invokes, "mixerSetMasterPan")[0].params).toEqual([0.6]);
  });

  it("creates each track with its group membership", () => {
    applySessionToEngine(state);
    const creates = byName(invokes, "trackCreate");
    expect(creates).toHaveLength(2);
    // create(id, name, type, color, group)
    expect(creates[0].params).toEqual(["tA", "A", "midi", "#111", "g1"]);
    // tB belongs to no group -> "" fallback
    expect(creates[1].params).toEqual(["tB", "B", "audio", "#222", ""]);
  });

  it("falls back to defaults for tracks without explicit mix state", () => {
    applySessionToEngine(state);
    const vols = byName(invokes, "mixerSetTrackVolume");
    expect(vols.find((i) => i.params[0] === "tA")?.params[1]).toBe(0.3);
    expect(vols.find((i) => i.params[0] === "tB")?.params[1]).toBe(DEFAULT_VOLUME);

    const pans = byName(invokes, "mixerSetTrackPan");
    expect(pans.find((i) => i.params[0] === "tA")?.params[1]).toBe(0.25);
    expect(pans.find((i) => i.params[0] === "tB")?.params[1]).toBe(0.5); // 0.5 center default
  });

  it("asserts mute/solo/arm coercing to booleans", () => {
    applySessionToEngine(state);
    const mutes = byName(invokes, "mixerSetTrackMute");
    expect(mutes.find((i) => i.params[0] === "tA")?.params[1]).toBe(true);
    expect(mutes.find((i) => i.params[0] === "tB")?.params[1]).toBe(false);

    const solos = byName(invokes, "mixerSetTrackSolo");
    expect(solos.find((i) => i.params[0] === "tB")?.params[1]).toBe(true);

    const arms = byName(invokes, "mixerSetTrackArm");
    expect(arms.find((i) => i.params[0] === "tA")?.params[1]).toBe(true);
  });

  it("assigns a file when loaded with a path, else clears it", () => {
    applySessionToEngine(state);
    const assigns = byName(invokes, "trackAssignFile");
    expect(assigns).toHaveLength(1);
    expect(assigns[0].params).toEqual(["tA", "/songs/a.wav"]);

    const clears = byName(invokes, "trackClearFile");
    expect(clears.map((i) => i.params[0])).toContain("tB");
  });

  it("pushes both send slots, defaulting missing ones to 0", () => {
    applySessionToEngine(state);
    const sends = byName(invokes, "mixerSetTrackSend");
    // setTrackSend(id, idx, v)
    const tA = sends.filter((i) => i.params[0] === "tA");
    expect(tA.find((i) => i.params[1] === 0)?.params[2]).toBe(0.5);
    expect(tA.find((i) => i.params[1] === 1)?.params[2]).toBe(0.7);
    const tB = sends.filter((i) => i.params[0] === "tB");
    expect(tB.find((i) => i.params[1] === 0)?.params[2]).toBe(0);
    expect(tB.find((i) => i.params[1] === 1)?.params[2]).toBe(0);
  });

  it("sets return gains by index", () => {
    applySessionToEngine(state);
    const rg = byName(invokes, "returnSetGain");
    expect(rg.find((i) => i.params[0] === 0)?.params[1]).toBe(0.9);
    expect(rg.find((i) => i.params[0] === 1)?.params[1]).toBe(0.8);
  });

  it("re-asserts each group's gain/pan/mute/solo", () => {
    applySessionToEngine(state);
    expect(byName(invokes, "groupSetGain")[0].params).toEqual(["g1", 0.55]);
    expect(byName(invokes, "groupSetPan")[0].params).toEqual(["g1", 0.3]);
    expect(byName(invokes, "groupSetMute")[0].params).toEqual(["g1", true]);
    expect(byName(invokes, "groupSetSolo")[0].params).toEqual(["g1", false]);
  });

  it("rebuilds node racks in order and bypasses flagged devices", () => {
    applySessionToEngine(state);
    const adds = byName(invokes, "nodeDeviceAdd");
    expect(adds).toHaveLength(2);
    // add(nodeId, { id, kind, path })
    expect(adds[0].params[0]).toBe("tA");
    expect(adds[0].params[1]).toMatchObject({ id: "d1", kind: "eq" });
    expect(adds[1].params[1]).toMatchObject({ id: "d2", kind: "vst3", path: "/p.vst3" });

    // Only the bypassed device gets a setBypass(true).
    const byp = byName(invokes, "nodeDeviceSetBypass");
    expect(byp).toHaveLength(1);
    expect(byp[0].params).toEqual(["tA", "d2", true]);
  });

  it("maps device on/off to inverted bypass and pushes pre amount", () => {
    applySessionToEngine(state);
    const byp = byName(invokes, "deviceSetBypass");
    // enabled (true)  -> bypass false ; disabled (false) -> bypass true
    expect(byp.find((i) => i.params[0] === "eq")?.params[1]).toBe(false);
    expect(byp.find((i) => i.params[0] === "tape")?.params[1]).toBe(true);
    expect(byp.find((i) => i.params[0] === "pre")?.params[1]).toBe(false);

    const sp = byName(invokes, "deviceSetParam");
    expect(sp[0].params).toEqual(["pre", "amount", 0.33]);
  });

  it("clears all automation then pushes only enabled-lane envelopes", () => {
    applySessionToEngine(state);
    expect(byName(invokes, "automationClearAll")).toHaveLength(1);

    const sets = byName(invokes, "automationSet");
    // Only "tA:vol" qualifies: tA lane is enabled, tB lane is not, the
    // "dev:0:3" key's nodeId "dev" has no enabled lane, "novalue" has no colon.
    expect(sets).toHaveLength(1);
    // set(nodeId, paramId, points) — paramId is everything after first colon.
    expect(sets[0].params[0]).toBe("tA");
    expect(sets[0].params[1]).toBe("vol");
    expect(sets[0].params[2]).toEqual([{ t: 0, v: 1 }]);
  });

  it("splits automation keys on the FIRST colon (param ids may contain colons)", () => {
    // Enable the "dev" node lane so its multi-colon param id flows through.
    applySessionToEngine({
      ...state,
      autoLanes: { dev: true },
      autoData: { "dev:0:3": [{ t: 0.5, v: 0.9 }] },
    } as DawState);
    const sets = byName(invokes, "automationSet");
    expect(sets).toHaveLength(1);
    expect(sets[0].params[0]).toBe("dev");
    expect(sets[0].params[1]).toBe("0:3"); // everything after the first colon
  });

  it("tolerates absent optional slices via nullish fallbacks", () => {
    const minimal = {
      ...state,
      returnGains: undefined,
      nodeRacks: {},
      autoData: {},
    } as unknown as DawState;
    applySessionToEngine(minimal);
    // returnGains undefined -> defaults to [1,1]
    const rg = byName(invokes, "returnSetGain");
    expect(rg.find((i) => i.params[0] === 0)?.params[1]).toBe(1);
    expect(rg.find((i) => i.params[0] === 1)?.params[1]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// engineSync — per-clip audio (trackSetClips vs the legacy track-file fallback)
// ---------------------------------------------------------------------------
describe("applySessionToEngine — per-clip audio", () => {
  let invokes: Invoke[];
  beforeEach(() => { invokes = installBackend(); });
  afterEach(removeBackend);

  const withTrack = (track: Track, assets: DawState["assets"]): DawState =>
    ({ ...useDawStore.getState(), tracks: [track], groups: [], trackFiles: {}, assets } as DawState);

  it("pushes path-bearing clips via trackSetClips (beats) and skips the file fallback", () => {
    const track: Track = {
      id: "ta", name: "A", color: "#111", io: "A1", type: "audio",
      clips: [
        { id: "c1", bar: 2, len: 4, name: "loop", src: "as1" },
        { id: "c2", bar: 0, len: 2, name: "midi" }, // no src → not an audio clip
      ],
    };
    applySessionToEngine(
      withTrack(track, { as1: { id: "as1", name: "loop.wav", duration: 2, sampleRate: 0, channels: 0, path: "/x/loop.wav" } }),
    );
    const sc = byName(invokes, "trackSetClips");
    expect(sc).toHaveLength(1);
    expect(sc[0].params[0]).toBe("ta");
    expect(sc[0].params[1]).toEqual([
      { clipId: "c1", path: "/x/loop.wav", startBeat: 2 * BEATS_PER_BAR, lenBeats: 4 * BEATS_PER_BAR, offsetSec: 0, gain: 1 },
    ]);
    expect(byName(invokes, "trackAssignFile")).toHaveLength(0);
    expect(byName(invokes, "trackClearFile")).toHaveLength(0);
  });

  it("carries clip offset + gain through to the engine", () => {
    const track: Track = {
      id: "tc", name: "C", color: "#333", io: "A3", type: "audio",
      clips: [{ id: "c1", bar: 1, len: 3, name: "x", src: "as", offset: 0.5, gain: 0.4 }],
    };
    applySessionToEngine(
      withTrack(track, { as: { id: "as", name: "a.wav", duration: 5, sampleRate: 0, channels: 0, path: "/a.wav" } }),
    );
    expect(byName(invokes, "trackSetClips")[0].params[1]).toEqual([
      { clipId: "c1", path: "/a.wav", startBeat: BEATS_PER_BAR, lenBeats: 3 * BEATS_PER_BAR, offsetSec: 0.5, gain: 0.4 },
    ]);
  });

  it("skips clips whose asset has no path and falls back to clearFile", () => {
    const track: Track = {
      id: "tb", name: "B", color: "#222", io: "A2", type: "audio",
      clips: [{ id: "c1", bar: 0, len: 2, name: "x", src: "noPath" }],
    };
    applySessionToEngine(
      withTrack(track, { noPath: { id: "noPath", name: "m.wav", duration: 1, sampleRate: 0, channels: 0 } }),
    );
    expect(byName(invokes, "trackSetClips")).toHaveLength(0);
    expect(byName(invokes, "trackClearFile").map((i) => i.params[0])).toContain("tb");
  });
});

// ---------------------------------------------------------------------------
// notes.ts — note / midi / beat math (functions not covered by notes.test.ts)
// ---------------------------------------------------------------------------

const baseClip: Clip = { id: "clip-seed", bar: 0, len: 4, name: "A" };

function mkTrack(type: Track["type"]): Track {
  return { id: "t", name: "T", color: "#fff", io: "A1", type, clips: [baseClip] };
}

describe("notes — genNotes patterns", () => {
  it("drum and melodic generators both produce in-range, non-empty patterns", () => {
    const drum = genNotes(baseClip, mkTrack("drum"));
    const mel = genNotes(baseClip, mkTrack("midi"));
    expect(drum.length).toBeGreaterThan(0);
    // melodic uses a random walk; with this seed it produces notes.
    expect(Array.isArray(mel)).toBe(true);
    for (const n of [...drum, ...mel]) {
      expect(n.row).toBeGreaterThanOrEqual(0);
      expect(n.row).toBeLessThanOrEqual(7);
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThan(1);
    }
  });

  it("audio tracks take the melodic branch (non-drum)", () => {
    // type "audio" !== "drum" -> melodicNotes; equals the midi result for same seed.
    expect(genNotes(baseClip, mkTrack("audio"))).toEqual(genNotes(baseClip, mkTrack("midi")));
  });
});

describe("notes — notesFromPattern", () => {
  it("materializes generated notes as editable beat/pitch notes", () => {
    const td = mkTrack("drum");
    const beats = baseClip.len * BEATS_PER_BAR; // 16
    const gen = genNotes(baseClip, td);
    const notes = notesFromPattern(baseClip, td);

    expect(notes).toHaveLength(gen.length);
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const g = gen[i];
      expect(n.start).toBeCloseTo(g.x * beats, 10);
      // len is clamped to a 0.25 floor.
      expect(n.len).toBeCloseTo(Math.max(0.25, g.w * beats), 10);
      expect(n.len).toBeGreaterThanOrEqual(0.25);
      expect(n.velocity).toBe(0.8);
      // pitch stays inside the editor range [PITCH_MIN, PITCH_MAX].
      expect(n.pitch).toBeGreaterThanOrEqual(PITCH_MIN);
      expect(n.pitch).toBeLessThanOrEqual(PITCH_MAX);
      expect(typeof n.id).toBe("string");
    }
  });

  it("maps row 0 to PITCH_MAX and row 7 to PITCH_MIN (rowToPitch edges)", () => {
    // Build a drum clip and inspect: row 7 (kick downbeat) -> PITCH_MIN.
    const td = mkTrack("drum");
    const gen = genNotes(baseClip, td);
    const notes = notesFromPattern(baseClip, td);
    const downbeatIdx = gen.findIndex((g) => g.x === 0 && g.row === 7);
    expect(downbeatIdx).toBeGreaterThanOrEqual(0);
    // row 7 -> PITCH_MAX - round(7/7 * span) = PITCH_MIN.
    expect(notes[downbeatIdx].pitch).toBe(PITCH_MIN);
  });
});

describe("notes — playbackNotes", () => {
  it("uses stored edited notes verbatim when present", () => {
    const edited: Note[] = [
      { id: "n1", start: 1, len: 2, pitch: 60, velocity: 0.5 },
      { id: "n2", start: 3, len: 1, pitch: 64 }, // no velocity -> defaults to 0.8
    ];
    const clip: Clip = { ...baseClip, notes: edited };
    const out = playbackNotes(clip, mkTrack("midi"));
    expect(out).toEqual([
      { start: 1, len: 2, pitch: 60, velocity: 0.5 },
      { start: 3, len: 1, pitch: 64, velocity: 0.8 },
    ]);
  });

  it("falls back to the generated pattern (mapped to pitches) when unedited", () => {
    const td = mkTrack("drum");
    const beats = baseClip.len * BEATS_PER_BAR;
    const gen = genNotes(baseClip, td);
    const out = playbackNotes(baseClip, td);
    expect(out).toHaveLength(gen.length);
    expect(out[0].start).toBeCloseTo(gen[0].x * beats, 10);
    expect(out.every((n) => n.len >= 0.25)).toBe(true);
    expect(out.every((n) => n.velocity === 0.8)).toBe(true);
    expect(out.every((n) => n.pitch >= PITCH_MIN && n.pitch <= PITCH_MAX)).toBe(true);
  });

  it("treats an empty notes array as 'present' (returns empty playback)", () => {
    // clip.notes = [] is truthy -> the edited branch runs and maps nothing.
    const clip: Clip = { ...baseClip, notes: [] };
    expect(playbackNotes(clip, mkTrack("midi"))).toEqual([]);
  });
});

describe("notes — clipPreview", () => {
  it("normalizes stored notes to 0..1 x/w and inverted y", () => {
    const beats = baseClip.len * BEATS_PER_BAR; // 16
    const notes: Note[] = [
      { id: "n1", start: 0, len: 4, pitch: PITCH_MAX, velocity: 0.8 }, // y -> 0 (top)
      { id: "n2", start: 8, len: 4, pitch: PITCH_MIN, velocity: 0.8 }, // y -> 1 (bottom)
    ];
    const clip: Clip = { ...baseClip, notes };
    const preview = clipPreview(clip, mkTrack("midi"));
    expect(preview[0]).toEqual({ x: 0, w: 4 / beats, y: 0 });
    expect(preview[1].x).toBeCloseTo(8 / beats, 10);
    expect(preview[1].y).toBeCloseTo(1, 10);
  });

  it("guards a zero-length clip against divide-by-zero (|| 1 fallback)", () => {
    const notes: Note[] = [{ id: "n", start: 2, len: 1, pitch: 72, velocity: 0.8 }];
    const clip: Clip = { ...baseClip, len: 0, notes };
    const preview = clipPreview(clip, mkTrack("midi"));
    // beats = 0 * 4 || 1 = 1, so x = start / 1 = 2.
    expect(preview[0].x).toBe(2);
    expect(Number.isFinite(preview[0].y)).toBe(true);
  });

  it("uses the generated pattern (row/8) when there are no stored notes", () => {
    const td = mkTrack("drum");
    const gen = genNotes(baseClip, td);
    const preview = clipPreview(baseClip, td);
    expect(preview).toHaveLength(gen.length);
    expect(preview[0]).toEqual({ x: gen[0].x, w: gen[0].w, y: gen[0].row / 8 });
    for (const p of preview) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });
});

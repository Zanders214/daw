import { describe, it, expect } from "vitest";
import {
  effectiveTrackGain,
  effectiveGroupGain,
  groupOfTrack,
  panToStereo,
  preHpfHz,
  mixSignature,
  getTrackInput,
  readLevels,
  syncGraph,
  teardown,
} from "./mixerGraph";
import type { DawState } from "../store/useDawStore";
import type { Group, Track } from "../types";
import { DEFAULT_VOLUME } from "./constants";

const track = (id: string): Track => ({ id, name: id, color: "#fff", io: "A1", type: "midi", clips: [] });
const group = (id: string, tracks: string[]): Group => ({ id, name: id, color: "#fff", tracks });

/** Minimal store snapshot covering only the fields the pure helpers read. */
const st = (o: Partial<DawState> = {}): DawState =>
  ({
    tracks: [],
    groups: [],
    volumes: {},
    pans: {},
    mutes: {},
    solos: {},
    groupVolumes: {},
    groupPans: {},
    groupMutes: {},
    groupSolos: {},
    sends: {},
    returnGains: [1, 1],
    masterVolume: 1,
    masterPan: 0.5,
    devices: { eq: true, tape: false, pre: true },
    preAmount: 0.62,
    nodeRacks: {},
    playhead: 0,
    ...o,
  }) as DawState;

describe("groupOfTrack", () => {
  it("returns the owning group's id when a track is a member", () => {
    const s = st({ groups: [group("g1", ["a", "b"]), group("g2", ["c", "d"])] });
    expect(groupOfTrack(s, "a")).toBe("g1");
    expect(groupOfTrack(s, "b")).toBe("g1");
    expect(groupOfTrack(s, "d")).toBe("g2");
  });

  it("returns null for an ungrouped track and for empty groups", () => {
    expect(groupOfTrack(st({ groups: [group("g1", ["a"])] }), "z")).toBeNull();
    expect(groupOfTrack(st(), "a")).toBeNull();
  });

  it("returns the first matching group when a track appears in two", () => {
    const s = st({ groups: [group("g1", ["x"]), group("g2", ["x"])] });
    expect(groupOfTrack(s, "x")).toBe("g1");
  });
});

describe("effectiveTrackGain", () => {
  it("uses the per-track volume when set", () => {
    expect(effectiveTrackGain(st({ volumes: { a: 0.42 } }), "a")).toBe(0.42);
  });

  it("falls back to DEFAULT_VOLUME when no volume is recorded", () => {
    expect(effectiveTrackGain(st(), "a")).toBe(DEFAULT_VOLUME);
    expect(effectiveTrackGain(st(), "a")).toBe(0.8);
  });

  it("returns 0 when the track is muted, regardless of volume", () => {
    expect(effectiveTrackGain(st({ mutes: { a: true }, volumes: { a: 0.9 } }), "a")).toBe(0);
  });

  it("silences non-soloed tracks when any track is soloed", () => {
    const s = st({ solos: { b: true }, volumes: { a: 0.9 } });
    expect(effectiveTrackGain(s, "a")).toBe(0);
  });

  it("passes through the volume for the soloed track itself", () => {
    const s = st({ solos: { a: true }, volumes: { a: 0.9 } });
    expect(effectiveTrackGain(s, "a")).toBe(0.9);
  });

  it("does not engage solo silencing when all solo flags are falsy", () => {
    // solos has keys but all false → anySolo is false → normal gain
    const s = st({ solos: { a: false, b: false }, volumes: { a: 0.6 } });
    expect(effectiveTrackGain(s, "a")).toBe(0.6);
  });

  it("mute beats solo (muted soloed track is still silent)", () => {
    const s = st({ mutes: { a: true }, solos: { a: true }, volumes: { a: 0.5 } });
    expect(effectiveTrackGain(s, "a")).toBe(0);
  });
});

describe("effectiveGroupGain", () => {
  it("defaults to unity gain (1) when no group volume is set", () => {
    expect(effectiveGroupGain(st(), "g")).toBe(1);
  });

  it("uses the recorded group volume", () => {
    expect(effectiveGroupGain(st({ groupVolumes: { g: 0.25 } }), "g")).toBe(0.25);
  });

  it("returns 0 for a muted group", () => {
    expect(effectiveGroupGain(st({ groupMutes: { g: true }, groupVolumes: { g: 0.8 } }), "g")).toBe(0);
  });

  it("silences a non-soloed group when another group is soloed", () => {
    expect(effectiveGroupGain(st({ groupSolos: { other: true } }), "g")).toBe(0);
  });

  it("passes through the soloed group's own gain", () => {
    const s = st({ groupSolos: { g: true }, groupVolumes: { g: 0.7 } });
    expect(effectiveGroupGain(s, "g")).toBe(0.7);
  });

  it("ignores all-false group solo flags", () => {
    const s = st({ groupSolos: { g: false, h: false }, groupVolumes: { g: 0.55 } });
    expect(effectiveGroupGain(s, "g")).toBe(0.55);
  });
});

describe("panToStereo", () => {
  it("maps the 0..1 UI range onto the -1..1 StereoPanner range", () => {
    expect(panToStereo(0)).toBe(-1);
    expect(panToStereo(0.5)).toBe(0);
    expect(panToStereo(1)).toBe(1);
    expect(panToStereo(0.25)).toBe(-0.5);
    expect(panToStereo(0.75)).toBe(0.5);
  });
});

describe("preHpfHz", () => {
  it("is 20 Hz at amount 0 (base cutoff)", () => {
    expect(preHpfHz(0)).toBe(20);
  });

  it("reaches ~800 Hz at amount 1", () => {
    // 20 * 40 ** (1 ** 1.5) = 20 * 40 = 800
    expect(preHpfHz(1)).toBeCloseTo(800);
  });

  it("is monotonically increasing with the amount", () => {
    expect(preHpfHz(0.25)).toBeLessThan(preHpfHz(0.5));
    expect(preHpfHz(0.5)).toBeLessThan(preHpfHz(0.75));
    expect(preHpfHz(0.62)).toBeGreaterThan(preHpfHz(0.62 - 0.01));
  });

  it("matches the closed-form 20 * 40 ** (amount ** 1.5)", () => {
    const amount = 0.62;
    expect(preHpfHz(amount)).toBeCloseTo(20 * 40 ** (amount ** 1.5));
  });
});

describe("mixSignature", () => {
  it("is stable across the per-frame playhead and meter levels", () => {
    const base = st({ tracks: [track("a")], volumes: { a: 0.5 } });
    const moved = st({ tracks: [track("a")], volumes: { a: 0.5 }, playhead: 99 });
    expect(mixSignature(base)).toBe(mixSignature(moved));
  });

  it("changes when a track volume changes", () => {
    const base = st({ tracks: [track("a")], volumes: { a: 0.5 } });
    const louder = st({ tracks: [track("a")], volumes: { a: 0.7 } });
    expect(mixSignature(base)).not.toBe(mixSignature(louder));
  });

  it("changes when group membership changes", () => {
    const a = st({ groups: [group("g", ["a"])] });
    const b = st({ groups: [group("g", ["a", "b"])] });
    expect(mixSignature(a)).not.toBe(mixSignature(b));
  });

  it("changes when a send level changes", () => {
    const a = st({ tracks: [track("a")], sends: { a: [0.1, 0] } });
    const b = st({ tracks: [track("a")], sends: { a: [0.4, 0] } });
    expect(mixSignature(a)).not.toBe(mixSignature(b));
  });

  it("changes when master volume / pan change", () => {
    expect(mixSignature(st({ masterVolume: 1 }))).not.toBe(mixSignature(st({ masterVolume: 0.5 })));
    expect(mixSignature(st({ masterPan: 0.5 }))).not.toBe(mixSignature(st({ masterPan: 0.2 })));
  });

  it("changes when house devices toggle or the pre amount moves", () => {
    const eqOn = st({ devices: { eq: true, tape: false, pre: true } });
    const eqOff = st({ devices: { eq: false, tape: false, pre: true } });
    expect(mixSignature(eqOn)).not.toBe(mixSignature(eqOff));
    expect(mixSignature(st({ preAmount: 0.62 }))).not.toBe(mixSignature(st({ preAmount: 0.4 })));
  });

  it("changes when return gains change", () => {
    expect(mixSignature(st({ returnGains: [1, 1] }))).not.toBe(mixSignature(st({ returnGains: [1, 0.5] })));
  });

  it("incorporates the insert-rack signature (kinds + bypass state)", () => {
    const racked = st({
      nodeRacks: { a: [{ id: "d1", kind: "eq", name: "EQ", bypassed: false }] },
    });
    const bypassed = st({
      nodeRacks: { a: [{ id: "d1", kind: "eq", name: "EQ", bypassed: true }] },
    });
    const empty = st();
    expect(mixSignature(racked)).not.toBe(mixSignature(empty));
    // toggling bypass changes the signature (so the FX chain rebuilds)
    expect(mixSignature(racked)).not.toBe(mixSignature(bypassed));
  });

  it("is deterministic for identical snapshots", () => {
    const a = st({ tracks: [track("a"), track("b")], volumes: { a: 0.3, b: 0.9 } });
    const b = st({ tracks: [track("a"), track("b")], volumes: { a: 0.3, b: 0.9 } });
    expect(mixSignature(a)).toBe(mixSignature(b));
  });

  it("returns valid JSON", () => {
    const sig = mixSignature(st({ tracks: [track("a")] }));
    expect(() => JSON.parse(sig)).not.toThrow();
    const parsed = JSON.parse(sig) as { t: string[] };
    expect(parsed.t).toEqual(["a"]);
  });
});

describe("AudioContext-guarded exports (no AudioContext under node)", () => {
  it("getTrackInput returns null without an AudioContext", () => {
    expect(getTrackInput("a")).toBeNull();
  });

  it("readLevels returns null when the graph was never built", () => {
    expect(readLevels()).toBeNull();
  });

  it("syncGraph is a no-op (returns undefined, does not throw) without an AudioContext", () => {
    const s = st({
      tracks: [track("a"), track("b")],
      groups: [group("g", ["a"])],
      volumes: { a: 0.5 },
      nodeRacks: { a: [{ id: "d1", kind: "eq", name: "EQ", bypassed: false }] },
    });
    expect(syncGraph(s)).toBeUndefined();
    // still no graph → readLevels stays null
    expect(readLevels()).toBeNull();
  });

  it("teardown is safe to call when nothing was ever built", () => {
    expect(() => teardown()).not.toThrow();
    expect(readLevels()).toBeNull();
  });
});

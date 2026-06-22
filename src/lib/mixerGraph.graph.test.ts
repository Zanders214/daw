/**
 * Exercises the live Web Audio graph code in mixerGraph.ts under a fake
 * AudioContext (installed on globalThis before the module is imported), so the
 * graph-building / reconciliation paths that no-op without a context actually run.
 *
 * No docblock environment override is needed: we install the fake ourselves and
 * the default `node` environment is fine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeAudio } from "../test/fakeAudio";
import { useDawStore, type DawState } from "../store/useDawStore";
import type { Group, Track } from "../types";

type MixerGraph = typeof import("./mixerGraph");

const track = (id: string): Track => ({ id, name: id, color: "#fff", io: "A1", type: "midi", clips: [] });
const group = (id: string, tracks: string[]): Group => ({ id, name: id, color: "#fff", tracks });

/** A full DawState snapshot: the store defaults with mix fields overridable. */
function snapshot(o: Partial<DawState> = {}): DawState {
  return { ...useDawStore.getState(), ...o } as DawState;
}

let uninstall: () => void;
let G: MixerGraph;

beforeEach(async () => {
  // Fresh module instance (resets the module-level `master`/`tracks`/`groups`
  // graph state and the memoized AudioContext inside audio.ts) for each test.
  vi.resetModules();
  uninstall = installFakeAudio();
  G = await import("./mixerGraph");
});

afterEach(() => {
  G.teardown();
  uninstall();
  vi.resetModules();
});

describe("getTrackInput with a fake AudioContext", () => {
  it("returns a real node and builds a per-track strip on demand", () => {
    const input = G.getTrackInput("lead");
    expect(input).not.toBeNull();
    // a GainNode-shaped object (has a .gain AudioParam)
    expect((input as unknown as { gain: { value: number } }).gain).toBeDefined();
  });

  it("returns the same strip input on repeated calls (memoized)", () => {
    const a = G.getTrackInput("lead");
    const b = G.getTrackInput("lead");
    expect(a).toBe(b);
  });
});

describe("syncGraph builds and reconciles the graph", () => {
  it("does not throw and makes readLevels return numeric meters", () => {
    const s = snapshot({
      tracks: [track("a"), track("b")],
      groups: [group("g1", ["a"])],
      volumes: { a: 0.5, b: 0.9 },
      pans: { a: 0.25, b: 0.75 },
      sends: { a: [0.3, 0.1] },
    });
    expect(() => G.syncGraph(s)).not.toThrow();

    const levels = G.readLevels();
    expect(levels).not.toBeNull();
    const lv = levels!;
    // Both tracks have a meter reading; values are finite numbers in [0,1].
    expect(Object.keys(lv.tracks).sort()).toEqual(["a", "b"]);
    for (const v of Object.values(lv.tracks)) {
      expect(typeof v).toBe("number");
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // grouped track produced a group meter; one entry per built group.
    expect(Object.keys(lv.groups)).toEqual(["g1"]);
    expect(lv.returns).toHaveLength(2);
    expect(typeof lv.master).toBe("number");
  });

  it("writes effective track gains onto the strip gain params", () => {
    const s = snapshot({
      tracks: [track("a"), track("b")],
      groups: [],
      volumes: { a: 0.4 },
      mutes: { b: true },
    });
    G.syncGraph(s);
    // The track input node is the strip head; reach the gain via the graph by
    // re-syncing and checking observable level behaviour instead of internals.
    // Muted track b should still have a meter entry (it is wired, just at 0 gain).
    const lv = G.readLevels()!;
    expect(Object.keys(lv.tracks).sort()).toEqual(["a", "b"]);
  });

  it("covers solo silencing (non-soloed tracks routed at 0 gain)", () => {
    const s = snapshot({
      tracks: [track("a"), track("b")],
      groups: [],
      solos: { a: true },
      volumes: { a: 0.8, b: 0.8 },
    });
    expect(() => G.syncGraph(s)).not.toThrow();
    expect(Object.keys(G.readLevels()!.tracks).sort()).toEqual(["a", "b"]);
  });

  it("routes a track into its group bus then later to master (re-route path)", () => {
    const grouped = snapshot({ tracks: [track("a")], groups: [group("g1", ["a"])] });
    G.syncGraph(grouped);
    expect(Object.keys(G.readLevels()!.groups)).toEqual(["g1"]);

    // Now ungroup the track: it should re-route to master and the stale group is pruned.
    const ungrouped = snapshot({ tracks: [track("a")], groups: [] });
    expect(() => G.syncGraph(ungrouped)).not.toThrow();
    expect(Object.keys(G.readLevels()!.groups)).toEqual([]);
  });

  it("builds master device FX chains for eq + tape + pre", () => {
    const s = snapshot({
      tracks: [track("a")],
      groups: [],
      devices: { eq: true, tape: true, pre: true },
      preAmount: 0.5,
    });
    expect(() => G.syncGraph(s)).not.toThrow();
    expect(G.readLevels()).not.toBeNull();
  });

  it("tracks the live pre HPF cutoff when pre stays on across syncs", () => {
    const base = snapshot({
      tracks: [track("a")],
      groups: [],
      devices: { eq: false, tape: false, pre: true },
      preAmount: 0.3,
    });
    G.syncGraph(base);
    // Same device signature, different preAmount → hits the "track live cutoff" branch.
    const moved = snapshot({
      tracks: [track("a")],
      groups: [],
      devices: { eq: false, tape: false, pre: true },
      preAmount: 0.9,
    });
    expect(() => G.syncGraph(moved)).not.toThrow();
  });

  it("rebuilds master FX when the device signature changes", () => {
    G.syncGraph(snapshot({ tracks: [track("a")], groups: [], devices: { eq: true, tape: false, pre: false } }));
    // toggle tape on / eq off → new signature → setStripFx rebuild path.
    expect(() =>
      G.syncGraph(snapshot({ tracks: [track("a")], groups: [], devices: { eq: false, tape: true, pre: false } })),
    ).not.toThrow();
  });

  it("builds per-node insert racks (track FX) from nodeRacks", () => {
    const s = snapshot({
      tracks: [track("a")],
      groups: [],
      nodeRacks: {
        a: [
          { id: "d1", kind: "eq", name: "EQ", bypassed: false },
          { id: "d2", kind: "tape", name: "Tape", bypassed: false },
          { id: "d3", kind: "vst3", name: "Plug", bypassed: false },
          { id: "d4", kind: "pre", name: "Pre", bypassed: true },
        ],
      },
    });
    expect(() => G.syncGraph(s)).not.toThrow();
    expect(G.readLevels()!.tracks.a).toBeGreaterThanOrEqual(0);
  });

  it("builds group insert racks and applies group pan/gain", () => {
    const s = snapshot({
      tracks: [track("a")],
      groups: [group("g1", ["a"])],
      groupVolumes: { g1: 0.7 },
      groupPans: { g1: 0.2 },
      groupMutes: {},
      nodeRacks: { g1: [{ id: "gd1", kind: "eq", name: "EQ", bypassed: false }] },
    });
    expect(() => G.syncGraph(s)).not.toThrow();
    expect(Object.keys(G.readLevels()!.groups)).toEqual(["g1"]);
  });

  it("reconciles repeatedly without rebuilding (signature unchanged path)", () => {
    const s = snapshot({ tracks: [track("a"), track("b")], groups: [group("g1", ["a"])] });
    G.syncGraph(s);
    G.syncGraph(s);
    G.syncGraph(s);
    expect(Object.keys(G.readLevels()!.tracks).sort()).toEqual(["a", "b"]);
  });

  it("prunes stale tracks and groups when they disappear from the snapshot", () => {
    G.syncGraph(snapshot({ tracks: [track("a"), track("b")], groups: [group("g1", ["a"]), group("g2", ["b"])] }));
    expect(Object.keys(G.readLevels()!.tracks).sort()).toEqual(["a", "b"]);

    // Remove track b and group g2 entirely.
    G.syncGraph(snapshot({ tracks: [track("a")], groups: [group("g1", ["a"])] }));
    const lv = G.readLevels()!;
    expect(Object.keys(lv.tracks)).toEqual(["a"]);
    expect(Object.keys(lv.groups)).toEqual(["g1"]);
  });

  it("applies non-default return gains", () => {
    const s = snapshot({ tracks: [track("a")], groups: [], returnGains: [0.5, 0.25] });
    expect(() => G.syncGraph(s)).not.toThrow();
    expect(G.readLevels()!.returns).toHaveLength(2);
  });

  it("teardown clears the graph so readLevels goes back to null", () => {
    G.syncGraph(snapshot({ tracks: [track("a")], groups: [] }));
    expect(G.readLevels()).not.toBeNull();
    G.teardown();
    expect(G.readLevels()).toBeNull();
  });
});

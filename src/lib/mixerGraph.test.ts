import { describe, expect, it } from "vitest";
import {
  effectiveTrackGain,
  effectiveGroupGain,
  groupOfTrack,
  panToStereo,
  preHpfHz,
  mixSignature,
  getTrackInput,
} from "./mixerGraph";
import type { DawState } from "../store/useDawStore";
import type { Group, Track } from "../types";

const track = (id: string): Track => ({ id, name: id, color: "#fff", io: "A1", type: "midi", clips: [] });
const group = (id: string, tracks: string[]): Group => ({ id, name: id, color: "#fff", tracks });

/** Minimal store snapshot covering only the fields the pure helpers read. */
const st = (o: Partial<DawState> = {}): DawState =>
  ({
    tracks: [], groups: [],
    volumes: {}, pans: {}, mutes: {}, solos: {},
    groupVolumes: {}, groupPans: {}, groupMutes: {}, groupSolos: {},
    sends: {}, returnGains: [1, 1], masterVolume: 1, masterPan: 0.5,
    devices: { eq: true, tape: false, pre: true }, preAmount: 0.62, nodeRacks: {},
    playhead: 0,
    ...o,
  }) as DawState;

describe("mixerGraph pure helpers", () => {
  it("effectiveTrackGain honors mute, solo and the volume default", () => {
    expect(effectiveTrackGain(st({ volumes: { a: 0.5 } }), "a")).toBe(0.5);
    expect(effectiveTrackGain(st(), "a")).toBe(0.8); // DEFAULT_VOLUME
    expect(effectiveTrackGain(st({ mutes: { a: true } }), "a")).toBe(0);
    // another track soloed → this one is silenced
    expect(effectiveTrackGain(st({ solos: { b: true }, volumes: { a: 0.9 } }), "a")).toBe(0);
    expect(effectiveTrackGain(st({ solos: { a: true }, volumes: { a: 0.9 } }), "a")).toBe(0.9);
  });

  it("effectiveGroupGain honors group mute/solo (default 1)", () => {
    expect(effectiveGroupGain(st(), "g")).toBe(1);
    expect(effectiveGroupGain(st({ groupVolumes: { g: 0.3 } }), "g")).toBe(0.3);
    expect(effectiveGroupGain(st({ groupMutes: { g: true } }), "g")).toBe(0);
    expect(effectiveGroupGain(st({ groupSolos: { other: true } }), "g")).toBe(0);
  });

  it("groupOfTrack maps membership", () => {
    const s = st({ groups: [group("g1", ["a", "b"]), group("g2", ["c"])] });
    expect(groupOfTrack(s, "b")).toBe("g1");
    expect(groupOfTrack(s, "c")).toBe("g2");
    expect(groupOfTrack(s, "z")).toBeNull();
  });

  it("panToStereo and preHpfHz map as expected", () => {
    expect(panToStereo(0)).toBe(-1);
    expect(panToStereo(0.5)).toBe(0);
    expect(panToStereo(1)).toBe(1);
    expect(preHpfHz(0)).toBe(20);
    expect(preHpfHz(1)).toBeCloseTo(800);
  });

  it("mixSignature ignores the playhead but reflects mix changes", () => {
    const base = st({ tracks: [track("a")], volumes: { a: 0.5 } });
    expect(mixSignature(base)).toBe(mixSignature(st({ tracks: [track("a")], volumes: { a: 0.5 }, playhead: 99 })));
    expect(mixSignature(base)).not.toBe(mixSignature(st({ tracks: [track("a")], volumes: { a: 0.7 } })));
  });

  it("getTrackInput returns null without an AudioContext (jsdom)", () => {
    expect(getTrackInput("a")).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeAudio, FakeOfflineAudioContext, FakeAudioBuffer } from "../test/fakeAudio";
import type { Track } from "../types";

type BounceMod = typeof import("./bounce");
type StoreMod = typeof import("../store/useDawStore");
type AssetStore = typeof import("./assetStore");

let uninstall: () => void;
let B: BounceMod;
let S: StoreMod;
let AS: AssetStore;

beforeEach(async () => {
  vi.resetModules();
  uninstall = installFakeAudio();
  B = await import("./bounce");
  S = await import("../store/useDawStore");
  AS = await import("./assetStore");
});

afterEach(() => {
  AS.clearAssets();
  uninstall();
  vi.resetModules();
  vi.restoreAllMocks();
});

const midiTrack = (): Track => ({
  id: "t1",
  name: "T1",
  color: "#fff",
  io: "A1",
  type: "midi",
  clips: [{ id: "c1", bar: 0, len: 1, name: "x", notes: [{ id: "n1", start: 0, len: 1, pitch: 60, velocity: 0.8 }] }],
});

const audioTrack = (): Track => ({
  id: "t2",
  name: "T2",
  color: "#fff",
  io: "A2",
  type: "audio",
  clips: [{ id: "c2", bar: 0, len: 1, name: "loop", src: "a1" }],
});

/** Minimal, deterministic mix state (no seed tracks/groups interfering). */
function setMix(tracks: Track[], extra: Record<string, unknown> = {}) {
  S.useDawStore.setState({
    bpm: 120,
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    tracks,
    groups: [],
    volumes: {},
    pans: {},
    mutes: {},
    solos: {},
    sends: {},
    returnGains: [1, 1],
    groupVolumes: {},
    groupPans: {},
    groupMutes: {},
    groupSolos: {},
    masterVolume: 1,
    masterPan: 0.5,
    devices: { eq: false, tape: false, pre: false },
    preAmount: 0.5,
    nodeRacks: {},
    assets: {},
    ...extra,
  });
}

describe("bounceRange", () => {
  it("covers the loop region when looping is enabled", () => {
    setMix([midiTrack()], { loop: true, loopStart: 4, loopEnd: 12 });
    expect(B.bounceRange(S.useDawStore.getState())).toEqual({ startBeat: 4, endBeat: 12 });
  });

  it("covers the whole song (0 → last event) when not looping", () => {
    setMix([midiTrack()]); // one note: beat 0, length 1 → ends at beat 1
    expect(B.bounceRange(S.useDawStore.getState())).toEqual({ startBeat: 0, endBeat: 1 });
  });
});

describe("renderToBuffer", () => {
  it("returns a stereo buffer sized to the range plus the reverb/delay tail", async () => {
    setMix([midiTrack()]); // body = 1 beat @120bpm = 0.5s; + 2s tail = 2.5s
    const buf = await B.renderToBuffer(S.useDawStore.getState(), { sampleRate: 1000 });
    expect(buf.numberOfChannels).toBe(2);
    expect(buf).toHaveLength(2500); // ceil(2.5 * 1000)
  });

  it("schedules a synth voice per MIDI note and a source per audio clip", async () => {
    AS.putAsset("a1", {
      buffer: new FakeAudioBuffer(1, 1000, 1000) as unknown as AudioBuffer,
      peaks: { min: new Float32Array(1), max: new Float32Array(1), length: 1 },
    });
    setMix([midiTrack(), audioTrack()]);
    const oscSpy = vi.spyOn(FakeOfflineAudioContext.prototype, "createOscillator");
    const srcSpy = vi.spyOn(FakeOfflineAudioContext.prototype, "createBufferSource");

    await B.renderToBuffer(S.useDawStore.getState(), { sampleRate: 1000 });

    expect(oscSpy).toHaveBeenCalledTimes(1); // the one melodic note
    expect(srcSpy).toHaveBeenCalledTimes(1); // the one audio clip
  });

  it("skips audio clips whose decoded buffer isn't in memory", async () => {
    setMix([audioTrack()]); // no putAsset → buffer missing
    const srcSpy = vi.spyOn(FakeOfflineAudioContext.prototype, "createBufferSource");
    await B.renderToBuffer(S.useDawStore.getState(), { sampleRate: 1000 });
    expect(srcSpy).not.toHaveBeenCalled();
  });
});

describe("bounceToWav", () => {
  it("returns an audio/wav Blob", async () => {
    setMix([midiTrack()]);
    const blob = await B.bounceToWav(S.useDawStore.getState(), { sampleRate: 1000 });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBeGreaterThan(44); // header + some data
  });
});

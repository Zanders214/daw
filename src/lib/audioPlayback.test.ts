import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeAudio, FakeAudioContext, FakeAudioBuffer, type FakeAudioBufferSourceNode } from "../test/fakeAudio";
import type { Track } from "../types";

type PlaybackMod = typeof import("./audioPlayback");
type AssetStore = typeof import("./assetStore");
type AudioMod = typeof import("./audio");

let uninstall: () => void;
let PB: PlaybackMod;
let AS: AssetStore;
let A: AudioMod;

beforeEach(async () => {
  vi.resetModules();
  uninstall = installFakeAudio();
  PB = await import("./audioPlayback");
  AS = await import("./assetStore");
  A = await import("./audio");
});

afterEach(() => {
  AS.clearAssets();
  uninstall();
  vi.resetModules();
});

const audioTrack = (clips: Track["clips"]): Track => ({
  id: "t1",
  name: "T1",
  color: "#fff",
  io: "A1",
  type: "audio",
  clips,
});

const seedAsset = (id: string) =>
  AS.putAsset(id, {
    buffer: new FakeAudioBuffer(1, 48000, 48000) as unknown as AudioBuffer,
    peaks: { min: new Float32Array(1), max: new Float32Array(1), length: 1 },
  });

describe("buildAudioSchedule", () => {
  it("flattens src-bearing clips into timeline regions, skipping MIDI clips", () => {
    const sched = PB.buildAudioSchedule([
      audioTrack([
        { id: "c1", bar: 2, len: 4, name: "a", src: "asset1" },
        { id: "c2", bar: 0, len: 2, name: "b" }, // no src → skipped
      ]),
    ]);
    expect(sched).toHaveLength(1);
    expect(sched[0]).toMatchObject({
      trackId: "t1",
      clipId: "c1",
      src: "asset1",
      startBeat: 8, // bar 2 * 4 beats
      endBeat: 24, // + 4 bars * 4
      offsetSec: 0,
      gain: 1,
    });
  });
});

describe("AudioClipScheduler", () => {
  const sched = () =>
    PB.buildAudioSchedule([audioTrack([{ id: "c1", bar: 0, len: 4, name: "x", src: "asset1" }])]);

  it("starts a source routed to the track input when the playhead enters", () => {
    seedAsset("asset1");
    const ctx = A.ensureAudio() as unknown as FakeAudioContext;
    const dest = ctx.createGain() as unknown as AudioNode;
    const spy = vi.spyOn(ctx, "createBufferSource");

    const s = new PB.AudioClipScheduler();
    s.tick({ sched: sched(), prevBeat: -1, nextBeat: 0, playing: true, bpm: 120, destFor: () => dest });

    expect(s.liveCount).toBe(1);
    const node = spy.mock.results[0].value as FakeAudioBufferSourceNode;
    expect(node.started).toBe(true);
    expect(node.connectedTo).toContain(dest);
  });

  it("computes a mid-clip in-buffer offset on entry", () => {
    seedAsset("asset1");
    const ctx = A.ensureAudio() as unknown as FakeAudioContext;
    const spy = vi.spyOn(ctx, "createBufferSource");

    const s = new PB.AudioClipScheduler();
    // Enter at beat 8 of a clip starting at beat 0 @120bpm → 8 beats = 4 seconds.
    s.tick({ sched: sched(), prevBeat: 7, nextBeat: 8, playing: true, bpm: 120, destFor: () => null });
    const node = spy.mock.results[0].value as FakeAudioBufferSourceNode;
    expect(node.startOffset).toBeCloseTo(4);
  });

  it("stops the source when the playhead leaves the clip", () => {
    seedAsset("asset1");
    const s = new PB.AudioClipScheduler();
    s.tick({ sched: sched(), prevBeat: -1, nextBeat: 0, playing: true, bpm: 120, destFor: () => null });
    expect(s.liveCount).toBe(1);
    // len 4 bars = 16 beats; move past the end.
    s.tick({ sched: sched(), prevBeat: 16, nextBeat: 17, playing: true, bpm: 120, destFor: () => null });
    expect(s.liveCount).toBe(0);
  });

  it("stops everything on pause", () => {
    seedAsset("asset1");
    const s = new PB.AudioClipScheduler();
    s.tick({ sched: sched(), prevBeat: -1, nextBeat: 0, playing: true, bpm: 120, destFor: () => null });
    s.tick({ sched: sched(), prevBeat: 0, nextBeat: 1, playing: false, bpm: 120, destFor: () => null });
    expect(s.liveCount).toBe(0);
  });

  it("restarts cleanly across a loop-wrap / backward seek", () => {
    seedAsset("asset1");
    const ctx = A.ensureAudio() as unknown as FakeAudioContext;
    const spy = vi.spyOn(ctx, "createBufferSource");
    const s = new PB.AudioClipScheduler();

    s.tick({ sched: sched(), prevBeat: 3, nextBeat: 4, playing: true, bpm: 120, destFor: () => null });
    const first = spy.mock.results[0].value as FakeAudioBufferSourceNode;
    // Wrap backward to beat 1 (still inside the clip region).
    s.tick({ sched: sched(), prevBeat: 8, nextBeat: 1, playing: true, bpm: 120, destFor: () => null });

    expect(first.stopped).toBe(true);
    expect(s.liveCount).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2); // a fresh source for the new pass
  });

  it("skips clips whose decoded buffer isn't in memory (e.g. after reload)", () => {
    // No seedAsset → assetStore has nothing for asset1.
    const s = new PB.AudioClipScheduler();
    s.tick({ sched: sched(), prevBeat: -1, nextBeat: 0, playing: true, bpm: 120, destFor: () => null });
    expect(s.liveCount).toBe(0);
  });
});

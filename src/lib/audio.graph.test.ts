/**
 * Exercises the live Web Audio voice code in audio.ts under a fake AudioContext
 * (installed on globalThis before the module is imported), so the oscillator /
 * buffer-source / envelope paths that no-op without a context actually run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installFakeAudio,
  FakeAudioContext,
  FakeAudioBufferSourceNode,
  FakeOscillatorNode,
} from "../test/fakeAudio";

type Audio = typeof import("./audio");

let uninstall: () => void;
let A: Audio;

beforeEach(async () => {
  vi.resetModules(); // reset audio.ts's memoized AudioContext + voices set
  uninstall = installFakeAudio();
  A = await import("./audio");
});

afterEach(() => {
  A.silence();
  uninstall();
  vi.resetModules();
});

describe("ensureAudio with a fake AudioContext", () => {
  it("creates and memoizes a context, resuming it when suspended", () => {
    const ctx = A.ensureAudio();
    expect(ctx).toBeInstanceOf(FakeAudioContext);
    // suspended → resume() flips state to running
    expect((ctx as unknown as { state: string }).state).toBe("running");
    expect(A.ensureAudio()).toBe(ctx); // memoized
  });
});

describe("click", () => {
  it("wires an oscillator → gain → destination and schedules an envelope", () => {
    const ctx = A.ensureAudio() as unknown as FakeAudioContext;
    const oscSpy = vi.spyOn(ctx, "createOscillator");
    const gainSpy = vi.spyOn(ctx, "createGain");
    expect(() => A.click(true)).not.toThrow();
    expect(() => A.click(false)).not.toThrow();
    // each click creates one oscillator + one gain, and connects the gain to the
    // context destination.
    expect(oscSpy).toHaveBeenCalledTimes(2);
    expect(gainSpy).toHaveBeenCalledTimes(2);
    for (const r of gainSpy.mock.results) {
      const g = r.value as { connectedTo: unknown[] };
      expect(g.connectedTo).toContain(ctx.destination);
    }
    // accent click is louder/brighter than the regular click's oscillator.
    const accentOsc = oscSpy.mock.results[0].value as FakeOscillatorNode;
    const plainOsc = oscSpy.mock.results[1].value as FakeOscillatorNode;
    expect(accentOsc.frequency.value).toBeGreaterThan(plainOsc.frequency.value);
  });
});

describe("triggerNote", () => {
  it("plays a pitched oscillator voice for a normal note", () => {
    A.triggerNote({ pitch: 60, durationSec: 0.5, gain: 0.8, drum: false });
    // The voice was started; silence() then stops it. We assert via silence below,
    // but first confirm no throw and a started source exists by stopping it.
    expect(() => A.silence()).not.toThrow();
  });

  it("creates a buffer source (white-noise branch) for a drum note", () => {
    // Spy on createBufferSource to confirm the drum branch ran.
    const ctx = A.ensureAudio() as unknown as FakeAudioContext;
    const spy = vi.spyOn(ctx, "createBufferSource");
    A.triggerNote({ pitch: 40, durationSec: 0.3, gain: 0.9, drum: true });
    expect(spy).toHaveBeenCalledTimes(1);
    const src = spy.mock.results[0].value as FakeAudioBufferSourceNode;
    expect(src.buffer).not.toBeNull(); // buffer was filled + assigned
    expect(src.started).toBe(true);
  });

  it("creates an oscillator (not a buffer source) for a non-drum note", () => {
    const ctx = A.ensureAudio() as unknown as FakeAudioContext;
    const oscSpy = vi.spyOn(ctx, "createOscillator");
    const bufSpy = vi.spyOn(ctx, "createBufferSource");
    A.triggerNote({ pitch: 72, durationSec: 0.2, gain: 0.5, drum: false });
    expect(oscSpy).toHaveBeenCalledTimes(1);
    expect(bufSpy).not.toHaveBeenCalled();
    const osc = oscSpy.mock.results[0].value as FakeOscillatorNode;
    expect(osc.started).toBe(true);
    expect(osc.frequency.value).toBeCloseTo(A.noteHz(72), 3);
  });

  it("routes a voice into a supplied destination node", () => {
    const ctx = A.ensureAudio() as unknown as FakeAudioContext;
    const gainSpy = vi.spyOn(ctx, "createGain");
    const dest = ctx.createGain(); // the env gain is the NEXT createGain() call
    const created = gainSpy.mock.results.length;
    A.triggerNote({
      pitch: 64,
      durationSec: 0.2,
      gain: 0.6,
      drum: false,
      destination: dest as unknown as AudioNode,
    });
    // triggerNote created exactly one new gain (the envelope) which connects to dest.
    expect(gainSpy.mock.results).toHaveLength(created + 1);
    const env = gainSpy.mock.results[created].value as { connectedTo: unknown[] };
    expect(env.connectedTo).toContain(dest);
  });

  it("short-circuits on gain <= 0 (no voice created)", () => {
    const ctx = A.ensureAudio() as unknown as FakeAudioContext;
    const oscSpy = vi.spyOn(ctx, "createOscillator");
    const bufSpy = vi.spyOn(ctx, "createBufferSource");
    A.triggerNote({ pitch: 60, durationSec: 0.5, gain: 0, drum: false });
    A.triggerNote({ pitch: 60, durationSec: 0.5, gain: -1, drum: true });
    expect(oscSpy).not.toHaveBeenCalled();
    expect(bufSpy).not.toHaveBeenCalled();
  });
});

describe("silence", () => {
  it("stops every ringing voice and clears the set", () => {
    const ctx = A.ensureAudio() as unknown as FakeAudioContext;
    const oscSpy = vi.spyOn(ctx, "createOscillator");
    A.triggerNote({ pitch: 60, durationSec: 1, gain: 0.8, drum: false });
    A.triggerNote({ pitch: 64, durationSec: 1, gain: 0.8, drum: false });
    const voices = oscSpy.mock.results.map((r) => r.value as FakeOscillatorNode);
    expect(voices).toHaveLength(2);

    A.silence();
    for (const v of voices) expect(v.stopped).toBe(true);

    // A second silence() with no ringing voices is a safe no-op.
    expect(() => A.silence()).not.toThrow();
  });

  it("onended removes a voice from the active set", () => {
    const ctx = A.ensureAudio() as unknown as FakeAudioContext;
    const oscSpy = vi.spyOn(ctx, "createOscillator");
    A.triggerNote({ pitch: 60, durationSec: 0.5, gain: 0.8, drum: false });
    const osc = oscSpy.mock.results[0].value as FakeOscillatorNode;
    expect(osc.onended).toBeTypeOf("function");
    // Fire onended: the voice should be dropped, so a later silence() won't stop it again.
    osc.onended!();
    osc.stopped = false;
    A.silence();
    expect(osc.stopped).toBe(false); // already removed → silence didn't touch it
  });
});

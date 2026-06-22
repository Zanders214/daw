import { describe, expect, it } from "vitest";
import { click, ensureAudio, noteHz, silence, triggerNote } from "./audio";

describe("noteHz", () => {
  it("maps MIDI A4 (69) to 440 Hz", () => {
    expect(noteHz(69)).toBeCloseTo(440, 6);
  });

  it("doubles frequency one octave up (+12 semitones)", () => {
    expect(noteHz(81)).toBeCloseTo(880, 6);
  });

  it("halves frequency one octave down (-12 semitones)", () => {
    expect(noteHz(57)).toBeCloseTo(220, 6);
  });

  it("maps middle C (60) to ~261.63 Hz", () => {
    expect(noteHz(60)).toBeCloseTo(261.6256, 3);
  });

  it("is monotonically increasing in pitch", () => {
    expect(noteHz(70)).toBeGreaterThan(noteHz(69));
    expect(noteHz(68)).toBeLessThan(noteHz(69));
  });

  it("raises by one semitone with the twelfth root of two ratio", () => {
    expect(noteHz(70) / noteHz(69)).toBeCloseTo(2 ** (1 / 12), 9);
  });
});

describe("ensureAudio without an AudioContext implementation", () => {
  // Under the node environment globalThis.AudioContext is undefined, so the
  // `new Ctor()` call throws and ensureAudio() resolves to null.
  it("returns null when no AudioContext constructor exists", () => {
    expect((globalThis as { AudioContext?: unknown }).AudioContext).toBeUndefined();
    expect(ensureAudio()).toBeNull();
  });

  it("is memoized: repeated calls keep returning null", () => {
    expect(ensureAudio()).toBeNull();
    expect(ensureAudio()).toBeNull();
  });
});

describe("voice helpers degrade gracefully without audio", () => {
  it("click() is a no-op (no throw) when there is no context", () => {
    expect(() => click(true)).not.toThrow();
    expect(() => click(false)).not.toThrow();
  });

  it("triggerNote() is a no-op (no throw) when there is no context", () => {
    expect(() =>
      triggerNote({ pitch: 60, durationSec: 0.5, gain: 0.8, drum: false }),
    ).not.toThrow();
  });

  it("triggerNote() short-circuits on zero/negative gain", () => {
    expect(() =>
      triggerNote({ pitch: 60, durationSec: 0.5, gain: 0, drum: true }),
    ).not.toThrow();
    expect(() =>
      triggerNote({ pitch: 60, durationSec: 0.5, gain: -1, drum: false }),
    ).not.toThrow();
  });

  it("silence() is a no-op (no throw) with no ringing voices", () => {
    expect(() => silence()).not.toThrow();
  });
});

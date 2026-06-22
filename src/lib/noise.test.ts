import { describe, expect, it } from "vitest";
import { fillWhiteNoise, whiteNoise } from "./noise";

describe("whiteNoise", () => {
  it("returns a Float32Array of the requested length", () => {
    const n = whiteNoise(256);
    expect(n).toBeInstanceOf(Float32Array);
    expect(n).toHaveLength(256);
  });

  it("produces values within [-1, 1)", () => {
    const n = whiteNoise(4096);
    for (const v of n) {
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThan(1);
    }
  });

  it("spans more than one CSPRNG chunk without gaps", () => {
    // > 16_384 words forces the chunked refill path.
    const n = whiteNoise(40_000);
    expect(n).toHaveLength(40_000);
    // Every sample must have been written (default 0 is a valid sample, so
    // assert the buffer isn't all-zero instead).
    expect(n.some((v) => v !== 0)).toBe(true);
  });

  it("returns an empty buffer for non-positive lengths", () => {
    expect(whiteNoise(0)).toHaveLength(0);
    expect(whiteNoise(-5)).toHaveLength(0);
  });

  it("is (effectively) non-repeating across calls", () => {
    const a = whiteNoise(64);
    const b = whiteNoise(64);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it("fillWhiteNoise writes into an existing buffer", () => {
    const buf = new Float32Array(128);
    fillWhiteNoise(buf);
    expect(buf.some((v) => v !== 0)).toBe(true);
  });
});

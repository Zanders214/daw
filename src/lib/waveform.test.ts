import { describe, expect, it } from "vitest";
import { computePeaks, type BufferLike } from "./waveform";

const buf = (channels: Float32Array[]): BufferLike => ({
  length: channels[0]?.length ?? 0,
  numberOfChannels: channels.length,
  getChannelData: (c) => channels[c],
});

describe("computePeaks", () => {
  it("buckets a signal into min/max pairs within [-1, 1]", () => {
    const data = new Float32Array(1000);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i / 10);
    const p = computePeaks(buf([data]), 32);
    expect(p).toHaveLength(32);
    expect(p.min).toHaveLength(32);
    expect(p.max).toHaveLength(32);
    for (let b = 0; b < 32; b++) {
      expect(p.min[b]).toBeLessThanOrEqual(p.max[b]);
      expect(p.max[b]).toBeLessThanOrEqual(1);
      expect(p.min[b]).toBeGreaterThanOrEqual(-1);
    }
    // A full-scale sine should reach near the rails somewhere.
    expect(Math.max(...p.max)).toBeGreaterThan(0.9);
    expect(Math.min(...p.min)).toBeLessThan(-0.9);
  });

  it("returns ~0 for silence", () => {
    const p = computePeaks(buf([new Float32Array(500)]), 16);
    for (let b = 0; b < 16; b++) {
      expect(p.min[b]).toBe(0);
      expect(p.max[b]).toBe(0);
    }
  });

  it("yields zeroed buckets for an empty buffer", () => {
    const p = computePeaks(buf([new Float32Array(0)]), 8);
    expect(p).toHaveLength(8);
    expect(Array.from(p.max).every((v) => v === 0)).toBe(true);
    expect(Array.from(p.min).every((v) => v === 0)).toBe(true);
  });

  it("averages channels (a hard-panned L/R cancels toward center)", () => {
    const l = new Float32Array([1, 1, 1, 1]);
    const r = new Float32Array([-1, -1, -1, -1]);
    const p = computePeaks(buf([l, r]), 1);
    expect(p.max[0]).toBeCloseTo(0);
    expect(p.min[0]).toBeCloseTo(0);
  });
});

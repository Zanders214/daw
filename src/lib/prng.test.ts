import { describe, it, expect } from "vitest";
import { seed } from "./prng";

describe("seed", () => {
  it("is deterministic for the same seed string", () => {
    const a = seed("hello");
    const b = seed("hello");
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces floats in [0, 1)", () => {
    const rng = seed("range-check");
    for (let i = 0; i < 1000; i++) {
      const x = rng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("yields different sequences for different seeds", () => {
    expect(seed("alpha")()).not.toEqual(seed("beta")());
  });

  it("advances on each call", () => {
    const rng = seed("advance");
    expect(rng()).not.toEqual(rng());
  });
});

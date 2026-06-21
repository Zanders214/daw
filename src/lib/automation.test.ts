import { describe, it, expect } from "vitest";
import { defaultAuto, getAutoPts, valAt, fmtAuto } from "./automation";
import { TOTAL_BEATS } from "./constants";
import type { AutoPoint } from "../types";

describe("defaultAuto", () => {
  it("returns 5 points spanning 0..TOTAL_BEATS", () => {
    const pts = defaultAuto("track-1", "vol");
    expect(pts).toHaveLength(5);
    expect(pts[0].t).toBe(0);
    expect(pts[pts.length - 1].t).toBe(TOTAL_BEATS);
  });

  it("is deterministic for the same id + param", () => {
    expect(defaultAuto("t", "pan")).toEqual(defaultAuto("t", "pan"));
  });

  it("keeps values within each param's range", () => {
    for (const p of defaultAuto("t", "pan")) {
      expect(p.v).toBeGreaterThanOrEqual(0.25);
      expect(p.v).toBeLessThanOrEqual(0.75);
    }
    for (const p of defaultAuto("t", "vol")) {
      expect(p.v).toBeGreaterThanOrEqual(0.55);
      expect(p.v).toBeLessThanOrEqual(0.95);
    }
  });
});

describe("getAutoPts", () => {
  it("returns user-edited data when present", () => {
    const edited: AutoPoint[] = [{ t: 0, v: 0.1 }];
    expect(getAutoPts({ "x:vol": edited }, "x", "vol")).toBe(edited);
  });

  it("falls back to a stable cached default curve", () => {
    const first = getAutoPts({}, "cache-me", "filt");
    const second = getAutoPts({}, "cache-me", "filt");
    expect(second).toBe(first);
  });
});

describe("valAt", () => {
  const pts: AutoPoint[] = [
    { t: 0, v: 0 },
    { t: 10, v: 1 },
  ];

  it("returns 0 for an empty envelope", () => {
    expect(valAt([], 5)).toBe(0);
  });

  it("clamps to the first/last point outside the range", () => {
    expect(valAt(pts, -5)).toBe(0);
    expect(valAt(pts, 999)).toBe(1);
  });

  it("linearly interpolates between points", () => {
    expect(valAt(pts, 5)).toBeCloseTo(0.5);
  });
});

describe("fmtAuto", () => {
  it("formats pan as L / C / R", () => {
    expect(fmtAuto("pan", 0.5)).toBe("C");
    expect(fmtAuto("pan", 0)).toBe("L100");
    expect(fmtAuto("pan", 1)).toBe("R100");
  });

  it("formats the filter param in Hz", () => {
    expect(fmtAuto("filt", 0)).toBe("200 Hz");
  });

  it("formats other params as a percentage", () => {
    expect(fmtAuto("vol", 0.5)).toBe("50%");
  });
});

import { describe, it, expect } from "vitest";
import { hexA, clamp01 } from "./color";

describe("hexA", () => {
  it("converts #rrggbb + alpha to an rgba() string", () => {
    expect(hexA("#ff8800", 0.5)).toBe("rgba(255,136,0,0.5)");
  });

  it("tolerates a hex string without the leading #", () => {
    expect(hexA("00ff00", 1)).toBe("rgba(0,255,0,1)");
  });

  it("maps black and white correctly", () => {
    expect(hexA("#000000", 0)).toBe("rgba(0,0,0,0)");
    expect(hexA("#ffffff", 1)).toBe("rgba(255,255,255,1)");
  });
});

describe("clamp01", () => {
  it("passes through values already in range", () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(1)).toBe(1);
  });

  it("clamps out-of-range values to [0, 1]", () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(7)).toBe(1);
  });
});

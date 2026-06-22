// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { beatsAt, barsAt, snap, startDrag } from "./timeline";
import { TOTAL_BARS, TOTAL_BEATS } from "./constants";

const rect = (left: number, width: number) => ({ left, width }) as unknown as DOMRect;

describe("beatsAt / barsAt", () => {
  it("maps clientX across the element width onto the full timeline", () => {
    expect(beatsAt(0, rect(0, 200))).toBe(0);
    expect(beatsAt(100, rect(0, 200))).toBeCloseTo(TOTAL_BEATS / 2);
    expect(beatsAt(200, rect(0, 200))).toBeCloseTo(TOTAL_BEATS);
    expect(barsAt(200, rect(0, 200))).toBeCloseTo(TOTAL_BARS);
  });

  it("accounts for the element's left offset", () => {
    expect(beatsAt(50, rect(50, 200))).toBe(0);
    expect(barsAt(250, rect(50, 200))).toBeCloseTo(TOTAL_BARS);
  });

  it("returns 0 for a zero-width element (avoids divide-by-zero)", () => {
    expect(beatsAt(100, rect(0, 0))).toBe(0);
    expect(barsAt(100, rect(0, 0))).toBe(0);
  });
});

describe("snap", () => {
  it("rounds to the nearest multiple of step", () => {
    expect(snap(7, 5)).toBe(5);
    expect(snap(8, 5)).toBe(10);
    expect(snap(12.4, 4)).toBe(12);
  });
  it("returns the value unchanged when step <= 0", () => {
    expect(snap(7, 0)).toBe(7);
    expect(snap(7, -1)).toBe(7);
  });
});

describe("startDrag", () => {
  it("registers pointer listeners and removes them on pointerup", () => {
    const add = vi.spyOn(globalThis, "addEventListener");
    const remove = vi.spyOn(globalThis, "removeEventListener");
    const onMove = vi.fn();

    startDrag(onMove);
    expect(add).toHaveBeenCalledWith("pointermove", onMove);
    const upHandler = add.mock.calls.find((c) => c[0] === "pointerup")?.[1] as () => void;
    expect(upHandler).toBeTypeOf("function");

    upHandler();
    expect(remove).toHaveBeenCalledWith("pointermove", onMove);
    expect(remove).toHaveBeenCalledWith("pointerup", upHandler);

    add.mockRestore();
    remove.mockRestore();
  });
});

import { describe, it, expect } from "vitest";
import { genNotes } from "./notes";
import type { Clip, Track } from "../types";

const clip: Clip = { id: "clip-a", bar: 0, len: 4, name: "A" };

function track(type: Track["type"]): Track {
  return { id: "t", name: "T", color: "#ffffff", io: "A1", type, clips: [clip] };
}

describe("genNotes", () => {
  it("is deterministic for a given clip id", () => {
    expect(genNotes(clip, track("midi"))).toEqual(genNotes(clip, track("midi")));
  });

  it("keeps every note within normalized bounds and pitch rows 0..7", () => {
    for (const type of ["drum", "midi"] as const) {
      for (const n of genNotes(clip, track(type))) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.x).toBeLessThan(1);
        expect(n.w).toBeGreaterThan(0);
        expect(n.row).toBeGreaterThanOrEqual(0);
        expect(n.row).toBeLessThanOrEqual(7);
      }
    }
  });

  it("lays down a downbeat hit on drum clips", () => {
    const notes = genNotes(clip, track("drum"));
    expect(notes.some((n) => n.x === 0 && n.row === 7)).toBe(true);
  });
});

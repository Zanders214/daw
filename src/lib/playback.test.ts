import { describe, expect, it } from "vitest";
import { buildSchedule, notesInWindow } from "./playback";
import type { Track } from "../types";

const midiTrack = (clips: Track["clips"]): Track => ({
  id: "t1",
  name: "T",
  color: "#fff",
  io: "A1",
  type: "midi",
  clips,
});

describe("buildSchedule", () => {
  it("places edited notes at absolute beats (clip.bar*4 + note.start)", () => {
    const t = midiTrack([
      { id: "c", bar: 2, len: 4, name: "C", notes: [
        { id: "n1", start: 0, len: 1, pitch: 60, velocity: 0.5 },
        { id: "n2", start: 3, len: 2, pitch: 64 },
      ] },
    ]);
    const sched = buildSchedule([t]);
    expect(sched).toHaveLength(2);
    expect(sched[0]).toMatchObject({ absBeat: 8, durBeat: 1, pitch: 60, velocity: 0.5, trackId: "t1", type: "midi" });
    expect(sched[1]).toMatchObject({ absBeat: 11, durBeat: 2, pitch: 64, velocity: 0.8 }); // default velocity
  });

  it("falls back to the generated pattern for unedited clips (still audible)", () => {
    const sched = buildSchedule([midiTrack([{ id: "c2", bar: 0, len: 4, name: "C2" }])]);
    expect(sched.length).toBeGreaterThan(0);
    for (const n of sched) {
      expect(n.absBeat).toBeGreaterThanOrEqual(0);
      expect(n.durBeat).toBeGreaterThan(0);
    }
  });
});

describe("notesInWindow", () => {
  const sched = buildSchedule([
    midiTrack([{ id: "c", bar: 0, len: 4, name: "C", notes: [
      { id: "a", start: 0, len: 1, pitch: 60 },
      { id: "b", start: 2, len: 1, pitch: 62 },
      { id: "d", start: 4, len: 1, pitch: 64 },
    ] }]),
  ]);

  it("returns notes in (prev, next], excluding the prev boundary", () => {
    expect(notesInWindow(sched, 0, 2).map((n) => n.pitch)).toEqual([62]); // (0,2] → beat 2 only, not 0
    expect(notesInWindow(sched, -0.1, 0).map((n) => n.pitch)).toEqual([60]); // includes the next boundary
  });

  it("returns nothing on a backward / wrap window (next <= prev)", () => {
    expect(notesInWindow(sched, 5, 1)).toEqual([]);
    expect(notesInWindow(sched, 3, 3)).toEqual([]);
  });
});

import type { Clip, ClipNote, Track } from "../types";
import { seed } from "./prng";

/** Drum clips lay down a kick on the downbeat, snares on off-beats and sparse hats. */
function drumNotes(clip: Clip, rng: () => number): ClipNote[] {
  const notes: ClipNote[] = [];
  const steps = clip.len * 4;
  for (let i = 0; i < steps; i++) {
    if (i % 4 === 0) notes.push({ x: i / steps, w: 0.7 / steps, row: 7 });
    if (i % 2 === 1 && rng() > 0.45) notes.push({ x: i / steps, w: 0.6 / steps, row: 4 });
    if (rng() > 0.7) notes.push({ x: i / steps, w: 0.5 / steps, row: 1 });
  }
  return notes;
}

/** Melodic clips do a seeded random walk across 8 pitch rows. */
function melodicNotes(clip: Clip, rng: () => number): ClipNote[] {
  const notes: ClipNote[] = [];
  const steps = clip.len * 2;
  let row = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < steps; i++) {
    if (rng() > 0.42) {
      row = Math.max(0, Math.min(7, row + Math.floor(rng() * 3) - 1));
      const len = rng() > 0.72 ? 2 : 1;
      notes.push({ x: i / steps, w: (len * 0.9) / steps, row });
    }
  }
  return notes;
}

/**
 * Generate a deterministic mini piano-roll for a clip, used to texture MIDI
 * and drum clips in the arrange view. Drum clips lay down kick/snare/hat
 * rows; melodic clips do a seeded random walk across 8 pitch rows.
 */
export function genNotes(clip: Clip, td: Track): ClipNote[] {
  const rng = seed(clip.id);
  return td.type === "drum" ? drumNotes(clip, rng) : melodicNotes(clip, rng);
}

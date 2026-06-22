import type { Clip, ClipNote, Note, Track } from "../types";
import { BEATS_PER_BAR, PITCH_MAX, PITCH_MIN } from "./constants";
import { newNoteId } from "./dnd";
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

const PITCH_SPAN = PITCH_MAX - PITCH_MIN;

/** Materialize the generated pattern as editable notes (beats + absolute pitch),
 *  so opening a never-edited clip in the piano roll starts from its display pattern. */
export function notesFromPattern(clip: Clip, td: Track): Note[] {
  const beats = clip.len * BEATS_PER_BAR;
  return genNotes(clip, td).map((n) => ({
    id: newNoteId(),
    start: n.x * beats,
    len: Math.max(0.25, n.w * beats),
    pitch: PITCH_MAX - Math.round((n.row / 7) * PITCH_SPAN),
    velocity: 0.8,
  }));
}

/** Unified vertical preview shape for a lane clip: x/w are 0..1 across the clip,
 *  y is 0..1 from top (high pitch). Uses stored notes when present, else the
 *  generated pattern. */
export function clipPreview(clip: Clip, td: Track): { x: number; w: number; y: number }[] {
  if (clip.notes) {
    const beats = clip.len * BEATS_PER_BAR || 1;
    return clip.notes.map((n) => ({
      x: n.start / beats,
      w: n.len / beats,
      y: (PITCH_MAX - n.pitch) / PITCH_SPAN,
    }));
  }
  return genNotes(clip, td).map((n) => ({ x: n.x, w: n.w, y: n.row / 8 }));
}

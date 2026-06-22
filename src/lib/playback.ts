/**
 * Playback scheduling — pure helpers (no Web Audio) that flatten the song into a
 * note schedule and pick the notes crossing the playhead each frame. The rAF
 * transport loop (useTransportLoop) feeds these to the Web Audio synth in audio.ts.
 */
import type { Track, TrackType } from "../types";
import { BEATS_PER_BAR } from "./constants";
import { playbackNotes } from "./notes";

/** One scheduled note on the absolute timeline (beats). */
export interface SchedNote {
  /** Absolute start in beats (clip.bar * BEATS_PER_BAR + note.start). */
  absBeat: number;
  /** Duration in beats. */
  durBeat: number;
  pitch: number;
  velocity: number;
  trackId: string;
  type: TrackType;
}

/** Flatten every clip's playable notes into one absolute-timeline schedule. */
export function buildSchedule(tracks: Track[]): SchedNote[] {
  const out: SchedNote[] = [];
  for (const t of tracks) {
    for (const c of t.clips) {
      const clipStart = c.bar * BEATS_PER_BAR;
      for (const n of playbackNotes(c, t)) {
        out.push({
          absBeat: clipStart + n.start,
          durBeat: n.len,
          pitch: n.pitch,
          velocity: n.velocity,
          trackId: t.id,
          type: t.type,
        });
      }
    }
  }
  return out;
}

/** Notes whose start falls in (prevBeat, nextBeat]. Empty on a non-forward window
 *  (next <= prev), so a loop wrap or manual seek triggers nothing for that frame. */
export function notesInWindow(sched: SchedNote[], prevBeat: number, nextBeat: number): SchedNote[] {
  if (nextBeat <= prevBeat) return [];
  return sched.filter((n) => n.absBeat > prevBeat && n.absBeat <= nextBeat);
}

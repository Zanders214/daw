/**
 * Audio-clip scheduling for the offline (browser) transport. Unlike MIDI notes
 * — which fire as instantaneous events in a forward window — an audio clip is a
 * continuous region: a buffer source is started when the playhead enters the
 * clip and stopped when it leaves (or on pause / seek / loop-wrap). Sources
 * route into the same per-track mixer input as MIDI voices, so volume / pan /
 * mute / solo / sends / inserts all apply unchanged.
 */
import type { Track } from "../types";
import { BEATS_PER_BAR } from "./constants";
import { ensureAudio } from "./audio";
import { getAsset } from "./assetStore";

/** One audio clip placed on the absolute timeline (beats). */
export interface AudioClipSched {
  trackId: string;
  clipId: string;
  /** Asset id (lib/assetStore key). */
  src: string;
  startBeat: number;
  endBeat: number;
  /** In-buffer start offset in seconds. */
  offsetSec: number;
  /** Per-clip linear gain. */
  gain: number;
}

/** Flatten every audio-backed clip (those with `src`) into a region schedule. */
export function buildAudioSchedule(tracks: Track[]): AudioClipSched[] {
  const out: AudioClipSched[] = [];
  for (const t of tracks) {
    for (const c of t.clips) {
      if (!c.src) continue;
      const startBeat = c.bar * BEATS_PER_BAR;
      out.push({
        trackId: t.id,
        clipId: c.id,
        src: c.src,
        startBeat,
        endBeat: startBeat + c.len * BEATS_PER_BAR,
        offsetSec: c.offset ?? 0,
        gain: c.gain ?? 1,
      });
    }
  }
  return out;
}

export interface AudioTickOpts {
  sched: AudioClipSched[];
  /** Playhead at the start of this frame (beats). */
  prevBeat: number;
  /** Playhead at the end of this frame (beats). */
  nextBeat: number;
  playing: boolean;
  bpm: number;
  /** Resolve a track's mixer input node (or null to use the destination). */
  destFor: (trackId: string) => AudioNode | null;
}

/**
 * Stateful per-frame audio-clip scheduler. Tracks one live buffer source per
 * clip currently under the playhead; starts/stops them as the playhead moves.
 */
export class AudioClipScheduler {
  private readonly live = new Map<string, AudioBufferSourceNode>();

  tick({ sched, prevBeat, nextBeat, playing, bpm, destFor }: AudioTickOpts): void {
    if (!playing) {
      this.stopAll();
      return;
    }
    const ctx = ensureAudio();
    if (!ctx) return;

    // A loop-wrap or backward seek is a discontinuity: cut everything, then let
    // the region check below restart whatever the playhead landed inside.
    if (nextBeat <= prevBeat) this.stopAll();

    for (const cl of sched) {
      const inRegion = nextBeat >= cl.startBeat && nextBeat < cl.endBeat;
      const isLive = this.live.has(cl.clipId);
      if (inRegion && !isLive) this.startClip(ctx, cl, nextBeat, bpm, destFor);
      else if (!inRegion && isLive) this.stopClip(cl.clipId);
    }
  }

  private startClip(
    ctx: AudioContext,
    cl: AudioClipSched,
    nextBeat: number,
    bpm: number,
    destFor: (trackId: string) => AudioNode | null,
  ): void {
    const entry = getAsset(cl.src);
    if (!entry) return; // no decoded buffer (e.g. session reloaded; not re-imported)

    const node = ctx.createBufferSource();
    node.buffer = entry.buffer;
    const dest = destFor(cl.trackId) ?? ctx.destination;
    if (cl.gain === 1) {
      node.connect(dest);
    } else {
      const g = ctx.createGain();
      g.gain.value = cl.gain;
      node.connect(g);
      g.connect(dest);
    }
    node.onended = () => {
      if (this.live.get(cl.clipId) === node) this.live.delete(cl.clipId);
    };
    // Start mid-clip when the playhead entered past the clip start (seek / first
    // frame after a wrap); a tiny positive offset on a forward crossing is fine.
    const offset = Math.max(0, cl.offsetSec + ((nextBeat - cl.startBeat) * 60) / bpm);
    try {
      node.start(ctx.currentTime, offset);
    } catch {
      /* start can throw if the context is closed; ignore */
    }
    this.live.set(cl.clipId, node);
  }

  private stopClip(clipId: string): void {
    const node = this.live.get(clipId);
    if (!node) return;
    try {
      node.stop();
    } catch {
      /* already stopped */
    }
    this.live.delete(clipId);
  }

  /** Stop and forget every live source (pause / stop / unmount). */
  stopAll(): void {
    for (const node of this.live.values()) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
    }
    this.live.clear();
  }

  /** Number of currently-playing audio clips (for tests / diagnostics). */
  get liveCount(): number {
    return this.live.size;
  }
}

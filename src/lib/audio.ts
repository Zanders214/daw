/**
 * Minimal Web Audio metronome. A single lazily-created AudioContext emits a
 * short click per beat: a brighter accent on the downbeat. This stands in for
 * the real audio engine until native audio / VST3 hosting lands.
 */
import { whiteNoise } from "./noise";

let ac: AudioContext | null | undefined;

export function ensureAudio(): AudioContext | null {
  if (ac === undefined) {
    try {
      const Ctor =
        globalThis.AudioContext ||
        (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new Ctor();
    } catch {
      ac = null;
    }
  }
  if (ac?.state === "suspended") void ac.resume();
  return ac;
}

/** Play a metronome click. `accent` = the bar's downbeat (higher pitch, louder). */
export function click(accent: boolean): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = accent ? 1600 : 1000;
  o.connect(g);
  g.connect(ctx.destination);
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(accent ? 0.3 : 0.18, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.start(t);
  o.stop(t + 0.06);
}

/** MIDI/semitone pitch → frequency in Hz (A4 = 69 = 440 Hz). */
export function noteHz(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

// Currently-ringing source nodes, so Stop can cut them cleanly.
const voices = new Set<AudioScheduledSourceNode>();

/** A single synth voice's parameters (no routing/context). */
export interface VoiceOpts {
  pitch: number;
  durationSec: number;
  /** Output gain (velocity); track/group/master gain + pan live in the mixer graph. */
  gain: number;
  /** Percussive noise voice (drum tracks) vs a pitched oscillator. */
  drum: boolean;
}

interface TriggerOpts extends VoiceOpts {
  /** Where the voice connects — a track input node from the mixer graph, or the
   *  context destination as a fallback. */
  destination?: AudioNode;
}

/** Build + schedule one synth voice on `ctx`, starting at absolute time `when`:
 *  a noise burst for drums, else a lowpassed sawtooth, through an attack/decay
 *  envelope, into `destination`. Returns the source node (or null if silent).
 *  Used by both the live transport (when = now) and the offline bounce renderer
 *  (when = the note's offline start time) so the synth is identical in both. */
export function scheduleVoice(
  ctx: BaseAudioContext,
  destination: AudioNode,
  { pitch, durationSec, gain, drum }: VoiceOpts,
  when: number,
): AudioScheduledSourceNode | null {
  if (gain <= 0) return null;
  const t = when;
  const dur = Math.max(0.05, durationSec);
  const peak = Math.min(1, gain) * (drum ? 0.5 : 0.22);

  const env = ctx.createGain();
  env.connect(destination);

  // Attack then exponential decay to the note end (+ short release tail).
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);

  let src: AudioScheduledSourceNode;
  if (drum) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * Math.min(0.25, dur)));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const samples = whiteNoise(data.length);
    for (let i = 0; i < data.length; i++) data[i] = samples[i] * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = Math.max(120, Math.min(8000, noteHz(pitch)));
    noise.connect(bp);
    bp.connect(env);
    src = noise;
  } else {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = noteHz(pitch);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3500;
    osc.connect(lp);
    lp.connect(env);
    src = osc;
  }

  src.start(t);
  src.stop(t + dur + 0.1);
  return src;
}

/** Play one note now on the shared (live) AudioContext, registering it so Stop /
 *  pause can cut it. Thin wrapper over `scheduleVoice`. */
export function triggerNote(opts: TriggerOpts): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  const src = scheduleVoice(ctx, opts.destination ?? ctx.destination, opts, ctx.currentTime);
  if (!src) return;
  voices.add(src);
  src.onended = () => voices.delete(src);
}

/** Stop every ringing voice immediately (Stop / pause). */
export function silence(): void {
  for (const v of voices) {
    try {
      v.stop();
    } catch {
      /* already stopped */
    }
  }
  voices.clear();
}

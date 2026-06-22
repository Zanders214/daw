/**
 * Minimal Web Audio metronome. A single lazily-created AudioContext emits a
 * short click per beat: a brighter accent on the downbeat. This stands in for
 * the real audio engine until native audio / VST3 hosting lands.
 */
let ac: AudioContext | null | undefined;

function ensureAudio(): AudioContext | null {
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

interface TriggerOpts {
  pitch: number;
  durationSec: number;
  /** Linear output gain (velocity × track vol × master vol), 0..~1. */
  gain: number;
  /** Stereo position, -1 (L) .. 1 (R). */
  pan: number;
  /** Percussive noise voice (drum tracks) vs a pitched oscillator. */
  drum: boolean;
}

/** Play one note on the shared AudioContext: a noise burst for drums, else a
 *  lowpassed sawtooth, through an attack/decay envelope and a stereo panner. */
export function triggerNote({ pitch, durationSec, gain, pan, drum }: TriggerOpts): void {
  const ctx = ensureAudio();
  if (!ctx || gain <= 0) return;
  const t = ctx.currentTime;
  const dur = Math.max(0.05, durationSec);
  const peak = Math.min(1, gain) * (drum ? 0.5 : 0.22);

  const env = ctx.createGain();
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  env.connect(panner);
  panner.connect(ctx.destination);

  // Attack then exponential decay to the note end (+ short release tail).
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);

  let src: AudioScheduledSourceNode;
  if (drum) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * Math.min(0.25, dur)));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
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

  voices.add(src);
  src.onended = () => voices.delete(src);
  src.start(t);
  src.stop(t + dur + 0.1);
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

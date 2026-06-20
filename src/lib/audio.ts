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
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new Ctor();
    } catch {
      ac = null;
    }
  }
  if (ac && ac.state === "suspended") void ac.resume();
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

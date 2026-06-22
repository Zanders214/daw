import { useEffect, useRef } from "react";
import { useDawStore } from "../store/useDawStore";
import { click, silence, triggerNote } from "../lib/audio";
import { engineActive } from "../lib/engine";
import { buildSchedule, notesInWindow, type SchedNote } from "../lib/playback";
import { getTrackInput } from "../lib/mixerGraph";
import type { Track } from "../types";

/**
 * Drives the single requestAnimationFrame loop: advances the playhead /
 * meters / tape reel via the store's `tick`, fires the metronome click on each
 * new beat, and triggers the Web Audio synth for clip notes crossing the
 * playhead (frame-driven, like the metronome — fully offline). Mount once.
 *
 * When hosted by the JUCE engine, this simulation is disabled — the engine
 * pushes real transport/meter state via `useEngineBridge` and owns audio.
 */
export function useTransportLoop() {
  const lastBeat = useRef(-1);
  const wasPlaying = useRef(false);
  const schedule = useRef<SchedNote[]>([]);
  const schedSrc = useRef<Track[] | null>(null);

  useEffect(() => {
    if (engineActive()) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;

      const prevPh = useDawStore.getState().playhead;
      const beat = useDawStore.getState().tick(dt);
      const s = useDawStore.getState();

      // Metronome (unchanged): one click per new integer beat while playing.
      if (s.playing && s.metronome && beat !== lastBeat.current) click(beat % 4 === 0);
      lastBeat.current = beat;

      // Rebuild the note schedule only when the song structure changes.
      if (s.tracks !== schedSrc.current) {
        schedule.current = buildSchedule(s.tracks);
        schedSrc.current = s.tracks;
      }

      // Trigger notes crossing the playhead this frame (forward windows only).
      // The mixer graph applies track/group/master gain+pan, mute/solo, sends and
      // insert FX — the voice carries only velocity and routes into its track input.
      if (s.playing) {
        for (const n of notesInWindow(schedule.current, prevPh, s.playhead)) {
          triggerNote({
            pitch: n.pitch,
            durationSec: (n.durBeat * 60) / s.bpm,
            gain: n.velocity,
            drum: n.type === "drum",
            destination: getTrackInput(n.trackId) ?? undefined,
          });
        }
      } else if (wasPlaying.current) {
        silence(); // cut ringing voices on stop / pause
      }
      wasPlaying.current = s.playing;

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

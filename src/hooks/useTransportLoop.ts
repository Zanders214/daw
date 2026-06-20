import { useEffect, useRef } from "react";
import { useDawStore } from "../store/useDawStore";
import { click } from "../lib/audio";
import { engineActive } from "../lib/engine";

/**
 * Drives the single requestAnimationFrame loop: advances the playhead /
 * meters / tape reel via the store's `tick`, and fires the metronome click on
 * each new beat while playing. Mount once at the app root.
 *
 * When hosted by the JUCE engine, this simulation is disabled — the engine
 * pushes real transport/meter state via `useEngineBridge` instead.
 */
export function useTransportLoop() {
  const lastBeat = useRef(-1);
  useEffect(() => {
    if (engineActive()) return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const beat = useDawStore.getState().tick(dt);
      const s = useDawStore.getState();
      if (s.playing && s.metronome && beat !== lastBeat.current) click(beat % 4 === 0);
      lastBeat.current = beat;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}

import { useEffect } from "react";
import { useDawStore } from "../store/useDawStore";
import { engineActive } from "../lib/engine";
import { mixSignature, syncGraph, teardown } from "../lib/mixerGraph";

/**
 * Keeps the offline Web Audio mixer graph in sync with the store: track/group/master
 * gain+pan, mute/solo, aux sends→returns, and insert-FX approximations. Reconciles
 * only when a compact mix signature changes (not the per-frame playhead/levels).
 * No-op when hosted by JUCE (the engine owns audio). Mount once at the app root.
 */
export function useMixerGraph() {
  useEffect(() => {
    if (engineActive()) return;
    let sig = mixSignature(useDawStore.getState());
    syncGraph(useDawStore.getState());
    const unsub = useDawStore.subscribe((s) => {
      const next = mixSignature(s);
      if (next !== sig) {
        sig = next;
        syncGraph(s);
      }
    });
    return () => {
      unsub();
      teardown();
    };
  }, []);
}

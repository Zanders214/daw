import { useEffect } from "react";
import { useDawStore } from "../store/useDawStore";
import { engine, engineActive, subscribeEngine } from "../lib/engine";
import type { DeviceKey } from "../types";

/**
 * When running inside the JUCE host, subscribe to engine state events (which
 * drive the playhead / meters / tape reel) and push the current UI state to
 * the freshly-connected engine. No-op in a plain browser.
 */
export function useEngineBridge() {
  useEffect(() => {
    if (!engineActive()) return;

    const unsub = subscribeEngine({
      onState: (s) => useDawStore.getState().setEngineState(s),
    });

    // Sync current UI state down to the engine on connect.
    const st = useDawStore.getState();
    engine.transport.setTempo(st.bpm);
    (Object.keys(st.devices) as DeviceKey[]).forEach((k) =>
      engine.device.setBypass(k, !st.devices[k]),
    );
    engine.device.setParam("pre", "amount", st.preAmount);

    return unsub;
  }, []);
}

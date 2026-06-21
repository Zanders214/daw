import { useEffect } from "react";
import { useDawStore } from "../store/useDawStore";
import { engine, engineActive, subscribeEngine } from "../lib/engine";
import { TRACK_DEFS } from "../data/seed";
import { DEFAULT_VOLUME } from "../lib/constants";
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
      onTracks: (t) => useDawStore.getState().setEngineTracks(t),
    });

    // Sync current UI state down to the engine on connect.
    const st = useDawStore.getState();
    engine.transport.setTempo(st.bpm);
    engine.transport.setLoopStart(st.loopStart);
    engine.transport.setLoopEnd(st.loopEnd);
    engine.mixer.setMasterVolume(st.masterVolume);

    // Re-assert each track's mix state so create-on-demand channels match the UI.
    TRACK_DEFS.forEach((t) => {
      engine.mixer.setTrackVolume(t.id, st.volumes[t.id] ?? DEFAULT_VOLUME);
      if (st.mutes[t.id]) engine.mixer.setTrackMute(t.id, true);
      if (st.solos[t.id]) engine.mixer.setTrackSolo(t.id, true);
      if (st.arms[t.id]) engine.mixer.setTrackArm(t.id, true);
    });

    (Object.keys(st.devices) as DeviceKey[]).forEach((k) =>
      engine.device.setBypass(k, !st.devices[k]),
    );
    engine.device.setParam("pre", "amount", st.preAmount);
    st.refreshDevices();

    return unsub;
  }, []);
}

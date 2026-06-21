/**
 * applySessionToEngine — push the full UI state down to the native engine in
 * one shot. Shared by the connect-time sync (useEngineBridge) and session load
 * (session.ts), so there is a single source of truth for how store state maps
 * to engine commands.
 *
 * The `DawState` import is type-only so this stays a runtime leaf (no import
 * cycle with the store, which imports this module for `newSession`).
 */
import { engine, engineActive } from "./engine";
import { TRACK_DEFS } from "../data/seed";
import { DEFAULT_VOLUME } from "./constants";
import type { DeviceKey } from "../types";
import type { DawState } from "../store/useDawStore";

export function applySessionToEngine(s: DawState): void {
  if (!engineActive()) return;

  engine.transport.setTempo(s.bpm);
  engine.transport.setLooping(s.loop);
  engine.transport.setLoopStart(s.loopStart);
  engine.transport.setLoopEnd(s.loopEnd);
  engine.mixer.setMasterVolume(s.masterVolume);
  engine.mixer.setMasterPan(s.masterPan);

  // Re-assert each track's mix state + audio file so create-on-demand channels
  // match the UI exactly (explicit false resets a track the session cleared).
  TRACK_DEFS.forEach((t) => {
    engine.mixer.setTrackVolume(t.id, s.volumes[t.id] ?? DEFAULT_VOLUME);
    engine.mixer.setTrackPan(t.id, s.pans[t.id] ?? 0.5);
    engine.mixer.setTrackMute(t.id, !!s.mutes[t.id]);
    engine.mixer.setTrackSolo(t.id, !!s.solos[t.id]);
    engine.mixer.setTrackArm(t.id, !!s.arms[t.id]);

    const tf = s.trackFiles[t.id];
    if (tf?.loaded && tf.path) engine.track.assignFile(t.id, tf.path);
    else engine.track.clearFile(t.id);
  });

  (Object.keys(s.devices) as DeviceKey[]).forEach((k) =>
    engine.device.setBypass(k, !s.devices[k]),
  );
  engine.device.setParam("pre", "amount", s.preAmount);
}

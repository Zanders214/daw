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
import { TRACK_DEFS, GROUP_DEFS } from "../data/seed";
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

    const snd = s.sends[t.id] ?? [];
    engine.mixer.setTrackSend(t.id, 0, snd[0] ?? 0);
    engine.mixer.setTrackSend(t.id, 1, snd[1] ?? 0);
  });

  (s.returnGains ?? [1, 1]).forEach((g, i) => engine.returns.setGain(i, g ?? 1));

  // Group sub-mix buses: assign each track to its group (static, from GROUP_DEFS)
  // and re-assert each group's gain/pan/mute/solo.
  GROUP_DEFS.forEach((g) => {
    g.tracks.forEach((tid) => engine.mixer.setTrackGroup(tid, g.id));
    engine.group.setGain(g.id, s.groupVolumes[g.id] ?? 1);
    engine.group.setPan(g.id, s.groupPans[g.id] ?? 0.5);
    engine.group.setMute(g.id, !!s.groupMutes[g.id]);
    engine.group.setSolo(g.id, !!s.groupSolos[g.id]);
  });

  (Object.keys(s.devices) as DeviceKey[]).forEach((k) =>
    engine.device.setBypass(k, !s.devices[k]),
  );
  engine.device.setParam("pre", "amount", s.preAmount);

  // Automation: drop any stale envelopes, then push every enabled lane's edited
  // envelope. Done after the manual pushes above so automated params correctly
  // override their manual value on the next audio block (read mode). Keys are
  // `nodeId:paramId`; node ids never contain ":", so split on the first colon
  // (paramId may itself contain colons, e.g. device params `dev:0:3`).
  engine.automation.clearAll();
  for (const key of Object.keys(s.autoData)) {
    const colon = key.indexOf(":");
    if (colon < 0) continue;
    const nodeId = key.slice(0, colon);
    if (!s.autoLanes[nodeId]) continue;
    engine.automation.set(nodeId, key.slice(colon + 1), s.autoData[key]);
  }
}

/**
 * applySessionToEngine — push the full UI state down to the native engine in
 * one shot. Shared by the connect-time sync (useEngineBridge) and session load
 * (session.ts), so there is a single source of truth for how store state maps
 * to engine commands.
 *
 * The `DawState` import is type-only so this stays a runtime leaf (no import
 * cycle with the store, which imports this module for `newSession`).
 */
import { engine, engineActive, type ClipAssign } from "./engine";
import { DEFAULT_VOLUME, BEATS_PER_BAR } from "./constants";
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

  // Which group (if any) each track belongs to — pushed via trackCreate below.
  const groupOf: Record<string, string> = {};
  s.groups.forEach((g) => g.tracks.forEach((tid) => (groupOf[tid] = g.id)));

  // Recreate every track the engine may not know about, then re-assert its mix
  // state + audio file so the engine matches the UI exactly (explicit false
  // resets a track the session cleared).
  s.tracks.forEach((t) => {
    engine.track.create(t.id, t.name, t.type, t.color, groupOf[t.id] ?? "");
    engine.mixer.setTrackVolume(t.id, s.volumes[t.id] ?? DEFAULT_VOLUME);
    engine.mixer.setTrackPan(t.id, s.pans[t.id] ?? 0.5);
    engine.mixer.setTrackMute(t.id, !!s.mutes[t.id]);
    engine.mixer.setTrackSolo(t.id, !!s.solos[t.id]);
    engine.mixer.setTrackArm(t.id, !!s.arms[t.id]);

    // Per-clip audio: push every clip whose asset carries a disk path (only
    // those are playable natively — browser-only in-memory imports have none).
    const clips: ClipAssign[] = [];
    for (const c of t.clips) {
      const path = c.src ? s.assets[c.src]?.path : undefined;
      if (!path) continue;
      clips.push({
        clipId: c.id,
        path,
        startBeat: c.bar * BEATS_PER_BAR,
        lenBeats: c.len * BEATS_PER_BAR,
        offsetSec: c.offset ?? 0,
        gain: c.gain ?? 1,
      });
    }
    if (clips.length > 0) {
      engine.track.setClips(t.id, clips);
    } else {
      // Back-compat: a track-level file with no path-bearing clips.
      const tf = s.trackFiles[t.id];
      if (tf?.loaded && tf.path) engine.track.assignFile(t.id, tf.path);
      else engine.track.clearFile(t.id);
    }

    const snd = s.sends[t.id] ?? [];
    engine.mixer.setTrackSend(t.id, 0, snd[0] ?? 0);
    engine.mixer.setTrackSend(t.id, 1, snd[1] ?? 0);
  });

  (s.returnGains ?? [1, 1]).forEach((g, i) => engine.returns.setGain(i, g ?? 1));

  // Group sub-mix buses: re-assert each group's gain/pan/mute/solo (membership
  // was wired per-track via trackCreate above).
  s.groups.forEach((g) => {
    engine.group.setGain(g.id, s.groupVolumes[g.id] ?? 1);
    engine.group.setPan(g.id, s.groupPans[g.id] ?? 0.5);
    engine.group.setMute(g.id, !!s.groupMutes[g.id]);
    engine.group.setSolo(g.id, !!s.groupSolos[g.id]);
  });

  // Rebuild each node's insert rack on the freshly-connected engine, in order.
  for (const [nodeId, devices] of Object.entries(s.nodeRacks)) {
    devices.forEach((d) => {
      engine.node.add(nodeId, d.id, { kind: d.kind, name: d.name, path: d.path });
      if (d.bypassed) engine.node.setBypass(nodeId, d.id, true);
    });
  }

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

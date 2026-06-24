/**
 * Session model — what a saved DAW project is, and how to (de)serialize it.
 *
 * Two artifacts, persisted independently (see sessionStore.ts):
 *  - SessionUi  : musical, per-project state (transport, mixer, track files,
 *                 device(FX) state, automation, recording prefs). The native
 *                 host augments this with full plugin-state blobs under
 *                 `SessionData.engine` (C++-owned; opaque to the web).
 *  - PrefsData  : global, per-install preferences (appearance + audio/MIDI
 *                 device) — so loading a project never changes your hardware.
 *
 * `serialize*` are pure (state in → plain object out). `apply*` hydrate the
 * store and push to the engine. Keep the field lists here in lockstep with the
 * store's `hydrateSession`/`hydratePrefs`.
 */
import { useDawStore, type DawState } from "../store/useDawStore";
import { applySessionToEngine } from "./engineSync";
import { clearHistory } from "./history";
import { engine, engineActive } from "./engine";
import type {
  AudioAsset,
  AutomationParam,
  AutoPoint,
  DeviceKey,
  Group,
  ThemeName,
  Track,
} from "../types";
import type { NodeRacks, TrackInfos } from "./engine";

// v2: automation envelopes drive engine params (Phase 5). v3: the arrangement
// structure (tracks/groups) and per-node device racks are stored, so add/remove
// track and arbitrary plugin chains persist. v4: imported audio-asset metadata
// (clips carry a `src` id; decoded buffers stay in lib/assetStore). Older
// sessions load unchanged — missing fields fall back to defaults in
// `hydrateSession`.
export const SESSION_VERSION = 4;

export interface SessionUi {
  /** Arrangement structure (omitted in v1/v2 sessions → seed defaults apply). */
  tracks?: Track[];
  groups?: Group[];
  /** Imported audio-asset metadata (v4+; decoded buffers are not persisted). */
  assets?: Record<string, AudioAsset>;
  nodeRacks?: NodeRacks;
  bpm: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  volumes: Record<string, number>;
  pans: Record<string, number>;
  mutes: Record<string, boolean>;
  solos: Record<string, boolean>;
  arms: Record<string, boolean>;
  masterVolume: number;
  masterPan: number;
  groupVolumes: Record<string, number>;
  groupPans: Record<string, number>;
  groupMutes: Record<string, boolean>;
  groupSolos: Record<string, boolean>;
  sends: Record<string, number[]>;
  returnGains: number[];
  trackFiles: TrackInfos;
  devices: Record<DeviceKey, boolean>;
  preAmount: number;
  autoLanes: Record<string, boolean>;
  autoParam: Record<string, AutomationParam>;
  autoData: Record<string, AutoPoint[]>;
  metronome: boolean;
  countIn: number;
}

export interface PrefsData {
  theme: ThemeName;
  tracksRight: boolean;
  showGrid: boolean;
  vibrantClips: boolean;
  sampleRate: number;
  bufferSize: number;
  outputDevice: string;
  midiInput: string;
  midiThru: boolean;
  autoSave: boolean;
}

export interface SessionData {
  version: number;
  name: string;
  savedAt?: string;
  ui: SessionUi;
  /** Engine-owned payload (plugin state blobs); present only when hosted. */
  engine?: { plugins?: Record<string, string> };
}

export function serializeSession(s: DawState): SessionUi {
  return {
    tracks: s.tracks,
    groups: s.groups,
    assets: s.assets,
    nodeRacks: s.nodeRacks,
    bpm: s.bpm,
    loop: s.loop,
    loopStart: s.loopStart,
    loopEnd: s.loopEnd,
    volumes: s.volumes,
    pans: s.pans,
    mutes: s.mutes,
    solos: s.solos,
    arms: s.arms,
    masterVolume: s.masterVolume,
    masterPan: s.masterPan,
    groupVolumes: s.groupVolumes,
    groupPans: s.groupPans,
    groupMutes: s.groupMutes,
    groupSolos: s.groupSolos,
    sends: s.sends,
    returnGains: s.returnGains,
    trackFiles: s.trackFiles,
    devices: s.devices,
    preAmount: s.preAmount,
    autoLanes: s.autoLanes,
    autoParam: s.autoParam,
    autoData: s.autoData,
    metronome: s.metronome,
    countIn: s.countIn,
  };
}

export function serializePrefs(s: DawState): PrefsData {
  return {
    theme: s.theme,
    tracksRight: s.tracksRight,
    showGrid: s.showGrid,
    vibrantClips: s.vibrantClips,
    sampleRate: s.sampleRate,
    bufferSize: s.bufferSize,
    outputDevice: s.outputDevice,
    midiInput: s.midiInput,
    midiThru: s.midiThru,
    autoSave: s.autoSave,
  };
}

/** Build a complete SessionData from the current store (used by save/export). */
export function buildSession(name: string): SessionData {
  return {
    version: SESSION_VERSION,
    name,
    savedAt: new Date().toISOString(),
    ui: serializeSession(useDawStore.getState()),
  };
}

/** Hydrate the store from a loaded session and push it to the engine. Resets the
 *  undo history so you can't undo across a project load. */
export function applySession(data: SessionData): void {
  if (!data?.ui) return;
  useDawStore.getState().hydrateSession(data.ui);
  applySessionToEngine(useDawStore.getState());
  clearHistory();
}

/** Apply global preferences to the store (and audio device to the engine). */
export function applyPrefs(p: Partial<PrefsData>): void {
  if (!p) return;
  useDawStore.getState().hydratePrefs(p);

  if (engineActive()) {
    const opts: Record<string, unknown> = {};
    if (typeof p.sampleRate === "number") opts.sampleRate = Math.round(p.sampleRate * 1000);
    if (typeof p.bufferSize === "number") opts.bufferSize = p.bufferSize;
    if (typeof p.outputDevice === "string") opts.outputDevice = p.outputDevice;
    if (Object.keys(opts).length > 0)
      engine.audio.setSettings(opts).then((info) => {
        if (info) useDawStore.getState().setDeviceInfo(info);
      });
  }
}

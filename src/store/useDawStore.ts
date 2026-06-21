import { create } from "zustand";
import type {
  AutomationParam,
  AutoPoint,
  BrowserTab,
  DeviceKey,
  ThemeName,
} from "../types";
import { TRACK_DEFS } from "../data/seed";
import { DEFAULT_VOLUME, TOTAL_BEATS } from "../lib/constants";
import { getAutoPts } from "../lib/automation";
import { engine, engineActive } from "../lib/engine";
import type { EngineState, TrackInfos, DeviceInfo, NodeRacks } from "../lib/engine";
import { applySessionToEngine } from "../lib/engineSync";
import type { PrefsData, SessionUi } from "../lib/session";

type Bools = Record<string, boolean>;
type Nums = Record<string, number>;

// ---- automation engine push (debounced) ----
const autoPushTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Debounced push of one envelope to the engine, only while its lane is enabled.
 *  Re-checks the enabled flag when the timer fires so a disable in the meantime
 *  (which clears the engine envelope) is not undone by a stale push. */
function pushAutoIfEnabled(s: DawState, nodeId: string, param: AutomationParam, points: AutoPoint[]) {
  if (!engineActive() || !s.autoLanes[nodeId]) return;
  const key = nodeId + ":" + param;
  const prev = autoPushTimers.get(key);
  if (prev) clearTimeout(prev);
  autoPushTimers.set(
    key,
    setTimeout(() => {
      autoPushTimers.delete(key);
      if (useDawStore.getState().autoLanes[nodeId]) engine.automation.set(nodeId, param, points);
    }, 90),
  );
}
/** Param ids that have an edited envelope for a node (keys are `nodeId:param`). */
function nodeAutoParams(autoData: Record<string, AutoPoint[]>, nodeId: string): string[] {
  const prefix = nodeId + ":";
  return Object.keys(autoData)
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
}
/** Re-assert a track's manual mix values so manual control resumes after its
 *  automation lane is disabled (the engine atomics had been driven by the curve). */
function reassertTrackManual(s: DawState, id: string) {
  engine.mixer.setTrackVolume(id, s.volumes[id] ?? DEFAULT_VOLUME);
  engine.mixer.setTrackPan(id, s.pans[id] ?? 0.5);
  const snd = s.sends[id] ?? [];
  engine.mixer.setTrackSend(id, 0, snd[0] ?? 0);
  engine.mixer.setTrackSend(id, 1, snd[1] ?? 0);
}

export interface DawState {
  // ---- transport ----
  playing: boolean;
  recording: boolean;
  loop: boolean;
  /** Playhead position in beats (0..128). */
  playhead: number;
  bpm: number;

  // ---- selection ----
  selTrack: string; // track id or "master"
  selClip: string;

  // ---- session ----
  /** Name of the currently open named session, or null when untitled. */
  currentSessionName: string | null;

  // ---- per-track state ----
  mutes: Bools;
  solos: Bools;
  arms: Bools;
  volumes: Nums;
  pans: Nums; // track id -> 0 (L) .. 0.5 (C) .. 1 (R)
  trackFiles: TrackInfos;

  // ---- mixer / loop ----
  masterVolume: number;
  masterPan: number;
  loopStart: number;
  loopEnd: number;

  // ---- device rack ----
  devices: Record<DeviceKey, boolean>;
  preAmount: number;

  // ---- browser ----
  query: string;
  tab: BrowserTab;
  browserOpen: boolean;
  rackOpen: boolean;

  // ---- workspace appearance ----
  theme: ThemeName;
  tracksRight: boolean;
  showGrid: boolean;
  vibrantClips: boolean;

  // ---- settings ----
  settingsOpen: boolean;
  sessionsOpen: boolean;
  sampleRate: number;
  bufferSize: number;
  outputDevice: string;
  availableOutputs: string[];
  availableSampleRates: number[];
  availableBufferSizes: number[];
  midiInput: string;
  midiThru: boolean;
  metronome: boolean;
  countIn: number;
  autoSave: boolean;

  // ---- group buses (sub-mixes) ----
  groupVolumes: Nums;
  groupPans: Nums;
  groupMutes: Bools;
  groupSolos: Bools;

  // ---- aux sends / returns ----
  sends: Record<string, number[]>; // track id -> [sendA, sendB]
  returnGains: number[]; // [retA, retB]
  sendsOpen: Bools; // per-track sends-row expand

  // ---- groups & automation ----
  groupCollapsed: Bools;
  autoLanes: Bools;
  autoParam: Record<string, AutomationParam>;
  autoData: Record<string, AutoPoint[]>;

  // ---- transient (driven by the rAF loop) ----
  levels: Nums; // per-track meter levels 0..1
  groupLevels: Nums; // per-group meter levels 0..1
  returnLevels: number[]; // per-return meter levels 0..1
  nodeRacks: NodeRacks; // per-node insert FX contents (engine-driven)
  master: number; // master meter level 0..1
  reel: number; // tape-reel rotation in degrees

  // ---- actions ----
  togglePlay: () => void;
  stop: () => void;
  rewind: () => void;
  toggleRecord: () => void;
  toggleLoop: () => void;

  selectTrack: (id: string) => void;
  selectClip: (clipId: string, trackId: string) => void;
  toggleMute: (id: string) => void;
  toggleSolo: (id: string) => void;
  toggleArm: (id: string) => void;
  setVolume: (id: string, v: number) => void;
  setPan: (id: string, v: number) => void;
  setBpm: (v: number) => void;
  setMasterVolume: (v: number) => void;
  setMasterPan: (v: number) => void;
  setLoopStart: (v: number) => void;
  setLoopEnd: (v: number) => void;
  pickTrackFile: (id: string) => void;
  assignTrackFile: (id: string, path: string) => void;
  clearTrackFile: (id: string) => void;
  setEngineTracks: (t: TrackInfos) => void;
  refreshDevices: () => void;
  setDeviceInfo: (info: DeviceInfo) => void;

  // ---- session persistence ----
  setCurrentSessionName: (name: string | null) => void;
  /** Bulk-apply a loaded session's musical state to the store. */
  hydrateSession: (ui: Partial<SessionUi>) => void;
  /** Bulk-apply global preferences to the store. */
  hydratePrefs: (p: Partial<PrefsData>) => void;
  /** Reset the musical state to an empty, untitled session. */
  newSession: () => void;

  toggleGroup: (gid: string) => void;
  toggleGroupMute: (gid: string) => void;
  toggleGroupSolo: (gid: string) => void;
  setGroupVolume: (gid: string, v: number) => void;
  setGroupPan: (gid: string, v: number) => void;
  setSend: (id: string, idx: number, v: number) => void;
  setReturnGain: (idx: number, v: number) => void;
  toggleSendsRow: (id: string) => void;

  toggleDevice: (k: DeviceKey) => void;
  setPreAmount: (v: number) => void;

  onSearch: (q: string) => void;
  setTab: (t: BrowserTab) => void;
  toggleBrowser: () => void;
  toggleRack: () => void;

  setTheme: (t: ThemeName) => void;
  cycleTheme: () => void;
  setTracksRight: (v: boolean) => void;
  toggleTracksSide: () => void;
  toggleGrid: () => void;
  toggleVibrant: () => void;

  openTrackChain: (id: string) => void;
  openMasterChain: () => void;
  openGroupChain: (gid: string) => void;
  openReturnChain: (idx: number) => void;

  // ---- per-node insert FX ----
  setNodeRacks: (r: NodeRacks) => void;
  addNodeDevice: (nodeId: string, key: DeviceKey) => void;
  removeNodeDevice: (nodeId: string, key: DeviceKey) => void;
  setNodeDeviceBypass: (nodeId: string, key: DeviceKey, b: boolean) => void;
  openNodeEditor: (nodeId: string, key: DeviceKey) => void;
  openSettings: () => void;
  closeSettings: () => void;
  openSessions: () => void;
  closeSessions: () => void;

  setSampleRate: (v: number) => void;
  setBufferSize: (v: number) => void;
  setOutputDevice: (v: string) => void;
  setMidiInput: (v: string) => void;
  toggleMidiThru: () => void;
  toggleMetronome: () => void;
  setCountIn: (v: number) => void;
  toggleAutoSave: () => void;

  toggleAuto: (id: string) => void;
  setAutoParam: (id: string, param: AutomationParam) => void;
  /** Insert a breakpoint into a node's envelope (materializes the default curve
   *  on first edit), keeping points sorted by time. */
  addAutoPoint: (nodeId: string, param: AutomationParam, pt: AutoPoint) => void;
  /** Replace one breakpoint in place (caller clamps time within neighbors). */
  moveAutoPoint: (nodeId: string, param: AutomationParam, idx: number, pt: AutoPoint) => void;
  /** Remove one breakpoint (kept to a minimum of one point). */
  deleteAutoPoint: (nodeId: string, param: AutomationParam, idx: number) => void;
  /** Replace a node's whole envelope. */
  setAutoPoints: (nodeId: string, param: AutomationParam, points: AutoPoint[]) => void;

  /** Advance one animation frame; returns the current integer beat. */
  tick: (dt: number) => number;
  /** Apply engine-pushed state (playhead / meters / reel) when hosted. */
  setEngineState: (p: EngineState) => void;
}

export const useDawStore = create<DawState>((set, get) => ({
  playing: false,
  recording: false,
  loop: true,
  playhead: 64,
  bpm: 124,

  selTrack: "lead",
  selClip: "lead-drop",

  currentSessionName: null,

  mutes: {},
  solos: {},
  arms: { kick: true },
  volumes: {},
  pans: {},
  trackFiles: {},

  masterVolume: 1,
  masterPan: 0.5,
  loopStart: 0,
  loopEnd: TOTAL_BEATS,

  devices: { eq: true, tape: false, pre: true },
  preAmount: 0.62,

  query: "",
  tab: "all",
  browserOpen: true,
  rackOpen: true,

  theme: "dark",
  tracksRight: false,
  showGrid: true,
  vibrantClips: false,

  settingsOpen: false,
  sessionsOpen: false,
  sampleRate: 48,
  bufferSize: 256,
  outputDevice: "Built-in Output",
  availableOutputs: [],
  availableSampleRates: [],
  availableBufferSizes: [],
  midiInput: "All MIDI Inputs",
  midiThru: true,
  metronome: true,
  countIn: 1,
  autoSave: true,

  groupVolumes: {},
  groupPans: {},
  groupMutes: {},
  groupSolos: {},
  sends: {},
  returnGains: [1, 1],
  sendsOpen: {},
  groupCollapsed: {},
  autoLanes: {},
  autoParam: {},
  autoData: {},

  levels: {},
  groupLevels: {},
  returnLevels: [0, 0],
  nodeRacks: {},
  master: 0.04,
  reel: 0,

  togglePlay: () => {
    const playing = !get().playing;
    if (engineActive()) engine.transport.setPlaying(playing);
    set({ playing });
  },
  stop: () => {
    if (engineActive()) engine.transport.stop();
    set({ playing: false, playhead: 0 });
  },
  rewind: () => {
    if (engineActive()) engine.transport.setPosition(0);
    set({ playhead: 0 });
  },
  toggleRecord: () => {
    const recording = !get().recording;
    if (engineActive()) engine.transport.setRecording(recording);
    set({ recording });
  },
  toggleLoop: () => {
    const loop = !get().loop;
    if (engineActive()) engine.transport.setLooping(loop);
    set({ loop });
  },
  setBpm: (v) => {
    const bpm = Math.max(20, Math.round(v));
    if (engineActive()) engine.transport.setTempo(bpm);
    set({ bpm });
  },
  setLoopStart: (v) => {
    if (engineActive()) engine.transport.setLoopStart(v);
    set({ loopStart: v });
  },
  setLoopEnd: (v) => {
    if (engineActive()) engine.transport.setLoopEnd(v);
    set({ loopEnd: v });
  },

  selectTrack: (id) => set({ selTrack: id }),
  selectClip: (clipId, trackId) => set({ selClip: clipId, selTrack: trackId }),
  toggleMute: (id) => {
    const v = !get().mutes[id];
    if (engineActive()) engine.mixer.setTrackMute(id, v);
    set((s) => ({ mutes: { ...s.mutes, [id]: v } }));
  },
  toggleSolo: (id) => {
    const v = !get().solos[id];
    if (engineActive()) engine.mixer.setTrackSolo(id, v);
    set((s) => ({ solos: { ...s.solos, [id]: v } }));
  },
  toggleArm: (id) => {
    const v = !get().arms[id];
    if (engineActive()) engine.mixer.setTrackArm(id, v);
    set((s) => ({ arms: { ...s.arms, [id]: v } }));
  },
  setVolume: (id, v) => {
    if (engineActive()) engine.mixer.setTrackVolume(id, v);
    set((s) => ({ volumes: { ...s.volumes, [id]: v } }));
  },
  setPan: (id, v) => {
    if (engineActive()) engine.mixer.setTrackPan(id, v);
    set((s) => ({ pans: { ...s.pans, [id]: v } }));
  },
  setMasterVolume: (v) => {
    if (engineActive()) engine.mixer.setMasterVolume(v);
    set({ masterVolume: v });
  },
  setMasterPan: (v) => {
    if (engineActive()) engine.mixer.setMasterPan(v);
    set({ masterPan: v });
  },
  pickTrackFile: (id) => {
    if (engineActive()) engine.track.pickFile(id);
  },
  assignTrackFile: (id, path) => {
    if (engineActive()) engine.track.assignFile(id, path);
  },
  clearTrackFile: (id) => {
    if (engineActive()) engine.track.clearFile(id);
    set((s) => ({ trackFiles: { ...s.trackFiles, [id]: { loaded: false } } }));
  },
  setEngineTracks: (t) => set({ trackFiles: t }),

  setCurrentSessionName: (name) => set({ currentSessionName: name }),
  hydrateSession: (ui) =>
    set((s) => ({
      bpm: ui.bpm ?? s.bpm,
      loop: ui.loop ?? s.loop,
      loopStart: ui.loopStart ?? s.loopStart,
      loopEnd: ui.loopEnd ?? s.loopEnd,
      volumes: ui.volumes ?? s.volumes,
      pans: ui.pans ?? s.pans,
      mutes: ui.mutes ?? s.mutes,
      solos: ui.solos ?? s.solos,
      arms: ui.arms ?? s.arms,
      masterVolume: ui.masterVolume ?? s.masterVolume,
      masterPan: ui.masterPan ?? s.masterPan,
      groupVolumes: ui.groupVolumes ?? s.groupVolumes,
      groupPans: ui.groupPans ?? s.groupPans,
      groupMutes: ui.groupMutes ?? s.groupMutes,
      groupSolos: ui.groupSolos ?? s.groupSolos,
      sends: ui.sends ?? s.sends,
      returnGains: ui.returnGains ?? s.returnGains,
      trackFiles: ui.trackFiles ?? s.trackFiles,
      devices: ui.devices ?? s.devices,
      preAmount: ui.preAmount ?? s.preAmount,
      autoLanes: ui.autoLanes ?? s.autoLanes,
      autoParam: ui.autoParam ?? s.autoParam,
      autoData: ui.autoData ?? s.autoData,
      metronome: ui.metronome ?? s.metronome,
      countIn: ui.countIn ?? s.countIn,
    })),
  hydratePrefs: (p) =>
    set((s) => ({
      theme: p.theme ?? s.theme,
      tracksRight: p.tracksRight ?? s.tracksRight,
      showGrid: p.showGrid ?? s.showGrid,
      vibrantClips: p.vibrantClips ?? s.vibrantClips,
      sampleRate: p.sampleRate ?? s.sampleRate,
      bufferSize: p.bufferSize ?? s.bufferSize,
      outputDevice: p.outputDevice ?? s.outputDevice,
      midiInput: p.midiInput ?? s.midiInput,
      midiThru: p.midiThru ?? s.midiThru,
      autoSave: p.autoSave ?? s.autoSave,
    })),
  newSession: () => {
    set({
      bpm: 124,
      loop: true,
      loopStart: 0,
      loopEnd: TOTAL_BEATS,
      volumes: {},
      pans: {},
      mutes: {},
      solos: {},
      arms: {},
      masterVolume: 1,
      masterPan: 0.5,
      groupVolumes: {},
      groupPans: {},
      groupMutes: {},
      groupSolos: {},
      sends: {},
      returnGains: [1, 1],
      trackFiles: {},
      devices: { eq: true, tape: false, pre: true },
      preAmount: 0.62,
      autoLanes: {},
      autoParam: {},
      autoData: {},
      metronome: true,
      countIn: 1,
      currentSessionName: null,
    });
    applySessionToEngine(get());
  },

  toggleGroup: (gid) =>
    set((s) => ({ groupCollapsed: { ...s.groupCollapsed, [gid]: !s.groupCollapsed[gid] } })),
  toggleGroupMute: (gid) => {
    const v = !get().groupMutes[gid];
    if (engineActive()) engine.group.setMute(gid, v);
    set((s) => ({ groupMutes: { ...s.groupMutes, [gid]: v } }));
  },
  toggleGroupSolo: (gid) => {
    const v = !get().groupSolos[gid];
    if (engineActive()) engine.group.setSolo(gid, v);
    set((s) => ({ groupSolos: { ...s.groupSolos, [gid]: v } }));
  },
  setGroupVolume: (gid, v) => {
    if (engineActive()) engine.group.setGain(gid, v);
    set((s) => ({ groupVolumes: { ...s.groupVolumes, [gid]: v } }));
  },
  setGroupPan: (gid, v) => {
    if (engineActive()) engine.group.setPan(gid, v);
    set((s) => ({ groupPans: { ...s.groupPans, [gid]: v } }));
  },
  setSend: (id, idx, v) => {
    if (engineActive()) engine.mixer.setTrackSend(id, idx, v);
    set((s) => {
      const cur = s.sends[id] ? [...s.sends[id]] : [0, 0];
      cur[idx] = v;
      return { sends: { ...s.sends, [id]: cur } };
    });
  },
  setReturnGain: (idx, v) => {
    if (engineActive()) engine.returns.setGain(idx, v);
    set((s) => {
      const cur = [...s.returnGains];
      cur[idx] = v;
      return { returnGains: cur };
    });
  },
  toggleSendsRow: (id) => set((s) => ({ sendsOpen: { ...s.sendsOpen, [id]: !s.sendsOpen[id] } })),

  toggleDevice: (k) => {
    const enabled = !get().devices[k];
    // Store holds "enabled"; engine takes "bypassed" (the inverse).
    if (engineActive()) engine.device.setBypass(k, !enabled);
    set((s) => ({ devices: { ...s.devices, [k]: enabled } }));
  },
  setPreAmount: (v) => {
    if (engineActive()) engine.device.setParam("pre", "amount", v);
    set({ preAmount: v });
  },

  onSearch: (q) => set({ query: q }),
  setTab: (t) => set({ tab: t }),
  toggleBrowser: () => set((s) => ({ browserOpen: !s.browserOpen })),
  toggleRack: () => set((s) => ({ rackOpen: !s.rackOpen })),

  setTheme: (t) => set({ theme: t }),
  cycleTheme: () =>
    set((s) => ({ theme: s.theme === "dark" ? "light" : s.theme === "light" ? "midnight" : "dark" })),
  setTracksRight: (v) => set({ tracksRight: v }),
  toggleTracksSide: () => set((s) => ({ tracksRight: !s.tracksRight })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleVibrant: () => set((s) => ({ vibrantClips: !s.vibrantClips })),

  openTrackChain: (id) => set({ selTrack: id, rackOpen: true }),
  openMasterChain: () => set({ selTrack: "master", rackOpen: true }),
  openGroupChain: (gid) => set({ selTrack: gid, rackOpen: true }),
  openReturnChain: (idx) => set({ selTrack: `return-${idx}`, rackOpen: true }),

  setNodeRacks: (r) => set({ nodeRacks: r }),
  addNodeDevice: (nodeId, key) => {
    if (engineActive()) engine.node.add(nodeId, key);
  },
  removeNodeDevice: (nodeId, key) => {
    if (engineActive()) engine.node.remove(nodeId, key);
  },
  setNodeDeviceBypass: (nodeId, key, b) => {
    if (engineActive()) engine.node.setBypass(nodeId, key, b);
  },
  openNodeEditor: (nodeId, key) => {
    if (engineActive()) engine.node.openEditor(nodeId, key);
  },
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  openSessions: () => set({ sessionsOpen: true }),
  closeSessions: () => set({ sessionsOpen: false }),

  setSampleRate: (v) => {
    // UI works in kHz; the engine wants Hz. Reflect the actually-applied value.
    if (engineActive())
      engine.audio.setSettings({ sampleRate: Math.round(v * 1000) }).then((info) => {
        if (info) get().setDeviceInfo(info);
      });
    set({ sampleRate: v });
  },
  setBufferSize: (v) => {
    if (engineActive())
      engine.audio.setSettings({ bufferSize: v }).then((info) => {
        if (info) get().setDeviceInfo(info);
      });
    set({ bufferSize: v });
  },
  setOutputDevice: (v) => {
    if (engineActive())
      engine.audio.setSettings({ outputDevice: v }).then((info) => {
        if (info) get().setDeviceInfo(info);
      });
    set({ outputDevice: v });
  },
  refreshDevices: () => {
    if (!engineActive()) return;
    engine.audio.getDevices().then((info) => {
      if (info) get().setDeviceInfo(info);
    });
  },
  setDeviceInfo: (info) =>
    set((s) => ({
      outputDevice: info.outputDevice ?? s.outputDevice,
      sampleRate: typeof info.sampleRate === "number" ? info.sampleRate / 1000 : s.sampleRate,
      bufferSize: info.bufferSize ?? s.bufferSize,
      availableOutputs: info.outputs ?? s.availableOutputs,
      availableSampleRates: (info.sampleRates ?? []).map((hz) => hz / 1000),
      availableBufferSizes: info.bufferSizes ?? s.availableBufferSizes,
    })),
  setMidiInput: (v) => set({ midiInput: v }),
  toggleMidiThru: () => set((s) => ({ midiThru: !s.midiThru })),
  toggleMetronome: () => set((s) => ({ metronome: !s.metronome })),
  setCountIn: (v) => set({ countIn: v }),
  toggleAutoSave: () => set((s) => ({ autoSave: !s.autoSave })),

  toggleAuto: (id) => {
    const s = get();
    const on = !s.autoLanes[id];
    if (engineActive()) {
      const params = nodeAutoParams(s.autoData, id);
      if (on) {
        params.forEach((p) => engine.automation.set(id, p, s.autoData[id + ":" + p]));
      } else {
        params.forEach((p) => engine.automation.clear(id, p));
        reassertTrackManual(s, id);
      }
    }
    set({ autoLanes: { ...s.autoLanes, [id]: on } });
  },
  setAutoParam: (id, param) => set((s) => ({ autoParam: { ...s.autoParam, [id]: param } })),

  addAutoPoint: (nodeId, param, pt) => {
    const s = get();
    const cur = getAutoPts(s.autoData, nodeId, param);
    const next = [...cur, pt].sort((a, b) => a.t - b.t);
    set({ autoData: { ...s.autoData, [nodeId + ":" + param]: next } });
    pushAutoIfEnabled(s, nodeId, param, next);
  },
  moveAutoPoint: (nodeId, param, idx, pt) => {
    const s = get();
    const cur = getAutoPts(s.autoData, nodeId, param);
    if (idx < 0 || idx >= cur.length) return;
    const next = cur.map((p, i) => (i === idx ? pt : p));
    set({ autoData: { ...s.autoData, [nodeId + ":" + param]: next } });
    pushAutoIfEnabled(s, nodeId, param, next);
  },
  deleteAutoPoint: (nodeId, param, idx) => {
    const s = get();
    const cur = getAutoPts(s.autoData, nodeId, param);
    if (cur.length <= 1 || idx < 0 || idx >= cur.length) return;
    const next = cur.filter((_, i) => i !== idx);
    set({ autoData: { ...s.autoData, [nodeId + ":" + param]: next } });
    pushAutoIfEnabled(s, nodeId, param, next);
  },
  setAutoPoints: (nodeId, param, points) => {
    const s = get();
    set({ autoData: { ...s.autoData, [nodeId + ":" + param]: points } });
    pushAutoIfEnabled(s, nodeId, param, points);
  },

  tick: (dt) => {
    const s = get();
    let ph = s.playhead;
    let reel = s.reel;
    if (s.playing) {
      ph += dt * (s.bpm / 60);
      if (ph >= TOTAL_BEATS) ph -= TOTAL_BEATS;
      reel = (reel + dt * 300) % 360;
    }
    const soloActive = Object.values(s.solos).some(Boolean);
    let peak = 0;
    const levels: Nums = { ...s.levels };
    for (const td of TRACK_DEFS) {
      const muted = !!s.mutes[td.id];
      const solo = !!s.solos[td.id];
      const audible = !muted && (!soloActive || solo);
      const covered = td.clips.some((c) => ph >= c.bar * 4 && ph < (c.bar + c.len) * 4);
      const vol = s.volumes[td.id] ?? DEFAULT_VOLUME;
      const target = s.playing && audible && covered ? (0.42 + 0.5 * Math.random()) * vol : 0;
      const cur = levels[td.id] || 0;
      levels[td.id] = cur + (target - cur) * 0.3;
      if (audible) peak = Math.max(peak, levels[td.id]);
    }
    const master = s.playing ? Math.min(0.97, peak * 0.95 + 0.04) : 0.04;
    set({ playhead: ph, reel, levels, master });
    return Math.floor(ph);
  },

  setEngineState: (p) =>
    set((s) => ({
      playhead: p.playhead ?? s.playhead,
      playing: p.playing ?? s.playing,
      master: p.master ?? s.master,
      reel: p.reel ?? s.reel,
      levels: p.levels ?? s.levels,
      groupLevels: p.groupLevels ?? s.groupLevels,
      returnLevels: p.returnLevels ?? s.returnLevels,
      bpm: p.tempo ?? s.bpm,
      loopStart: p.loopStart ?? s.loopStart,
      loopEnd: p.loopEnd ?? s.loopEnd,
      masterVolume: p.masterVolume ?? s.masterVolume,
    })),
}));

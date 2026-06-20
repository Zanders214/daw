import { create } from "zustand";
import type {
  AutomationParam,
  AutoPoint,
  BrowserTab,
  DeviceKey,
  ThemeName,
} from "../types";
import { TRACK_DEFS, GROUP_DEFS } from "../data/seed";
import { DEFAULT_VOLUME, TOTAL_BEATS } from "../lib/constants";

type Bools = Record<string, boolean>;
type Nums = Record<string, number>;

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

  // ---- per-track state ----
  mutes: Bools;
  solos: Bools;
  arms: Bools;
  volumes: Nums;

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
  sampleRate: number;
  bufferSize: number;
  outputDevice: string;
  midiInput: string;
  midiThru: boolean;
  metronome: boolean;
  countIn: number;
  autoSave: boolean;

  // ---- groups & automation ----
  groupCollapsed: Bools;
  autoLanes: Bools;
  autoParam: Record<string, AutomationParam>;
  autoData: Record<string, AutoPoint[]>;

  // ---- transient (driven by the rAF loop) ----
  levels: Nums; // per-track meter levels 0..1
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

  toggleGroup: (gid: string) => void;
  toggleGroupMute: (gid: string) => void;
  toggleGroupSolo: (gid: string) => void;

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
  openSettings: () => void;
  closeSettings: () => void;

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
  setAutoPoint: (key: string, points: AutoPoint[]) => void;

  /** Advance one animation frame; returns the current integer beat. */
  tick: (dt: number) => number;
}

export const useDawStore = create<DawState>((set, get) => ({
  playing: false,
  recording: false,
  loop: true,
  playhead: 64,
  bpm: 124,

  selTrack: "lead",
  selClip: "lead-drop",

  mutes: {},
  solos: {},
  arms: { kick: true },
  volumes: {},

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
  sampleRate: 48,
  bufferSize: 256,
  outputDevice: "Built-in Output",
  midiInput: "All MIDI Inputs",
  midiThru: true,
  metronome: true,
  countIn: 1,
  autoSave: true,

  groupCollapsed: {},
  autoLanes: {},
  autoParam: {},
  autoData: {},

  levels: {},
  master: 0.04,
  reel: 0,

  togglePlay: () => set((s) => ({ playing: !s.playing })),
  stop: () => set({ playing: false, playhead: 0 }),
  rewind: () => set({ playhead: 0 }),
  toggleRecord: () => set((s) => ({ recording: !s.recording })),
  toggleLoop: () => set((s) => ({ loop: !s.loop })),

  selectTrack: (id) => set({ selTrack: id }),
  selectClip: (clipId, trackId) => set({ selClip: clipId, selTrack: trackId }),
  toggleMute: (id) => set((s) => ({ mutes: { ...s.mutes, [id]: !s.mutes[id] } })),
  toggleSolo: (id) => set((s) => ({ solos: { ...s.solos, [id]: !s.solos[id] } })),
  toggleArm: (id) => set((s) => ({ arms: { ...s.arms, [id]: !s.arms[id] } })),
  setVolume: (id, v) => set((s) => ({ volumes: { ...s.volumes, [id]: v } })),

  toggleGroup: (gid) =>
    set((s) => ({ groupCollapsed: { ...s.groupCollapsed, [gid]: !s.groupCollapsed[gid] } })),
  toggleGroupMute: (gid) =>
    set((s) => {
      const g = GROUP_DEFS.find((x) => x.id === gid);
      if (!g) return {};
      const all = g.tracks.every((id) => s.mutes[id]);
      const m = { ...s.mutes };
      g.tracks.forEach((id) => (m[id] = !all));
      return { mutes: m };
    }),
  toggleGroupSolo: (gid) =>
    set((s) => {
      const g = GROUP_DEFS.find((x) => x.id === gid);
      if (!g) return {};
      const all = g.tracks.every((id) => s.solos[id]);
      const so = { ...s.solos };
      g.tracks.forEach((id) => (so[id] = !all));
      return { solos: so };
    }),

  toggleDevice: (k) => set((s) => ({ devices: { ...s.devices, [k]: !s.devices[k] } })),
  setPreAmount: (v) => set({ preAmount: v }),

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
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),

  setSampleRate: (v) => set({ sampleRate: v }),
  setBufferSize: (v) => set({ bufferSize: v }),
  setOutputDevice: (v) => set({ outputDevice: v }),
  setMidiInput: (v) => set({ midiInput: v }),
  toggleMidiThru: () => set((s) => ({ midiThru: !s.midiThru })),
  toggleMetronome: () => set((s) => ({ metronome: !s.metronome })),
  setCountIn: (v) => set({ countIn: v }),
  toggleAutoSave: () => set((s) => ({ autoSave: !s.autoSave })),

  toggleAuto: (id) => set((s) => ({ autoLanes: { ...s.autoLanes, [id]: !s.autoLanes[id] } })),
  setAutoParam: (id, param) => set((s) => ({ autoParam: { ...s.autoParam, [id]: param } })),
  setAutoPoint: (key, points) => set((s) => ({ autoData: { ...s.autoData, [key]: points } })),

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
}));

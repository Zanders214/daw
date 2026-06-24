import { create } from "zustand";
import type {
  AudioAsset,
  AutomationParam,
  AutoPoint,
  BrowserTab,
  Clip,
  DeviceDescriptor,
  DeviceKey,
  Group,
  Note,
  ThemeName,
  Track,
  TrackType,
} from "../types";
import { TRACK_DEFS, GROUP_DEFS } from "../data/seed";
import {
  BEATS_PER_BAR,
  DEFAULT_VOLUME,
  NOTE_STEP,
  PITCH_MAX,
  PITCH_MIN,
  TOTAL_BARS,
  TOTAL_BEATS,
} from "../lib/constants";
import { newAssetId, newClipId, newGroupId, newInstanceId, newNoteId, newTrackId, TRACK_COLORS } from "../lib/dnd";
import { notesFromPattern } from "../lib/notes";
import { getAutoPts } from "../lib/automation";
import { engine, engineActive } from "../lib/engine";
import type { EngineState, TrackInfos, DeviceInfo, NodeDevice, NodeRacks, ImportedClip } from "../lib/engine";
import { applySessionToEngine } from "../lib/engineSync";
import { clearHistory } from "../lib/history";
import { decodeAudioFile, durationToBars } from "../lib/audioImport";
import type { PrefsData, SessionUi } from "../lib/session";

type Bools = Record<string, boolean>;
type Nums = Record<string, number>;

/** Group that holds tracks created without an explicit group (created on demand). */
const DEFAULT_GROUP: Group = { id: "g-tracks", name: "TRACKS", color: "#5e93ff", tracks: [] };

/** Smallest clip length in bars (allows fine, sub-bar resizes). */
const MIN_CLIP_LEN = 0.25;

/** Apply `fn` to the matching clip of a track, immutably. */
function mapClip(tracks: Track[], trackId: string, clipId: string, fn: (c: Clip) => Clip): Track[] {
  return tracks.map((t) =>
    t.id === trackId ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? fn(c) : c)) } : t,
  );
}

/** Deep-ish clone of the seed defs so the store owns mutable copies. */
const seedTracks = (): Track[] => TRACK_DEFS.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c })) }));
const seedGroups = (): Group[] => GROUP_DEFS.map((g) => ({ ...g, tracks: [...g.tracks] }));

/** Remove a key from a record, returning a new record (no-op if absent). */
function omit<T>(rec: Record<string, T>, key: string): Record<string, T> {
  if (!(key in rec)) return rec;
  const next = { ...rec };
  delete next[key];
  return next;
}

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
/** Re-assert a node's manual mix values so manual control resumes after its
 *  automation lane is disabled (the engine atomics had been driven by the curve). */
function reassertNodeManual(s: DawState, nodeId: string) {
  if (nodeId.startsWith("g-")) {
    engine.group.setGain(nodeId, s.groupVolumes[nodeId] ?? 1);
    engine.group.setPan(nodeId, s.groupPans[nodeId] ?? 0.5);
  } else if (nodeId.startsWith("return-")) {
    const i = Number(nodeId.slice("return-".length));
    engine.returns.setGain(i, s.returnGains[i] ?? 1);
  } else if (nodeId === "master") {
    engine.mixer.setMasterVolume(s.masterVolume);
    engine.mixer.setMasterPan(s.masterPan);
  } else {
    engine.mixer.setTrackVolume(nodeId, s.volumes[nodeId] ?? DEFAULT_VOLUME);
    engine.mixer.setTrackPan(nodeId, s.pans[nodeId] ?? 0.5);
    const snd = s.sends[nodeId] ?? [];
    engine.mixer.setTrackSend(nodeId, 0, snd[0] ?? 0);
    engine.mixer.setTrackSend(nodeId, 1, snd[1] ?? 0);
  }
}

// ---- pure arrangement transforms (top-level so nested store callbacks stay shallow) ----

/** Drop a track id from every group's member list. */
function dropTrackFromGroups(groups: Group[], id: string): Group[] {
  return groups.map((g) => ({ ...g, tracks: g.tracks.filter((t) => t !== id) }));
}
/** Remove one clip from its track (others untouched), clearing nothing else. */
function dropClipFromTracks(tracks: Track[], trackId: string, clipId: string): Track[] {
  return tracks.map((t) =>
    t.id === trackId ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t,
  );
}
/** Move `src` (with its clamped bar) from `srcTrackId` to `destTrackId`, keeping the id. */
function relocateClip(
  tracks: Track[],
  srcTrackId: string,
  destTrackId: string,
  clipId: string,
  src: Clip,
  bar: number,
): Track[] {
  return tracks.map((t) => {
    if (t.id === srcTrackId) return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
    if (t.id === destTrackId) return { ...t, clips: [...t.clips, { ...src, bar }] };
    return t;
  });
}
/** Drop every clip whose id is in `ids`, across all tracks. */
function dropClipsByIds(tracks: Track[], ids: Set<string>): Track[] {
  return tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => !ids.has(c.id)) }));
}
/** Build duplicate clips for one track's selected ids; pushes the new ids into `created`. */
function dupTrackClips(t: Track, ids: Set<string>, created: string[]): Clip[] {
  return t.clips
    .filter((c) => ids.has(c.id))
    .map((c) => {
      const id = newClipId();
      created.push(id);
      return {
        ...structuredClone(c),
        id,
        bar: Math.max(0, Math.min(TOTAL_BARS - c.len, c.bar + c.len)),
        notes: c.notes?.map((n) => ({ ...n, id: newNoteId() })),
      };
    });
}
/** Apply a batch of clip-bar updates (clamped) to one track's clips. */
function applyClipBars(t: Track, updates: { trackId: string; clipId: string; bar: number }[]): Clip[] {
  return t.clips.map((c) => {
    const u = updates.find((x) => x.trackId === t.id && x.clipId === c.id);
    return u ? { ...c, bar: Math.max(0, Math.min(TOTAL_BARS - c.len, u.bar)) } : c;
  });
}

// ---- pure note transforms (operate on a clip; keep store .map callbacks shallow) ----

/** Move one note's start/pitch within a clip of `beats` beats (clamped). */
function applyMoveNote(c: Clip, beats: number, noteId: string, start: number, pitch: number): Note[] {
  return (c.notes ?? []).map((n) =>
    n.id === noteId
      ? {
          ...n,
          start: Math.max(0, Math.min(beats - n.len, start)),
          pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(pitch))),
        }
      : n,
  );
}
/** Resize one note within a clip of `beats` beats (clamped). */
function applyResizeNote(c: Clip, beats: number, noteId: string, len: number): Note[] {
  return (c.notes ?? []).map((n) =>
    n.id === noteId ? { ...n, len: Math.max(NOTE_STEP, Math.min(beats - n.start, len)) } : n,
  );
}
/** Remove one note from a clip. */
function dropNote(c: Clip, noteId: string): Note[] {
  return (c.notes ?? []).filter((n) => n.id !== noteId);
}
/** Remove every note whose id is in `ids` from a clip. */
function dropNotes(c: Clip, ids: Set<string>): Note[] {
  return (c.notes ?? []).filter((n) => !ids.has(n.id));
}
/** Set one note's velocity (clamped to 0..1). */
function applyNoteVelocity(c: Clip, noteId: string, vel: number): Note[] {
  return (c.notes ?? []).map((n) =>
    n.id === noteId ? { ...n, velocity: Math.max(0, Math.min(1, vel)) } : n,
  );
}
/** Batch-set note start/pitch from `updates` within a clip of `beats` beats (clamped). */
function applyNotePositions(
  c: Clip,
  beats: number,
  updates: { id: string; start: number; pitch: number }[],
): Note[] {
  return (c.notes ?? []).map((n) => {
    const u = updates.find((x) => x.id === n.id);
    return u
      ? {
          ...n,
          start: Math.max(0, Math.min(beats - n.len, u.start)),
          pitch: Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(u.pitch))),
        }
      : n;
  });
}
/** Append `toAdd` notes to a clip of `beats` beats, clamping each into range. */
function applyPasteNotes(c: Clip, beats: number, toAdd: Note[]): Note[] {
  const clamped = toAdd.map((n) => ({
    ...n,
    len: Math.max(NOTE_STEP, Math.min(beats, n.len)),
    start: Math.max(0, Math.min(beats - Math.max(NOTE_STEP, n.len), n.start)),
  }));
  return [...(c.notes ?? []), ...clamped];
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
  /** Multi-clip selection set (marquee / shift-click); `selClip` is the primary. */
  selClips: string[];

  // ---- session ----
  /** Name of the currently open named session, or null when untitled. */
  currentSessionName: string | null;

  // ---- arrangement structure (source of truth; seeded from the demo project) ----
  tracks: Track[];
  groups: Group[];
  /** Imported audio asset metadata (decoded buffers live in lib/assetStore). */
  assets: Record<string, AudioAsset>;

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

  // ---- piano-roll editor ----
  editorOpen: boolean;
  editorClip: string;
  editorTrack: string;

  // ---- clip clipboard ----
  clipboard: Clip | null;
  noteClipboard: Note[] | null;

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
  /** Undo/redo stack depths (mirrored from the history module for button state). */
  undoDepth: number;
  redoDepth: number;

  // ---- actions ----
  togglePlay: () => void;
  stop: () => void;
  rewind: () => void;
  /** Seek the playhead to an absolute beat position (clamped to the timeline). */
  setPlayhead: (beats: number) => void;
  toggleRecord: () => void;
  toggleLoop: () => void;

  // ---- arrangement editing ----
  /** Create a track (optionally from a dropped instrument) and return its id. */
  addTrack: (opts?: {
    name?: string;
    type?: TrackType;
    color?: string;
    group?: string;
    instrument?: string;
  }) => string;
  /** Remove a track and prune all of its per-track state. */
  removeTrack: (id: string) => void;
  renameTrack: (id: string, name: string) => void;
  /** Load an instrument/sample onto a track (sets name/type) and drop a clip. */
  setTrackInstrument: (id: string, item: { name: string; type: TrackType }, atBar?: number) => void;
  addClip: (trackId: string, clip: Clip) => void;
  /** Register audio asset metadata (decoded buffer/peaks live in lib/assetStore). */
  addAsset: (asset: AudioAsset) => void;
  /** Drop audio asset metadata by id. */
  removeAsset: (id: string) => void;
  /** Decode an audio File and drop it as a new clip on `trackId` at `atBar`
   *  (browser path; the decoded buffer is cached in lib/assetStore). */
  importAudioFile: (file: File, trackId: string, atBar: number) => Promise<void>;
  /** Open the native chooser (hosted) to add an audio clip to a track at `atBar`. */
  pickClipFile: (trackId: string, atBar: number) => void;
  /** Apply a clip chosen via the native chooser (engineClipImported event). */
  addImportedClip: (p: ImportedClip) => void;
  /** Move a clip's start bar (clamped to the grid). */
  moveClip: (trackId: string, clipId: string, bar: number) => void;
  /** Resize a clip's length in bars (clamped to >=MIN and within the grid). */
  resizeClip: (trackId: string, clipId: string, len: number) => void;
  /** Set a clip's bar+len together (left-edge resize), jointly clamped. */
  setClipRegion: (trackId: string, clipId: string, bar: number, len: number) => void;
  removeClip: (trackId: string, clipId: string) => void;
  /** Duplicate a clip immediately after itself and select the copy. */
  duplicateClip: (trackId: string, clipId: string) => void;
  /** Move a clip to another track at `bar` (clamped); same id is kept. */
  moveClipToTrack: (srcTrackId: string, clipId: string, destTrackId: string, bar: number) => void;
  renameClip: (trackId: string, clipId: string, name: string) => void;
  copyClip: (trackId: string, clipId: string) => void;
  cutClip: (trackId: string, clipId: string) => void;
  /** Paste the clipboard clip (fresh ids) onto a track at `bar`; returns new id. */
  pasteClip: (trackId: string, bar: number) => string | null;

  // ---- piano-roll editor + MIDI notes ----
  openEditor: (trackId: string, clipId: string) => void;
  closeEditor: () => void;
  /** Materialize a clip's notes from its generated pattern if it has none yet. */
  ensureClipNotes: (trackId: string, clipId: string) => void;
  addNote: (trackId: string, clipId: string, note: Note) => void;
  moveNote: (trackId: string, clipId: string, noteId: string, start: number, pitch: number) => void;
  resizeNote: (trackId: string, clipId: string, noteId: string, len: number) => void;
  removeNote: (trackId: string, clipId: string, noteId: string) => void;
  setNoteVelocity: (trackId: string, clipId: string, noteId: string, vel: number) => void;
  /** Batch-set note start+pitch (clamped); used by multi-note drag. */
  setNotePositions: (trackId: string, clipId: string, updates: { id: string; start: number; pitch: number }[]) => void;
  removeNotes: (trackId: string, clipId: string, noteIds: string[]) => void;
  /** Copy notes (starts normalized so the earliest = 0) into the note clipboard. */
  copyNotes: (trackId: string, clipId: string, noteIds: string[]) => void;
  /** Paste the note clipboard at `anchorBeat`; returns the new note ids. */
  pasteNotes: (trackId: string, clipId: string, anchorBeat: number) => string[];
  addGroup: (name: string, color?: string) => string;
  removeGroup: (id: string) => void;

  selectTrack: (id: string) => void;
  selectClip: (clipId: string, trackId: string) => void;
  /** Toggle a clip in the multi-selection (shift-click). */
  toggleClipSelected: (clipId: string, trackId: string) => void;
  /** Replace the multi-selection (marquee). */
  setClipSelection: (clipIds: string[]) => void;
  clearClipSelection: () => void;
  /** Delete every clip in the multi-selection (across tracks). */
  removeSelectedClips: () => void;
  /** Duplicate every selected clip after itself; selects the copies. */
  duplicateSelectedClips: () => void;
  /** Batch-set clip bars (clamped); used by multi-clip drag. */
  setClipBars: (updates: { trackId: string; clipId: string; bar: number }[]) => void;
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
  /** Add a device instance to a node's rack; returns the new instance id. */
  addNodeDevice: (nodeId: string, d: DeviceDescriptor) => string;
  removeNodeDevice: (nodeId: string, instanceId: string) => void;
  setNodeDeviceBypass: (nodeId: string, instanceId: string, b: boolean) => void;
  openNodeEditor: (nodeId: string, instanceId: string) => void;
  /** Open a native chooser to add an external VST3 to a node rack (hosted only). */
  pickNodeDevice: (nodeId: string) => void;
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
  /** Push per-frame meter levels (real audio in the sim; peak-hold smoothed). */
  setMeterLevels: (levels: Nums, groupLevels: Nums, returnLevels: number[], master: number) => void;
  /** Apply engine-pushed state (playhead / meters / reel) when hosted. */
  setEngineState: (p: EngineState) => void;
  /** Mirror the history module's stack depths (for undo/redo button state). */
  setHistoryDepths: (undoDepth: number, redoDepth: number) => void;
}

export const useDawStore = create<DawState>((set, get) => ({
  playing: false,
  recording: false,
  loop: true,
  playhead: 64,
  bpm: 124,

  selTrack: "lead",
  selClip: "lead-drop",
  selClips: ["lead-drop"],

  currentSessionName: null,

  tracks: seedTracks(),
  groups: seedGroups(),
  assets: {},

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

  editorOpen: false,
  editorClip: "",
  editorTrack: "",
  clipboard: null,
  noteClipboard: null,

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
  undoDepth: 0,
  redoDepth: 0,

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
  setPlayhead: (beats) => {
    const ph = Math.max(0, Math.min(TOTAL_BEATS, beats));
    if (engineActive()) engine.transport.setPosition(ph);
    set({ playhead: ph });
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

  addTrack: (opts = {}) => {
    const id = newTrackId();
    const s = get();
    const color = opts.color ?? TRACK_COLORS[s.tracks.length % TRACK_COLORS.length];
    const type: TrackType = opts.type ?? "midi";
    const name = opts.name ?? `TRACK ${s.tracks.length + 1}`;
    const groupId = opts.group ?? DEFAULT_GROUP.id;
    const clips: Clip[] = opts.instrument
      ? [{ id: newClipId(), bar: 0, len: 8, name: opts.instrument }]
      : [];
    const track: Track = { id, name, color, io: "A1", type, clips };

    set((st) => {
      const hasGroup = st.groups.some((g) => g.id === groupId);
      const seeded = hasGroup ? st.groups : [...st.groups, { ...DEFAULT_GROUP, id: groupId, tracks: [] }];
      const groups = seeded.map((g) => (g.id === groupId ? { ...g, tracks: [...g.tracks, id] } : g));
      return { tracks: [...st.tracks, track], groups, selTrack: id };
    });

    if (engineActive()) engine.track.create(id, name, type, color, groupId);
    return id;
  },
  removeTrack: (id) => {
    if (engineActive()) engine.track.delete(id);
    set((s) => {
      const autoData = Object.fromEntries(
        Object.entries(s.autoData).filter(([k]) => !k.startsWith(id + ":")),
      );
      return {
        tracks: s.tracks.filter((t) => t.id !== id),
        groups: dropTrackFromGroups(s.groups, id),
        volumes: omit(s.volumes, id),
        pans: omit(s.pans, id),
        mutes: omit(s.mutes, id),
        solos: omit(s.solos, id),
        arms: omit(s.arms, id),
        sends: omit(s.sends, id),
        sendsOpen: omit(s.sendsOpen, id),
        trackFiles: omit(s.trackFiles, id),
        nodeRacks: omit(s.nodeRacks, id),
        levels: omit(s.levels, id),
        autoLanes: omit(s.autoLanes, id),
        autoParam: omit(s.autoParam, id),
        autoData,
        selTrack: s.selTrack === id ? "master" : s.selTrack,
      };
    });
  },
  renameTrack: (id, name) =>
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, name } : t)) })),
  setTrackInstrument: (id, item, atBar = 0) =>
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === id
          ? { ...t, name: item.name, type: item.type, clips: [...t.clips, { id: newClipId(), bar: atBar, len: 8, name: item.name }] }
          : t,
      ),
    })),
  addClip: (trackId, clip) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t)),
    })),
  addAsset: (asset) => set((s) => ({ assets: { ...s.assets, [asset.id]: asset } })),
  removeAsset: (id) => set((s) => ({ assets: omit(s.assets, id) })),
  importAudioFile: async (file, trackId, atBar) => {
    const res = await decodeAudioFile(file, get().bpm, atBar);
    if (!res) return;
    // One atomic update so undo treats "import audio clip" as a single step.
    set((s) => ({
      assets: { ...s.assets, [res.asset.id]: res.asset },
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, res.clip] } : t,
      ),
    }));
  },
  pickClipFile: (trackId, atBar) => {
    if (engineActive()) engine.track.pickClipFile(trackId, atBar);
  },
  addImportedClip: (p) => {
    // A native-chooser audio file → an asset carrying its disk path + a clip
    // sized from the file's duration. The path lets the engine play it per-clip.
    const id = newAssetId();
    const len = durationToBars(p.durationSec, get().bpm);
    const asset: AudioAsset = {
      id,
      name: p.name,
      duration: p.durationSec,
      sampleRate: 0,
      channels: 0,
      path: p.path,
    };
    set((s) => ({
      assets: { ...s.assets, [id]: asset },
      tracks: s.tracks.map((t) =>
        t.id === p.trackId
          ? { ...t, clips: [...t.clips, { id: newClipId(), bar: p.bar, len, name: p.name, src: id }] }
          : t,
      ),
    }));
    applySessionToEngine(get());
  },
  moveClip: (trackId, clipId, bar) =>
    set((s) => ({
      tracks: mapClip(s.tracks, trackId, clipId, (c) => ({
        ...c,
        bar: Math.max(0, Math.min(TOTAL_BARS - c.len, bar)),
      })),
    })),
  resizeClip: (trackId, clipId, len) =>
    set((s) => ({
      tracks: mapClip(s.tracks, trackId, clipId, (c) => ({
        ...c,
        len: Math.max(MIN_CLIP_LEN, Math.min(TOTAL_BARS - c.bar, len)),
      })),
    })),
  setClipRegion: (trackId, clipId, bar, len) =>
    set((s) => ({
      tracks: mapClip(s.tracks, trackId, clipId, (c) => {
        const L = Math.max(MIN_CLIP_LEN, Math.min(TOTAL_BARS, len));
        return { ...c, len: L, bar: Math.max(0, Math.min(TOTAL_BARS - L, bar)) };
      }),
    })),
  removeClip: (trackId, clipId) =>
    set((s) => ({
      tracks: dropClipFromTracks(s.tracks, trackId, clipId),
      selClip: s.selClip === clipId ? "" : s.selClip,
      selClips: s.selClips.filter((c) => c !== clipId),
    })),
  duplicateClip: (trackId, clipId) => {
    const src = get().tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId);
    if (!src) return;
    const id = newClipId();
    const bar = Math.max(0, Math.min(TOTAL_BARS - src.len, src.bar + src.len));
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, { ...src, id, bar }] } : t,
      ),
      selClip: id,
      selClips: [id],
    }));
  },
  moveClipToTrack: (srcTrackId, clipId, destTrackId, bar) => {
    if (srcTrackId === destTrackId) {
      get().moveClip(srcTrackId, clipId, bar);
      return;
    }
    const src = get().tracks.find((t) => t.id === srcTrackId)?.clips.find((c) => c.id === clipId);
    if (!src) return;
    const clamped = Math.max(0, Math.min(TOTAL_BARS - src.len, bar));
    set((s) => ({
      tracks: relocateClip(s.tracks, srcTrackId, destTrackId, clipId, src, clamped),
      selClip: clipId,
      selClips: [clipId],
      selTrack: destTrackId,
    }));
  },
  renameClip: (trackId, clipId, name) =>
    set((s) => ({ tracks: mapClip(s.tracks, trackId, clipId, (c) => ({ ...c, name })) })),
  copyClip: (trackId, clipId) => {
    const src = get().tracks.find((t) => t.id === trackId)?.clips.find((c) => c.id === clipId);
    if (src) set({ clipboard: structuredClone(src) });
  },
  cutClip: (trackId, clipId) => {
    get().copyClip(trackId, clipId);
    get().removeClip(trackId, clipId);
  },
  pasteClip: (trackId, bar) => {
    const cb = get().clipboard;
    if (!cb) return null;
    const id = newClipId();
    const clip: Clip = {
      ...structuredClone(cb),
      id,
      bar: Math.max(0, Math.min(TOTAL_BARS - cb.len, bar)),
      notes: cb.notes?.map((n) => ({ ...n, id: newNoteId() })),
    };
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t)),
      selClip: id,
      selClips: [id],
      selTrack: trackId,
    }));
    return id;
  },

  openEditor: (trackId, clipId) => {
    get().ensureClipNotes(trackId, clipId);
    set({ editorOpen: true, editorClip: clipId, editorTrack: trackId, selClip: clipId, selTrack: trackId });
  },
  closeEditor: () => set({ editorOpen: false, editorClip: "", editorTrack: "" }),
  ensureClipNotes: (trackId, clipId) => {
    const t = get().tracks.find((x) => x.id === trackId);
    const c = t?.clips.find((cc) => cc.id === clipId);
    if (!t || !c || c.notes) return;
    const notes = notesFromPattern(c, t);
    set((s) => ({ tracks: mapClip(s.tracks, trackId, clipId, (cc) => ({ ...cc, notes })) }));
  },
  addNote: (trackId, clipId, note) =>
    set((s) => ({
      tracks: mapClip(s.tracks, trackId, clipId, (c) => {
        const beats = c.len * BEATS_PER_BAR;
        const len = Math.max(NOTE_STEP, Math.min(beats, note.len));
        const start = Math.max(0, Math.min(beats - len, note.start));
        const pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(note.pitch)));
        const velocity = note.velocity ?? 0.8;
        return { ...c, notes: [...(c.notes ?? []), { ...note, start, len, pitch, velocity }] };
      }),
    })),
  moveNote: (trackId, clipId, noteId, start, pitch) =>
    set((s) => ({
      tracks: mapClip(s.tracks, trackId, clipId, (c) => ({
        ...c,
        notes: applyMoveNote(c, c.len * BEATS_PER_BAR, noteId, start, pitch),
      })),
    })),
  resizeNote: (trackId, clipId, noteId, len) =>
    set((s) => ({
      tracks: mapClip(s.tracks, trackId, clipId, (c) => ({
        ...c,
        notes: applyResizeNote(c, c.len * BEATS_PER_BAR, noteId, len),
      })),
    })),
  removeNote: (trackId, clipId, noteId) =>
    set((s) => ({
      tracks: mapClip(s.tracks, trackId, clipId, (c) => ({
        ...c,
        notes: dropNote(c, noteId),
      })),
    })),
  setNoteVelocity: (trackId, clipId, noteId, vel) =>
    set((s) => ({
      tracks: mapClip(s.tracks, trackId, clipId, (c) => ({
        ...c,
        notes: applyNoteVelocity(c, noteId, vel),
      })),
    })),
  setNotePositions: (trackId, clipId, updates) =>
    set((s) => ({
      tracks: mapClip(s.tracks, trackId, clipId, (c) => ({
        ...c,
        notes: applyNotePositions(c, c.len * BEATS_PER_BAR, updates),
      })),
    })),
  removeNotes: (trackId, clipId, noteIds) => {
    const ids = new Set(noteIds);
    set((s) => ({
      tracks: mapClip(s.tracks, trackId, clipId, (c) => ({
        ...c,
        notes: dropNotes(c, ids),
      })),
    }));
  },
  copyNotes: (trackId, clipId, noteIds) => {
    const ids = new Set(noteIds);
    const c = get().tracks.find((t) => t.id === trackId)?.clips.find((cc) => cc.id === clipId);
    const picked = (c?.notes ?? []).filter((n) => ids.has(n.id));
    if (picked.length === 0) return;
    const base = Math.min(...picked.map((n) => n.start));
    set({ noteClipboard: picked.map((n) => ({ ...n, start: n.start - base })) });
  },
  pasteNotes: (trackId, clipId, anchorBeat) => {
    const cb = get().noteClipboard;
    if (!cb || cb.length === 0) return [];
    const created: string[] = [];
    const toAdd = cb.map((n) => {
      const id = newNoteId();
      created.push(id);
      return { ...n, id, start: anchorBeat + n.start };
    });
    set((s) => ({
      tracks: mapClip(s.tracks, trackId, clipId, (c) => ({
        ...c,
        notes: applyPasteNotes(c, c.len * BEATS_PER_BAR, toAdd),
      })),
    }));
    return created;
  },

  addGroup: (name, color) => {
    const id = newGroupId();
    set((s) => ({
      groups: [...s.groups, { id, name, color: color ?? TRACK_COLORS[s.groups.length % TRACK_COLORS.length], tracks: [] }],
    }));
    return id;
  },
  removeGroup: (id) => {
    set((s) => {
      const gone = s.groups.find((g) => g.id === id);
      const orphans = gone?.tracks ?? [];
      let groups = s.groups.filter((g) => g.id !== id);
      if (orphans.length > 0) {
        const hasDefault = groups.some((g) => g.id === DEFAULT_GROUP.id);
        const seeded = hasDefault ? groups : [...groups, { ...DEFAULT_GROUP, tracks: [] }];
        groups = seeded.map((g) =>
          g.id === DEFAULT_GROUP.id ? { ...g, tracks: [...g.tracks, ...orphans] } : g,
        );
      }
      return { groups };
    });
  },

  selectTrack: (id) => set({ selTrack: id }),
  selectClip: (clipId, trackId) => set({ selClip: clipId, selTrack: trackId, selClips: [clipId] }),
  toggleClipSelected: (clipId, trackId) =>
    set((s) => {
      const has = s.selClips.includes(clipId);
      const selClips = has ? s.selClips.filter((c) => c !== clipId) : [...s.selClips, clipId];
      return { selClips, selClip: has ? (selClips[selClips.length - 1] ?? "") : clipId, selTrack: trackId };
    }),
  setClipSelection: (clipIds) =>
    set({ selClips: clipIds, selClip: clipIds[clipIds.length - 1] ?? "" }),
  clearClipSelection: () => set({ selClips: [], selClip: "" }),
  removeSelectedClips: () => {
    const ids = new Set(get().selClips);
    if (ids.size === 0) return;
    set((s) => ({
      tracks: dropClipsByIds(s.tracks, ids),
      selClips: [],
      selClip: "",
    }));
  },
  duplicateSelectedClips: () => {
    const ids = new Set(get().selClips);
    if (ids.size === 0) return;
    const created: string[] = [];
    set((s) => ({
      tracks: s.tracks.map((t) => {
        const dupes = dupTrackClips(t, ids, created);
        return dupes.length ? { ...t, clips: [...t.clips, ...dupes] } : t;
      }),
    }));
    set({ selClips: created, selClip: created[created.length - 1] ?? "" });
  },
  setClipBars: (updates) =>
    set((s) => ({
      tracks: s.tracks.map((t) => ({
        ...t,
        clips: applyClipBars(t, updates),
      })),
    })),
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
      tracks: ui.tracks ?? s.tracks,
      groups: ui.groups ?? s.groups,
      assets: ui.assets ?? s.assets,
      nodeRacks: ui.nodeRacks ?? s.nodeRacks,
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
      tracks: seedTracks(),
      groups: seedGroups(),
      assets: {},
      nodeRacks: {},
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
    clearHistory();
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
    set((s) => {
      const order = ["dark", "light", "midnight"] as const;
      const next = order[(order.indexOf(s.theme) + 1) % order.length];
      return { theme: next };
    }),
  setTracksRight: (v) => set({ tracksRight: v }),
  toggleTracksSide: () => set((s) => ({ tracksRight: !s.tracksRight })),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleVibrant: () => set((s) => ({ vibrantClips: !s.vibrantClips })),

  openTrackChain: (id) => set({ selTrack: id, rackOpen: true }),
  openMasterChain: () => set({ selTrack: "master", rackOpen: true }),
  openGroupChain: (gid) => set({ selTrack: gid, rackOpen: true }),
  openReturnChain: (idx) => set({ selTrack: `return-${idx}`, rackOpen: true }),

  setNodeRacks: (r) => set({ nodeRacks: r }),
  addNodeDevice: (nodeId, d) => {
    const id = newInstanceId();
    const dev: NodeDevice = { id, kind: d.kind, name: d.name, bypassed: false, path: d.path };
    set((s) => ({ nodeRacks: { ...s.nodeRacks, [nodeId]: [...(s.nodeRacks[nodeId] ?? []), dev] } }));
    if (engineActive()) engine.node.add(nodeId, id, d);
    return id;
  },
  removeNodeDevice: (nodeId, instanceId) => {
    if (engineActive()) engine.node.remove(nodeId, instanceId);
    set((s) => {
      const next = (s.nodeRacks[nodeId] ?? []).filter((dv) => dv.id !== instanceId);
      const racks = next.length > 0 ? { ...s.nodeRacks, [nodeId]: next } : omit(s.nodeRacks, nodeId);
      return { nodeRacks: racks };
    });
  },
  setNodeDeviceBypass: (nodeId, instanceId, b) => {
    if (engineActive()) engine.node.setBypass(nodeId, instanceId, b);
    set((s) => ({
      nodeRacks: {
        ...s.nodeRacks,
        [nodeId]: (s.nodeRacks[nodeId] ?? []).map((dv) =>
          dv.id === instanceId ? { ...dv, bypassed: b } : dv,
        ),
      },
    }));
  },
  openNodeEditor: (nodeId, instanceId) => {
    if (engineActive()) engine.node.openEditor(nodeId, instanceId);
  },
  pickNodeDevice: (nodeId) => {
    if (engineActive()) engine.node.pickFile(nodeId, newInstanceId());
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
        reassertNodeManual(s, id);
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
      if (s.loop && s.loopEnd > s.loopStart) {
        if (ph >= s.loopEnd) ph = s.loopStart + ((ph - s.loopStart) % (s.loopEnd - s.loopStart));
      } else if (ph >= TOTAL_BEATS) {
        ph -= TOTAL_BEATS;
      }
      reel = (reel + dt * 300) % 360;
    }
    set({ playhead: ph, reel });
    return Math.floor(ph);
  },

  setMeterLevels: (levels, groupLevels, returnLevels, master) =>
    set((s) => {
      // Peak-hold with decay so meters fall smoothly between frames.
      const hold = (next: Nums, prev: Nums): Nums => {
        const out: Nums = {};
        for (const k of Object.keys(next)) out[k] = Math.max(next[k], (prev[k] ?? 0) * 0.85);
        return out;
      };
      return {
        levels: hold(levels, s.levels),
        groupLevels: hold(groupLevels, s.groupLevels),
        returnLevels: returnLevels.map((v, i) => Math.max(v, (s.returnLevels[i] ?? 0) * 0.85)),
        master: Math.max(master, s.master * 0.85),
      };
    }),

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

  setHistoryDepths: (undoDepth, redoDepth) => set({ undoDepth, redoDepth }),
}));

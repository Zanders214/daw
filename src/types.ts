/** Core data model for the Zanders DAW. */

export type TrackType = "drum" | "midi" | "audio";

export interface Clip {
  id: string;
  /** Start bar (0-indexed). */
  bar: number;
  /** Length in bars. */
  len: number;
  name: string;
  /** Edited MIDI notes. When absent, a pattern is generated for display. */
  notes?: Note[];
}

/** An editable MIDI note within a clip. */
export interface Note {
  id: string;
  /** Start in beats relative to the clip start (0..len*BEATS_PER_BAR). */
  start: number;
  /** Length in beats. */
  len: number;
  /** Absolute pitch (semitone / MIDI note number). */
  pitch: number;
  /** Velocity 0..1 (defaults to 0.8 when absent). */
  velocity?: number;
}

export interface Track {
  id: string;
  name: string;
  /** Track accent color (hex). */
  color: string;
  /** I/O routing tag, e.g. "A1", "FX". */
  io: string;
  type: TrackType;
  clips: Clip[];
}

export interface Group {
  id: string;
  name: string;
  color: string;
  /** Member track ids. */
  tracks: string[];
}

export type ThemeName = "dark" | "light" | "midnight";

export type BrowserTab = "all" | "inst" | "fx" | "audio" | "midi" | "preset";

/**
 * An automation target parameter on a mix node. Mixer params are fixed tokens;
 * device (plugin) params use `dev:<slot>:<index>`. Legacy `"filt"` is accepted
 * for back-compat with v1 sessions but is inert (it renders, but never reaches
 * the audio engine). The `string & {}` arm keeps literal autocompletion while
 * allowing dynamic device-param tokens.
 */
export type AutomationParam =
  | "vol"
  | "pan"
  | "sendA"
  | "sendB"
  | "mvol"
  | "mpan"
  | "rgain"
  | (string & {});

/** A single automation breakpoint: time (in beats) → value (0..1). */
export interface AutoPoint {
  t: number;
  v: number;
}

/** The three built-in house plugins (fixed master chain + built-in inserts). */
export type DeviceKey = "eq" | "tape" | "pre";

/**
 * How the engine instantiates a device in a node's insert rack. The built-in
 * `DeviceKey`s resolve to the bundled house plugins; `"vst3"` (with a `path`)
 * loads an arbitrary external plugin; any other token is a known-but-unbundled
 * built-in FX that renders in the UI but has no audio processor (shows as
 * `missing` when hosted). The `string & {}` arm keeps literal autocompletion. */
export type DeviceKind = DeviceKey | "vst3" | (string & {});

/** A descriptor used to add a device to a rack (the store assigns the id). */
export interface DeviceDescriptor {
  kind: DeviceKind;
  name: string;
  /** VST3/AU file path; only for `kind: "vst3"`. */
  path?: string;
}

export interface BrowserItem {
  kind: Exclude<BrowserTab, "all">;
  glyph: string;
  name: string;
}

export interface BrowserCategory {
  name: string;
  color: string;
  items: BrowserItem[];
}

/** A generated MIDI note for in-clip piano-roll visualization. */
export interface ClipNote {
  /** Normalized x position 0..1 within the clip. */
  x: number;
  /** Normalized width 0..1. */
  w: number;
  /** Pitch row 0..7 (top = high). */
  row: number;
}

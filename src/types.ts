/** Core data model for the Zanders DAW. */

export type TrackType = "drum" | "midi" | "audio";

export interface Clip {
  id: string;
  /** Start bar (0-indexed). */
  bar: number;
  /** Length in bars. */
  len: number;
  name: string;
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

export type DeviceKey = "eq" | "tape" | "pre";

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

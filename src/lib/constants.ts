/** Timeline geometry shared across the arrange view and transport. */
export const TOTAL_BARS = 32;
export const BEATS_PER_BAR = 4;
export const TOTAL_BEATS = TOTAL_BARS * BEATS_PER_BAR; // 128

/** Default per-track volume (0..1) when none has been set. */
export const DEFAULT_VOLUME = 0.8;

/** Piano-roll editor pitch range (C3..C6, inclusive) and default note grid. */
export const PITCH_MIN = 48;
export const PITCH_MAX = 84;
/** Default note-edit grid in beats (16th note). */
export const NOTE_STEP = 0.25;

/**
 * Resizable-layout bounds (px). Defaults match the values these panels/lanes
 * were previously hardcoded to, so existing sessions look identical until the
 * user drags a divider. Track lanes are taller-only for now (MIN = DEFAULT)
 * because the dense track header is laid out for the default height.
 */
export const DEFAULT_TRACK_H = 108;
export const MIN_TRACK_H = 108;
export const MAX_TRACK_H = 400;

export const DEFAULT_BROWSER_W = 288;
export const MIN_BROWSER_W = 200;
export const MAX_BROWSER_W = 560;

export const DEFAULT_RACK_H = 300;
export const MIN_RACK_H = 140;
export const MAX_RACK_H = 600;

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

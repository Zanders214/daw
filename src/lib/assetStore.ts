/**
 * In-memory registry of decoded audio for imported assets — deliberately kept
 * OUT of the Zustand store and out of session serialization.
 *
 * Decoded `AudioBuffer`s and their precomputed waveform peaks are large and
 * non-serializable; putting them in app state would blow up autosave/undo's
 * `JSON.stringify`. The store holds only `AudioAsset` metadata (keyed by id);
 * the heavy data lives here, keyed by the same id, and is repopulated by
 * re-decoding on import (and, in a future phase, on session reload).
 */
import type { WaveformPeaks } from "./waveform";

export interface DecodedAsset {
  buffer: AudioBuffer;
  peaks: WaveformPeaks;
}

const decoded = new Map<string, DecodedAsset>();

export function putAsset(id: string, entry: DecodedAsset): void {
  decoded.set(id, entry);
}

export function getAsset(id: string): DecodedAsset | undefined {
  return decoded.get(id);
}

export function hasAsset(id: string): boolean {
  return decoded.has(id);
}

export function deleteAsset(id: string): void {
  decoded.delete(id);
}

export function clearAssets(): void {
  decoded.clear();
}

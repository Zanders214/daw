/**
 * Browser audio import: decode a File into an AudioBuffer, extract waveform
 * peaks, cache both in lib/assetStore, and return the serializable asset
 * metadata plus a Clip that references it. The store action `importAudioFile`
 * commits the returned pair atomically (one undo step).
 *
 * No-ops gracefully (returns null) when there is no AudioContext (SSR / tests
 * without the fake) or the file can't be decoded.
 */
import { ensureAudio } from "./audio";
import { computePeaks } from "./waveform";
import { putAsset } from "./assetStore";
import { newAssetId, newClipId } from "./dnd";
import { BEATS_PER_BAR, TOTAL_BARS } from "./constants";
import type { AudioAsset, Clip } from "../types";

const MIN_LEN = 0.25; // bars

export interface ImportResult {
  asset: AudioAsset;
  clip: Clip;
}

/** Convert a clip's audio duration (seconds) to a length in bars at `bpm`. */
export function durationToBars(durationSec: number, bpm: number): number {
  const beats = durationSec * (bpm / 60);
  return Math.max(MIN_LEN, beats / BEATS_PER_BAR);
}

export async function decodeAudioFile(
  file: File,
  bpm: number,
  atBar: number,
): Promise<ImportResult | null> {
  const ctx = ensureAudio();
  if (!ctx) return null;

  let buffer: AudioBuffer;
  try {
    const bytes = await file.arrayBuffer();
    buffer = await ctx.decodeAudioData(bytes);
  } catch {
    return null;
  }

  const id = newAssetId();
  putAsset(id, { buffer, peaks: computePeaks(buffer) });

  const asset: AudioAsset = {
    id,
    name: file.name,
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
  };

  const bar = Math.max(0, Math.min(TOTAL_BARS - MIN_LEN, atBar));
  const len = Math.min(durationToBars(buffer.duration, bpm), TOTAL_BARS - bar);
  const clip: Clip = { id: newClipId(), bar, len, name: file.name, src: id };

  return { asset, clip };
}

/**
 * Waveform peak extraction — pure, no Web Audio nodes (just reads channel data).
 * Reduces a decoded buffer to a fixed number of min/max buckets for cheap,
 * resolution-independent rendering in the arrange view.
 */

/** Per-bucket min/max sample amplitudes across the buffer's duration. */
export interface WaveformPeaks {
  /** Most-negative sample in each bucket (in [-1, 0]). */
  min: Float32Array;
  /** Most-positive sample in each bucket (in [0, 1]). */
  max: Float32Array;
  /** Number of buckets (== min.length == max.length). */
  length: number;
}

/** Minimal shape of the parts of AudioBuffer we read (so fakes/tests work). */
export interface BufferLike {
  length: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

/**
 * Compute `buckets` min/max peaks over the (mono-summed) buffer. Buckets with no
 * samples (empty buffer) stay at 0. Channels are averaged so stereo files render
 * as one summed waveform.
 */
export function computePeaks(buffer: BufferLike, buckets = 1024): WaveformPeaks {
  const n = Math.max(1, Math.floor(buckets));
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  const frames = buffer.length;
  const channels = Math.max(1, buffer.numberOfChannels);
  if (frames === 0) return { min, max, length: n };

  const data: Float32Array[] = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));

  const per = frames / n;
  for (let b = 0; b < n; b++) {
    const start = Math.floor(b * per);
    const end = b === n - 1 ? frames : Math.floor((b + 1) * per);
    const { lo, hi } = bucketRange(data, channels, start, end);
    min[b] = lo;
    max[b] = hi;
  }
  return { min, max, length: n };
}

/** Min/max of the channel-averaged samples over the half-open range [start, end). */
function bucketRange(
  data: Float32Array[],
  channels: number,
  start: number,
  end: number,
): { lo: number; hi: number } {
  let lo = 0;
  let hi = 0;
  for (let i = start; i < end; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += data[c][i];
    const v = sum / channels;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { lo, hi };
}

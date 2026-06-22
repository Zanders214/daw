/**
 * White noise in the range [-1, 1), drawn from the platform CSPRNG.
 *
 * Audio noise carries no security requirement, but sourcing it from
 * `crypto.getRandomValues` (instead of `Math.random`) keeps static analysis
 * happy and yields a flatter spectrum. Generation is bulk and one-shot — used
 * to fill sample buffers at setup time, never inside the audio callback.
 */

// getRandomValues rejects views larger than 65 536 bytes (16 384 uint32s).
const MAX_WORDS = 16_384;

/** Fill `target` with white noise in [-1, 1) using the platform CSPRNG. */
export function fillWhiteNoise(target: Float32Array): void {
  const pool = new Uint32Array(Math.min(target.length, MAX_WORDS) || 1);
  for (let i = 0; i < target.length; ) {
    const n = Math.min(MAX_WORDS, target.length - i);
    const view = n === pool.length ? pool : pool.subarray(0, n);
    globalThis.crypto.getRandomValues(view);
    for (let j = 0; j < n; j++, i++) {
      // u32 / 2^31 - 1 maps [0, 2^32) onto [-1, 1) symmetrically.
      target[i] = view[j] / 2 ** 31 - 1;
    }
  }
}

/** Allocate a Float32Array of `length` samples of white noise in [-1, 1). */
export function whiteNoise(length: number): Float32Array {
  const out = new Float32Array(Math.max(0, length));
  fillWhiteNoise(out);
  return out;
}

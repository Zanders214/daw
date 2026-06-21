/**
 * Deterministic seeded PRNG (FNV-1a hash → mulberry32-style generator).
 * Returns a function producing reproducible floats in [0, 1) for a given
 * string seed — used so generated note patterns / automation curves are
 * stable across renders.
 */
export function seed(str: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.codePointAt(i) ?? 0;
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

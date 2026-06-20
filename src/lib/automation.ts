import type { AutoPoint, AutomationParam } from "../types";
import { seed } from "./prng";
import { TOTAL_BEATS } from "./constants";

/**
 * Generate a deterministic 5-point default automation envelope for a given
 * track + parameter. Pan hovers around center; volume rides high; other
 * params (e.g. filter) sweep a mid range.
 */
export function defaultAuto(id: string, param: AutomationParam): AutoPoint[] {
  const rng = seed(id + param);
  const n = 5;
  const pts: AutoPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * TOTAL_BEATS;
    let v: number;
    if (param === "pan") v = 0.5 + (rng() - 0.5) * 0.5;
    else if (param === "vol") v = 0.55 + rng() * 0.4;
    else v = 0.25 + rng() * 0.6;
    pts.push({ t, v });
  }
  return pts;
}

/** Cache of generated default envelopes, keyed by `${id}:${param}`, so the
 * curve stays referentially stable until the user edits it. */
const defaultCache = new Map<string, AutoPoint[]>();

/**
 * Resolve the active envelope for a track+param: user-edited data when present,
 * otherwise a deterministic (cached) default curve.
 */
export function getAutoPts(
  autoData: Record<string, AutoPoint[]>,
  id: string,
  param: AutomationParam,
): AutoPoint[] {
  const k = id + ":" + param;
  const edited = autoData[k];
  if (edited) return edited;
  let cached = defaultCache.get(k);
  if (!cached) {
    cached = defaultAuto(id, param);
    defaultCache.set(k, cached);
  }
  return cached;
}

/** Linearly interpolate the envelope value at playhead position `ph` (beats). */
export function valAt(pts: AutoPoint[], ph: number): number {
  if (!pts.length) return 0;
  if (ph <= pts[0].t) return pts[0].v;
  for (let i = 1; i < pts.length; i++) {
    if (ph <= pts[i].t) {
      const a = pts[i - 1];
      const b = pts[i];
      const f = (ph - a.t) / ((b.t - a.t) || 1);
      return a.v + (b.v - a.v) * f;
    }
  }
  return pts[pts.length - 1].v;
}

/** Format an automation value for the live readout. */
export function fmtAuto(param: AutomationParam, v: number): string {
  if (param === "pan") {
    if (v < 0.48) return "L" + Math.round((0.5 - v) * 200);
    if (v > 0.52) return "R" + Math.round((v - 0.5) * 200);
    return "C";
  }
  if (param === "filt") return Math.round(200 * Math.pow(100, v)) + " Hz";
  return Math.round(v * 100) + "%";
}

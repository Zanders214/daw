/**
 * Shared geometry + pointer helpers for the arrange timeline (ruler, clips,
 * playhead, loop region). All horizontal positions map a pointer's clientX within
 * a full-timeline-width element to musical time; the ruler bar-area and the lanes
 * column share that width, so one mapping serves both.
 */
import { TOTAL_BARS, TOTAL_BEATS } from "./constants";

/** Pointer clientX → beats within a full-width timeline element. */
export const beatsAt = (clientX: number, rect: DOMRect): number =>
  rect.width > 0 ? ((clientX - rect.left) / rect.width) * TOTAL_BEATS : 0;

/** Pointer clientX → bars within a full-width timeline element. */
export const barsAt = (clientX: number, rect: DOMRect): number =>
  rect.width > 0 ? ((clientX - rect.left) / rect.width) * TOTAL_BARS : 0;

/** Round `value` to the nearest multiple of `step`. */
export const snap = (value: number, step: number): number =>
  step > 0 ? Math.round(value / step) * step : value;

/** Run `onMove` for the duration of a pointer drag via global listeners, cleaning
 *  up on pointerup (mirrors AutomationLane's drag idiom). */
export function startDrag(onMove: (ev: PointerEvent) => void): void {
  const up = () => {
    globalThis.removeEventListener("pointermove", onMove);
    globalThis.removeEventListener("pointerup", up);
  };
  globalThis.addEventListener("pointermove", onMove);
  globalThis.addEventListener("pointerup", up);
}

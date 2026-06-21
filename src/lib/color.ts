/** Convert a #rrggbb hex color + alpha (0..1) into an rgba() string. */
export function hexA(h: string, a: number): string {
  const n = h.replace("#", "");
  const r = Number.parseInt(n.slice(0, 2), 16);
  const g = Number.parseInt(n.slice(2, 4), 16);
  const b = Number.parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

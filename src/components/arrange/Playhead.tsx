import { useDawStore } from "../../store/useDawStore";
import { TOTAL_BEATS } from "../../lib/constants";

/** Vertical playhead line spanning the lanes column (live: subscribes to playhead). */
export function PlayheadLine() {
  const ph = useDawStore((s) => s.playhead);
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: (ph / TOTAL_BEATS) * 100 + "%",
        width: 2,
        background: "#fff",
        boxShadow: "0 0 10px rgba(255,255,255,0.75)",
        zIndex: 6,
        pointerEvents: "none",
      }}
    />
  );
}

/** Triangle playhead marker that rides the ruler (live: subscribes to playhead). */
export function PlayheadMarker() {
  const ph = useDawStore((s) => s.playhead);
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: (ph / TOTAL_BEATS) * 100 + "%",
        width: 0,
        height: 0,
        borderLeft: "5px solid transparent",
        borderRight: "5px solid transparent",
        borderTop: "7px solid #fff",
        transform: "translateX(-5px)",
        zIndex: 6,
        filter: "drop-shadow(0 0 6px rgba(255,255,255,0.7))",
      }}
    />
  );
}

/** Faint loop-region tint across the whole timeline when LOOP is engaged. */
export function LoopRegion() {
  const loop = useDawStore((s) => s.loop);
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: "0%",
        width: "100%",
        pointerEvents: "none",
        zIndex: 1,
        borderLeft: loop ? "1px solid var(--accent-line)" : "none",
        borderRight: loop ? "1px solid var(--accent-line)" : "none",
        background: loop ? "linear-gradient(180deg, rgba(94,147,255,0.04), transparent 40px)" : "none",
      }}
    />
  );
}

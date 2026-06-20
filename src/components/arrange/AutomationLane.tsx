import { useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { getAutoPts } from "../../lib/automation";
import { hexA } from "../../lib/color";
import { TOTAL_BEATS } from "../../lib/constants";
import type { AutoPoint, Track } from "../../types";

export function AutomationLane({ track }: { track: Track }) {
  const id = track.id;
  const laneRef = useRef<HTMLDivElement>(null);
  const { param, pts, setAutoPoint } = useDawStore(
    useShallow((s) => {
      const p = s.autoParam[id] || "vol";
      return { param: p, pts: getAutoPts(s.autoData, id, p), setAutoPoint: s.setAutoPoint };
    }),
  );

  const key = id + ":" + param;
  const poly = pts
    .map((p) => `${((p.t / TOTAL_BEATS) * 100).toFixed(2)},${((1 - p.v) * 100).toFixed(2)}`)
    .join(" ");

  const startDrag = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const lane = laneRef.current;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const startPts = pts;
    const move = (ev: PointerEvent) => {
      const v = Math.max(0, Math.min(1, 1 - (ev.clientY - rect.top) / rect.height));
      const next: AutoPoint[] = startPts.map((p, i) => (i === idx ? { ...p, v } : p));
      setAutoPoint(key, next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={laneRef}
      style={{
        position: "relative",
        height: 64,
        borderBottom: "1px solid var(--layer-2)",
        background: hexA(track.color, 0.04),
      }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <polyline
          points={poly}
          fill="none"
          stroke={track.color}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {pts.map((p, idx) => (
        <div
          key={idx}
          onPointerDown={startDrag(idx)}
          style={{
            position: "absolute",
            left: (p.t / TOTAL_BEATS) * 100 + "%",
            top: (1 - p.v) * 100 + "%",
            width: 11,
            height: 11,
            marginLeft: -6,
            marginTop: -6,
            borderRadius: "50%",
            background: track.color,
            boxShadow: `0 0 7px ${track.color}`,
            cursor: "ns-resize",
            zIndex: 3,
            touchAction: "none",
          }}
        />
      ))}
    </div>
  );
}

import { useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { getAutoPts } from "../../lib/automation";
import { hexA } from "../../lib/color";
import { TOTAL_BEATS } from "../../lib/constants";
import type { AutoPoint, Track } from "../../types";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
/** Minimum time gap kept between adjacent breakpoints so they never cross. */
const EPS = 0.01;

export function AutomationLane({ track }: { track: Track }) {
  const id = track.id;
  const laneRef = useRef<HTMLDivElement>(null);
  const { param, pts, addAutoPoint, moveAutoPoint, deleteAutoPoint } = useDawStore(
    useShallow((s) => {
      const p = s.autoParam[id] || "vol";
      return {
        param: p,
        pts: getAutoPts(s.autoData, id, p),
        addAutoPoint: s.addAutoPoint,
        moveAutoPoint: s.moveAutoPoint,
        deleteAutoPoint: s.deleteAutoPoint,
      };
    }),
  );

  const poly = pts
    .map((p) => `${((p.t / TOTAL_BEATS) * 100).toFixed(2)},${((1 - p.v) * 100).toFixed(2)}`)
    .join(" ");

  /** Map a pointer event to lane-local (beats, value). */
  const toCoords = (clientX: number, clientY: number, rect: DOMRect): AutoPoint => ({
    t: clamp01((clientX - rect.left) / rect.width) * TOTAL_BEATS,
    v: clamp01(1 - (clientY - rect.top) / rect.height),
  });

  /** Click on empty lane → add a breakpoint there. */
  const addPoint = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const lane = laneRef.current;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    addAutoPoint(id, param, toCoords(e.clientX, e.clientY, rect));
  };

  /** Drag a handle on both axes (time clamped between its neighbors). */
  const startDrag = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0) return;
    if (e.altKey) {
      deleteAutoPoint(id, param, idx);
      return;
    }
    const lane = laneRef.current;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const lo = idx > 0 ? pts[idx - 1].t + EPS : 0;
    const hi = idx < pts.length - 1 ? pts[idx + 1].t - EPS : TOTAL_BEATS;
    const move = (ev: PointerEvent) => {
      const c = toCoords(ev.clientX, ev.clientY, rect);
      moveAutoPoint(id, param, idx, { t: Math.max(lo, Math.min(hi, c.t)), v: c.v });
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
      onPointerDown={addPoint}
      title="Click to add a point · drag to move · alt/right-click to delete"
      style={{
        position: "relative",
        height: 64,
        borderBottom: "1px solid var(--layer-2)",
        background: hexA(track.color, 0.04),
        cursor: "crosshair",
      }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
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
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteAutoPoint(id, param, idx);
          }}
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
            cursor: "move",
            zIndex: 3,
            touchAction: "none",
          }}
        />
      ))}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { getAutoPts, valAt, fmtAuto } from "../../lib/automation";
import { engine } from "../../lib/engine";
import type { NodeDevice } from "../../lib/engine";
import { hexA } from "../../lib/color";
import { TOTAL_BEATS } from "../../lib/constants";
import type { AutoPoint, AutomationParam } from "../../types";

const NO_DEVICES: NodeDevice[] = [];

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
/** Minimum time gap kept between adjacent breakpoints so they never cross. */
const EPS = 0.01;

/** Automatable params per node type (chip token → label). */
export const TRACK_AUTO_PARAMS: [AutomationParam, string][] = [
  ["vol", "VOL"],
  ["pan", "PAN"],
  ["sendA", "SEND A"],
  ["sendB", "SEND B"],
];
export const GROUP_AUTO_PARAMS: [AutomationParam, string][] = [
  ["vol", "VOL"],
  ["pan", "PAN"],
];

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.06em",
    cursor: "pointer",
    fontFamily: "var(--font-display)",
    ...(active
      ? { background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-line)" }
      : { background: "var(--layer-1)", color: "var(--text-3)", border: "1px solid var(--layer-3)" }),
  };
}

/** Live automation value at the playhead (subscribes to playhead + envelope). */
function AutoValueReadout({ nodeId, color }: Readonly<{ nodeId: string; color: string }>) {
  const { ph, param, pts } = useDawStore(
    useShallow((s) => {
      const p = s.autoParam[nodeId] || "vol";
      return { ph: s.playhead, param: p, pts: getAutoPts(s.autoData, nodeId, p) };
    }),
  );
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color }}>{fmtAuto(param, valAt(pts, ph))}</span>
  );
}

/** Dropdown to automate a hosted device parameter on this node. Enumerates the
 *  params of each device in the node's insert rack (each carries a ready-to-use
 *  "dev:slot:i" id). Renders nothing in the browser dev-shell / when empty. */
function DeviceParamSelect({ nodeId }: Readonly<{ nodeId: string }>) {
  const { devices, param, setAutoParam } = useDawStore(
    useShallow((s) => ({
      devices: s.nodeRacks[nodeId] ?? NO_DEVICES,
      param: s.autoParam[nodeId] || "vol",
      setAutoParam: s.setAutoParam,
    })),
  );
  const [opts, setOpts] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all: { id: string; label: string }[] = [];
      for (const d of devices) {
        const params = await engine.node.listParams(nodeId, d.id);
        if (params) for (const p of params) all.push({ id: p.id, label: `${d.name} · ${p.name}` });
      }
      if (!cancelled) setOpts(all);
    })();
    return () => {
      cancelled = true;
    };
  }, [nodeId, devices]);

  if (opts.length === 0) return null;
  const isDev = param.startsWith("dev:");
  return (
    <select
      value={isDev ? param : ""}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        if (e.target.value) setAutoParam(nodeId, e.target.value);
      }}
      title="Automate a device parameter"
      style={{ ...chipStyle(isDev), appearance: "none", maxWidth: 140 }}
    >
      <option value="">FX…</option>
      {opts.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Header row (param picker + live readout) for a node's automation lane. */
export function AutomationChips({
  nodeId,
  color,
  params,
}: Readonly<{
  nodeId: string;
  color: string;
  params: [AutomationParam, string][];
}>) {
  const { param, setAutoParam } = useDawStore(
    useShallow((s) => ({ param: s.autoParam[nodeId] || "vol", setAutoParam: s.setAutoParam })),
  );
  return (
    <div
      style={{
        height: 64,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 16px",
        borderBottom: "1px solid var(--layer-2)",
        background: "var(--app-trackhead)",
      }}
    >
      <span style={{ fontSize: 9, letterSpacing: "0.12em", color: "var(--text-label)" }}>AUTO</span>
      <div style={{ display: "flex", gap: 4 }}>
        {params.map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAutoParam(nodeId, v);
            }}
            style={chipStyle(param === v)}
          >
            {l}
          </button>
        ))}
        <DeviceParamSelect nodeId={nodeId} />
      </div>
      <span style={{ flex: 1 }} />
      <AutoValueReadout nodeId={nodeId} color={color} />
    </div>
  );
}

/** Editable breakpoint envelope for one node + param: click empty lane to add a
 *  point, drag a handle on both axes (time clamped between neighbors), alt- or
 *  right-click a handle to delete. */
export function AutomationLane({ nodeId, color }: Readonly<{ nodeId: string; color: string }>) {
  const laneRef = useRef<HTMLDivElement>(null);
  const { param, pts, addAutoPoint, moveAutoPoint, deleteAutoPoint } = useDawStore(
    useShallow((s) => {
      const p = s.autoParam[nodeId] || "vol";
      return {
        param: p,
        pts: getAutoPts(s.autoData, nodeId, p),
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
    addAutoPoint(nodeId, param, toCoords(e.clientX, e.clientY, rect));
  };

  /** Drag a handle on both axes (time clamped between its neighbors). */
  const startDrag = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0) return;
    if (e.altKey) {
      deleteAutoPoint(nodeId, param, idx);
      return;
    }
    const lane = laneRef.current;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const lo = idx > 0 ? pts[idx - 1].t + EPS : 0;
    const hi = idx < pts.length - 1 ? pts[idx + 1].t - EPS : TOTAL_BEATS;
    const move = (ev: PointerEvent) => {
      const c = toCoords(ev.clientX, ev.clientY, rect);
      moveAutoPoint(nodeId, param, idx, { t: Math.max(lo, Math.min(hi, c.t)), v: c.v });
    };
    const up = () => {
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", up);
    };
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", up);
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
        background: hexA(color, 0.04),
        cursor: "crosshair",
      }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <polyline points={poly} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {pts.map((p, idx) => (
        <div
          key={`${p.t}-${p.v}`}
          role="button"
          tabIndex={0}
          onPointerDown={startDrag(idx)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " " || e.key === "Delete" || e.key === "Backspace") {
              e.preventDefault();
              deleteAutoPoint(nodeId, param, idx);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteAutoPoint(nodeId, param, idx);
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
            background: color,
            boxShadow: `0 0 7px ${color}`,
            cursor: "move",
            zIndex: 3,
            touchAction: "none",
          }}
        />
      ))}
    </div>
  );
}

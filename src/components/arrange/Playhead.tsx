import { useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { BEATS_PER_BAR, TOTAL_BEATS } from "../../lib/constants";
import { beatsAt, snap, startDrag } from "../../lib/timeline";

const pct = (beats: number) => (beats / TOTAL_BEATS) * 100 + "%";

/** Vertical playhead line spanning the lanes column (live: subscribes to playhead). */
export function PlayheadLine() {
  const ph = useDawStore((s) => s.playhead);
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: pct(ph),
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
        left: pct(ph),
        width: 0,
        height: 0,
        borderLeft: "5px solid transparent",
        borderRight: "5px solid transparent",
        borderTop: "7px solid #fff",
        transform: "translateX(-5px)",
        zIndex: 6,
        filter: "drop-shadow(0 0 6px rgba(255,255,255,0.7))",
        pointerEvents: "none",
      }}
    />
  );
}

/** Loop-region tint across the lanes, bound to loopStart..loopEnd (non-interactive;
 *  the draggable handles live in the ruler's LoopBracket). */
export function LoopRegion() {
  const { loop, loopStart, loopEnd } = useDawStore(
    useShallow((s) => ({ loop: s.loop, loopStart: s.loopStart, loopEnd: s.loopEnd })),
  );
  if (!loop) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: pct(loopStart),
        width: pct(loopEnd - loopStart),
        pointerEvents: "none",
        zIndex: 1,
        borderLeft: "1px solid var(--accent-line)",
        borderRight: "1px solid var(--accent-line)",
        background: "linear-gradient(180deg, rgba(94,147,255,0.06), rgba(94,147,255,0.015))",
      }}
    />
  );
}

/** The draggable loop bracket in the ruler: drag the body to move the region, or an
 *  edge to set its start/end. Snaps to bars (Alt = 1 beat). Renders only when loop
 *  is engaged; its parent (the ruler bar-area) shares the lanes width. */
export function LoopBracket() {
  const { loop, loopStart, loopEnd, setLoopStart, setLoopEnd } = useDawStore(
    useShallow((s) => ({
      loop: s.loop,
      loopStart: s.loopStart,
      loopEnd: s.loopEnd,
      setLoopStart: s.setLoopStart,
      setLoopEnd: s.setLoopEnd,
    })),
  );
  const ref = useRef<HTMLDivElement>(null);
  if (!loop) return null;

  const rectOf = () => ref.current?.parentElement?.getBoundingClientRect() ?? null;
  const gridStep = (alt: boolean) => (alt ? 1 : BEATS_PER_BAR);

  const dragEdge = (which: "start" | "end") => (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const rect = rectOf();
    if (!rect) return;
    startDrag((ev) => {
      const b = snap(beatsAt(ev.clientX, rect), gridStep(ev.altKey));
      if (which === "start") setLoopStart(Math.max(0, Math.min(loopEnd - BEATS_PER_BAR, b)));
      else setLoopEnd(Math.min(TOTAL_BEATS, Math.max(loopStart + BEATS_PER_BAR, b)));
    });
  };

  const dragBody = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const rect = rectOf();
    if (!rect) return;
    const len = loopEnd - loopStart;
    const grab = beatsAt(e.clientX, rect) - loopStart;
    startDrag((ev) => {
      const ns = Math.max(0, Math.min(TOTAL_BEATS - len, snap(beatsAt(ev.clientX, rect) - grab, gridStep(ev.altKey))));
      setLoopStart(ns);
      setLoopEnd(ns + len);
    });
  };

  const edge = (side: "left" | "right"): React.CSSProperties => ({
    position: "absolute",
    top: 0,
    bottom: 0,
    [side]: 0,
    width: 7,
    cursor: "ew-resize",
    background: "var(--accent)",
    opacity: 0.85,
    touchAction: "none",
  });

  return (
    <div
      ref={ref}
      onPointerDown={dragBody}
      title="Drag to move the loop · edges to resize"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: pct(loopStart),
        width: pct(loopEnd - loopStart),
        background: "var(--accent-soft)",
        borderTop: "2px solid var(--accent)",
        cursor: "grab",
        zIndex: 5,
        touchAction: "none",
      }}
    >
      <div onPointerDown={dragEdge("start")} style={edge("left")} />
      <div onPointerDown={dragEdge("end")} style={edge("right")} />
    </div>
  );
}

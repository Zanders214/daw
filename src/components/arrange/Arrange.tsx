import { useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import type { Group, Track } from "../../types";
import { getDragItem, hasDragItem, trackDefaultsForItem } from "../../lib/dnd";
import { startDrag } from "../../lib/timeline";
import { Ruler } from "./Ruler";
import { GroupHeader, GroupLane } from "./GroupHeader";
import { TrackHeader } from "./TrackHeader";
import { TrackLane } from "./TrackLane";
import { MasterBar } from "./MasterBar";
import { PlayheadLine, LoopRegion } from "./Playhead";

const HEADER_W = 258;
const ADD_ROW_H = 64;
type Row = { kind: "group"; group: Group } | { kind: "track"; track: Track };

export function Arrange() {
  const { tracksRight, groupCollapsed, tracks, groups, addTrack, setClipSelection, clearClipSelection } = useDawStore(
    useShallow((s) => ({
      tracksRight: s.tracksRight,
      groupCollapsed: s.groupCollapsed,
      tracks: s.tracks,
      groups: s.groups,
      addTrack: s.addTrack,
      setClipSelection: s.setClipSelection,
      clearClipSelection: s.clearClipSelection,
    })),
  );
  const [over, setOver] = useState(false);
  const lanesRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Rubber-band selection: drag on empty lane space to select intersecting clips.
  const onMarqueeDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-clip-id]")) return; // clips handle their own drag
    const host = lanesRef.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const base = e.shiftKey ? useDawStore.getState().selClips : [];
    let dragged = false;
    setMarquee({ x: x0 - box.left, y: y0 - box.top, w: 0, h: 0 });
    startDrag((ev) => {
      dragged = true;
      const left = Math.min(x0, ev.clientX);
      const top = Math.min(y0, ev.clientY);
      const right = Math.max(x0, ev.clientX);
      const bottom = Math.max(y0, ev.clientY);
      setMarquee({ x: left - box.left, y: top - box.top, w: right - left, h: bottom - top });
      const hits = new Set(base);
      host.querySelectorAll<HTMLElement>("[data-clip-id]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < right && r.right > left && r.top < bottom && r.bottom > top) {
          const cid = el.getAttribute("data-clip-id");
          if (cid) hits.add(cid);
        }
      });
      setClipSelection([...hits]);
    });
    const end = () => {
      if (!dragged && !e.shiftKey) clearClipSelection(); // plain empty click clears
      setMarquee(null);
      globalThis.removeEventListener("pointerup", end);
    };
    globalThis.addEventListener("pointerup", end);
  };

  const rows = useMemo<Row[]>(() => {
    const trackMap: Record<string, Track> = Object.fromEntries(tracks.map((t) => [t.id, t]));
    const out: Row[] = [];
    for (const g of groups) {
      // Skip the implicit ungrouped bucket while it holds no tracks.
      if (g.id === "g-tracks" && g.tracks.length === 0) continue;
      out.push({ kind: "group", group: g });
      if (!groupCollapsed[g.id]) {
        for (const id of g.tracks) {
          const t = trackMap[id];
          if (t) out.push({ kind: "track", track: t });
        }
      }
    }
    return out;
  }, [groupCollapsed, tracks, groups]);

  const sb = "1px solid var(--layer-3)";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "var(--app-arrange)" }}>
      <Ruler tracksRight={tracksRight} />

      <div
        className="zd-scroll"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: tracksRight ? "row-reverse" : "row",
          overflowY: "auto",
          minHeight: 0,
          position: "relative",
        }}
      >
        {/* header column */}
        <div
          style={{
            width: HEADER_W,
            flex: "none",
            borderRight: tracksRight ? "none" : sb,
            borderLeft: tracksRight ? sb : "none",
            background: "var(--app-trackhead)",
          }}
        >
          {rows.map((r) =>
            r.kind === "group" ? (
              <GroupHeader key={r.group.id} g={r.group} />
            ) : (
              <TrackHeader key={r.track.id} track={r.track} />
            ),
          )}
          <button
            type="button"
            onClick={() => addTrack()}
            title="Add a new track"
            style={{
              width: "100%",
              height: ADD_ROW_H,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: "transparent",
              border: "none",
              borderBottom: "1px solid var(--layer-2)",
              color: "var(--text-3)",
              cursor: "pointer",
              fontFamily: "var(--font-display)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
            }}
          >
            ＋ ADD TRACK
          </button>
        </div>

        {/* lanes */}
        <div ref={lanesRef} onPointerDown={onMarqueeDown} style={{ flex: 1, position: "relative", minWidth: 0 }}>
          {rows.map((r) =>
            r.kind === "group" ? (
              <GroupLane key={r.group.id} g={r.group} />
            ) : (
              <TrackLane key={r.track.id} track={r.track} />
            ),
          )}
          <div
            onDragOver={(e) => {
              if (!hasDragItem(e.dataTransfer)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              setOver(false);
              const item = getDragItem(e.dataTransfer);
              if (!item || item.kind === "fx") return; // FX needs a target chain
              e.preventDefault();
              addTrack({ ...trackDefaultsForItem(item, tracks.length), instrument: item.name });
            }}
            title="Drop an instrument or sample here to create a track"
            style={{
              height: ADD_ROW_H,
              borderBottom: "1px solid var(--layer-2)",
              background: over ? "var(--accent-soft)" : "transparent",
              outline: over ? "1px dashed var(--accent)" : "none",
              outlineOffset: -2,
            }}
          />
          <PlayheadLine />
          <LoopRegion />
          {marquee && (
            <div
              style={{
                position: "absolute",
                left: marquee.x,
                top: marquee.y,
                width: marquee.w,
                height: marquee.h,
                background: "var(--accent-soft)",
                border: "1px solid var(--accent)",
                pointerEvents: "none",
                zIndex: 7,
              }}
            />
          )}
        </div>
      </div>

      <MasterBar tracksRight={tracksRight} />
    </div>
  );
}

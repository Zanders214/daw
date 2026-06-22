import { useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { hexA } from "../../lib/color";
import { clipPreview } from "../../lib/notes";
import { BEATS_PER_BAR, TOTAL_BARS } from "../../lib/constants";
import { deviceDescriptorForItem, getDragItem, hasDragItem, trackTypeForItem } from "../../lib/dnd";
import { barsAt, snap, startDrag } from "../../lib/timeline";
import { AutomationLane } from "./AutomationLane";
import { SEND_ROW_H } from "./TrackHeader";
import type { Clip, Track } from "../../types";

/** Grid step in bars: whole bars, or quarter-bar when Alt (fine) is held. */
const step = (fine: boolean) => (fine ? 0.25 : 1);

/** One selected clip's original position, captured before a multi-clip drag. */
type ClipSnapshot = { trackId: string; clipId: string; startBar: number };

/** Snapshot the start bars of every clip in `track` whose id is in `selIds`. */
const snapshotSelectedInTrack = (track: Track, selIds: string[]): ClipSnapshot[] =>
  track.clips
    .filter((cc) => selIds.includes(cc.id))
    .map((cc) => ({ trackId: track.id, clipId: cc.id, startBar: cc.bar }));

/** Apply a snapped bar `delta` to a snapshot, yielding setClipBars updates. */
const shiftSnapshot = (snapshot: ClipSnapshot[], delta: number) =>
  snapshot.map((u) => ({ trackId: u.trackId, clipId: u.clipId, bar: u.startBar + delta }));

export function TrackLane({ track }: Readonly<{ track: Track }>) {
  const id = track.id;
  const {
    selected, showGrid, vibrant, dimmed, selClip, selClips, autoOpen, sendsOpen,
    selectClip, toggleClipSelected, addNodeDevice, setTrackInstrument,
    moveClip, moveClipToTrack, setClipBars, resizeClip, setClipRegion, removeClip, removeSelectedClips,
    duplicateClip, duplicateSelectedClips, openEditor,
    copyClip, cutClip, pasteClip, playhead,
  } = useDawStore(
    useShallow((s) => {
      const soloActive = Object.values(s.solos).some(Boolean);
      const audible = !s.mutes[id] && (!soloActive || !!s.solos[id]);
      return {
        selected: s.selTrack === id,
        showGrid: s.showGrid,
        vibrant: s.vibrantClips,
        dimmed: !audible,
        selClip: s.selClip,
        selClips: s.selClips,
        autoOpen: !!s.autoLanes[id],
        sendsOpen: !!s.sendsOpen[id],
        selectClip: s.selectClip,
        toggleClipSelected: s.toggleClipSelected,
        addNodeDevice: s.addNodeDevice,
        setTrackInstrument: s.setTrackInstrument,
        moveClip: s.moveClip,
        moveClipToTrack: s.moveClipToTrack,
        setClipBars: s.setClipBars,
        resizeClip: s.resizeClip,
        setClipRegion: s.setClipRegion,
        removeClip: s.removeClip,
        removeSelectedClips: s.removeSelectedClips,
        duplicateClip: s.duplicateClip,
        duplicateSelectedClips: s.duplicateSelectedClips,
        openEditor: s.openEditor,
        copyClip: s.copyClip,
        cutClip: s.cutClip,
        pasteClip: s.pasteClip,
        playhead: s.playhead,
      };
    }),
  );
  const [over, setOver] = useState(false);
  const laneRef = useRef<HTMLDivElement>(null);

  const isMidi = track.type === "drum" || track.type === "midi";
  const clipAlpha = vibrant ? 0.3 : 0.17;

  const laneRect = () => laneRef.current?.getBoundingClientRect() ?? null;

  const startMove = (c: Clip) => (e: React.PointerEvent) => {
    e.stopPropagation(); // don't let the lanes-column marquee start
    if (e.button !== 0) return;
    if (e.shiftKey) { toggleClipSelected(c.id, id); return; } // toggle, no drag
    const multi = selClips.length > 1 && selClips.includes(c.id);
    if (!multi) selectClip(c.id, id); // replace selection unless dragging the group
    const rect = laneRect();
    if (!rect) return;
    const startBar = barsAt(e.clientX, rect);
    const grabOffset = startBar - c.bar;
    const startX = e.clientX;
    let moved = false;

    if (multi) {
      // Move every selected clip (across tracks) by the same snapped bar delta.
      const snapshot = useDawStore.getState().tracks.flatMap((t) =>
        snapshotSelectedInTrack(t, selClips),
      );
      startDrag((ev) => {
        if (!moved && Math.abs(ev.clientX - startX) < 3) return;
        moved = true;
        const delta = snap(barsAt(ev.clientX, rect) - startBar, step(ev.altKey));
        setClipBars(shiftSnapshot(snapshot, delta));
      });
      return;
    }

    let curTrack = id; // single-clip move follows the clip as it crosses lanes
    startDrag((ev) => {
      if (!moved && Math.abs(ev.clientX - startX) < 3) return; // preserve plain click→select
      moved = true;
      const bar = snap(barsAt(ev.clientX, rect) - grabOffset, step(ev.altKey));
      const destEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-track-id]");
      const dest = destEl?.dataset.trackId;
      if (dest && dest !== curTrack) {
        moveClipToTrack(curTrack, c.id, dest, bar);
        curTrack = dest;
      } else {
        moveClip(curTrack, c.id, bar);
      }
    });
  };

  const startResizeRight = (c: Clip) => (e: React.PointerEvent) => {
    e.stopPropagation();
    selectClip(c.id, id);
    const rect = laneRect();
    if (!rect || e.button !== 0) return;
    startDrag((ev) => resizeClip(id, c.id, snap(barsAt(ev.clientX, rect) - c.bar, step(ev.altKey))));
  };

  const startResizeLeft = (c: Clip) => (e: React.PointerEvent) => {
    e.stopPropagation();
    selectClip(c.id, id);
    const rect = laneRect();
    if (!rect || e.button !== 0) return;
    const right = c.bar + c.len; // keep the right edge fixed
    startDrag((ev) => {
      const newBar = Math.min(right - 0.25, snap(barsAt(ev.clientX, rect), step(ev.altKey)));
      setClipRegion(id, c.id, newBar, right - newBar);
    });
  };

  const onClipKey = (c: Clip) => (e: React.KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const multi = selClips.length > 1 && selClips.includes(c.id);
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectClip(c.id, id); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); multi ? removeSelectedClips() : removeClip(id, c.id); }
    else if (mod && (e.key === "d" || e.key === "D")) { e.preventDefault(); multi ? duplicateSelectedClips() : duplicateClip(id, c.id); }
    else if (mod && (e.key === "c" || e.key === "C")) { e.preventDefault(); copyClip(id, c.id); }
    else if (mod && (e.key === "x" || e.key === "X")) { e.preventDefault(); cutClip(id, c.id); }
    else if (mod && (e.key === "v" || e.key === "V")) { e.preventDefault(); pasteClip(id, Math.floor(playhead / BEATS_PER_BAR)); }
  };

  const edgeStyle = (side: "left" | "right"): React.CSSProperties => ({
    position: "absolute",
    top: 0,
    bottom: 0,
    [side]: 0,
    width: 7,
    cursor: "ew-resize",
    touchAction: "none",
    zIndex: 2,
  });

  // Per-clip note preview (stored notes when edited, else the generated pattern).
  const notesByClip = useMemo(() => {
    const map: Record<string, ReturnType<typeof clipPreview>> = {};
    if (isMidi) for (const c of track.clips) map[c.id] = clipPreview(c, track);
    return map;
  }, [track, isMidi]);

  const restingBg = selected ? "rgba(94,147,255,0.05)" : "transparent";
  const laneStyle: React.CSSProperties = {
    position: "relative",
    height: 108,
    borderBottom: "1px solid var(--layer-2)",
    backgroundColor: over ? hexA(track.color, 0.12) : restingBg,
    outline: over ? `1px dashed ${track.color}` : "none",
    outlineOffset: -2,
  };
  if (showGrid) {
    laneStyle.backgroundImage =
      "linear-gradient(90deg, var(--layer-1) 1px, transparent 1px), linear-gradient(90deg, var(--layer-3) 1px, transparent 1px)";
    laneStyle.backgroundSize = "calc(100% / 32) 100%, calc(100% / 8) 100%";
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    setOver(false);
    const item = getDragItem(e.dataTransfer);
    if (!item) return;
    e.preventDefault();
    if (item.kind === "fx") {
      addNodeDevice(id, deviceDescriptorForItem(item));
      return;
    }
    // Instrument / sample / MIDI → load onto this track at the dropped bar.
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    const bar = Math.max(0, Math.min(TOTAL_BARS - 1, Math.floor(frac * TOTAL_BARS)));
    setTrackInstrument(id, { name: item.name, type: trackTypeForItem(item) }, bar);
  };

  return (
    <>
      <div
        ref={laneRef}
        data-track-id={id}
        style={laneStyle}
        onDragOver={(e) => {
          if (!hasDragItem(e.dataTransfer)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {track.clips.map((c) => {
        const csel = selClip === c.id || selClips.includes(c.id);
        const notes = notesByClip[c.id] || [];
        return (
          <div
            key={c.id}
            data-clip-id={c.id}
            role="button"
            onPointerDown={startMove(c)}
            onDoubleClick={(e) => { e.stopPropagation(); openEditor(id, c.id); }}
            onContextMenu={(e) => { e.preventDefault(); removeClip(id, c.id); }}
            tabIndex={0}
            onKeyDown={onClipKey(c)}
            title="Drag to move · edges to resize · Del to delete · ⌘/Ctrl+D to duplicate"
            style={{
              position: "absolute",
              left: (c.bar / TOTAL_BARS) * 100 + "%",
              width: (c.len / TOTAL_BARS) * 100 + "%",
              top: 7,
              bottom: 7,
              borderRadius: 6,
              background: `linear-gradient(180deg, ${hexA(track.color, clipAlpha + 0.08)}, ${hexA(track.color, clipAlpha)})`,
              border: `1px solid ${hexA(track.color, 0.5)}`,
              borderLeft: `3px solid ${track.color}`,
              boxShadow: csel
                ? `0 0 0 1px ${track.color}, 0 0 18px ${hexA(track.color, 0.5)}`
                : "inset 0 1px 0 rgba(255,255,255,0.06)",
              overflow: "hidden",
              cursor: "grab",
              touchAction: "none",
              opacity: dimmed ? 0.4 : 1,
            }}
          >
            <div onPointerDown={startResizeLeft(c)} style={edgeStyle("left")} />
            <div onPointerDown={startResizeRight(c)} style={edgeStyle("right")} />
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                padding: "4px 8px",
                fontSize: 10,
                fontWeight: 600,
                color: track.color,
                letterSpacing: "0.03em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textShadow: "0 1px 2px rgba(0,0,0,0.7)",
                fontFamily: "var(--font-display)",
              }}
            >
              {c.name}
            </div>
            {isMidi ? (
              <div style={{ position: "absolute", left: 6, right: 4, top: 17, bottom: 5 }}>
                {notes.map((n, i) => (
                  <div
                    key={`${i}-${n.y}-${n.x}`}
                    style={{
                      position: "absolute",
                      left: n.x * 100 + "%",
                      width: `calc(${Math.max(1.6, n.w * 100)}% - 1px)`,
                      top: n.y * 100 + "%",
                      height: `calc(${100 / 8}% - 2px)`,
                      background: track.color,
                      borderRadius: 1.5,
                      boxShadow: `0 0 4px ${hexA(track.color, 0.55)}`,
                      opacity: 0.92,
                    }}
                  />
                ))}
              </div>
            ) : (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: "56%",
                  opacity: 0.5,
                  background: `repeating-linear-gradient(90deg, ${track.color} 0 1.5px, transparent 1.5px 4px)`,
                  WebkitMaskImage: "linear-gradient(180deg, transparent, #000 65%)",
                  maskImage: "linear-gradient(180deg, transparent, #000 65%)",
                }}
              />
            )}
          </div>
        );
      })}
      </div>
      {autoOpen && <AutomationLane nodeId={track.id} color={track.color} />}
      {sendsOpen && <div style={{ height: SEND_ROW_H, borderBottom: "1px solid var(--layer-2)" }} />}
    </>
  );
}

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { hexA } from "../../lib/color";
import { genNotes } from "../../lib/notes";
import { TOTAL_BARS } from "../../lib/constants";
import { AutomationLane } from "./AutomationLane";
import { SEND_ROW_H } from "./TrackHeader";
import type { Track } from "../../types";

export function TrackLane({ track }: { track: Track }) {
  const id = track.id;
  const { selected, showGrid, vibrant, dimmed, selClip, autoOpen, sendsOpen, selectClip } = useDawStore(
    useShallow((s) => {
      const soloActive = Object.values(s.solos).some(Boolean);
      const audible = !s.mutes[id] && (!soloActive || !!s.solos[id]);
      return {
        selected: s.selTrack === id,
        showGrid: s.showGrid,
        vibrant: s.vibrantClips,
        dimmed: !audible,
        selClip: s.selClip,
        autoOpen: !!s.autoLanes[id],
        sendsOpen: !!s.sendsOpen[id],
        selectClip: s.selectClip,
      };
    }),
  );

  const isMidi = track.type === "drum" || track.type === "midi";
  const clipAlpha = vibrant ? 0.3 : 0.17;

  // Note patterns are deterministic per clip id; compute once.
  const notesByClip = useMemo(() => {
    const map: Record<string, ReturnType<typeof genNotes>> = {};
    if (isMidi) for (const c of track.clips) map[c.id] = genNotes(c, track);
    return map;
  }, [track, isMidi]);

  const laneStyle: React.CSSProperties = {
    position: "relative",
    height: 108,
    borderBottom: "1px solid var(--layer-2)",
    backgroundColor: selected ? "rgba(94,147,255,0.05)" : "transparent",
  };
  if (showGrid) {
    laneStyle.backgroundImage =
      "linear-gradient(90deg, var(--layer-1) 1px, transparent 1px), linear-gradient(90deg, var(--layer-3) 1px, transparent 1px)";
    laneStyle.backgroundSize = "calc(100% / 32) 100%, calc(100% / 8) 100%";
  }

  return (
    <>
      <div style={laneStyle}>
        {track.clips.map((c) => {
        const csel = selClip === c.id;
        const notes = notesByClip[c.id] || [];
        return (
          <div
            key={c.id}
            onClick={() => selectClip(c.id, id)}
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
              cursor: "pointer",
              opacity: dimmed ? 0.4 : 1,
            }}
          >
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
                    key={i}
                    style={{
                      position: "absolute",
                      left: n.x * 100 + "%",
                      width: `calc(${Math.max(1.6, n.w * 100)}% - 1px)`,
                      top: (n.row / 8) * 100 + "%",
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
      {autoOpen && <AutomationLane track={track} />}
      {sendsOpen && <div style={{ height: SEND_ROW_H, borderBottom: "1px solid var(--layer-2)" }} />}
    </>
  );
}

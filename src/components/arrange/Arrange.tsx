import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { GROUP_DEFS, TRACK_DEFS } from "../../data/seed";
import type { Group, Track } from "../../types";
import { Ruler } from "./Ruler";
import { GroupHeader, GroupLane } from "./GroupHeader";
import { TrackHeader } from "./TrackHeader";
import { TrackLane } from "./TrackLane";
import { MasterBar } from "./MasterBar";
import { PlayheadLine, LoopRegion } from "./Playhead";

const HEADER_W = 258;
type Row = { kind: "group"; group: Group } | { kind: "track"; track: Track };

const trackMap: Record<string, Track> = Object.fromEntries(TRACK_DEFS.map((t) => [t.id, t]));

export function Arrange() {
  const { tracksRight, groupCollapsed } = useDawStore(
    useShallow((s) => ({ tracksRight: s.tracksRight, groupCollapsed: s.groupCollapsed })),
  );

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const g of GROUP_DEFS) {
      out.push({ kind: "group", group: g });
      if (!groupCollapsed[g.id]) {
        for (const id of g.tracks) {
          const t = trackMap[id];
          if (t) out.push({ kind: "track", track: t });
        }
      }
    }
    return out;
  }, [groupCollapsed]);

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
        </div>

        {/* lanes */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          {rows.map((r) =>
            r.kind === "group" ? (
              <GroupLane key={r.group.id} g={r.group} />
            ) : (
              <TrackLane key={r.track.id} track={r.track} />
            ),
          )}
          <PlayheadLine />
          <LoopRegion />
        </div>
      </div>

      <MasterBar tracksRight={tracksRight} />
    </div>
  );
}

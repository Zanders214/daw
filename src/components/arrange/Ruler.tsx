import { useDawStore } from "../../store/useDawStore";
import { TOTAL_BARS } from "../../lib/constants";
import { PlayheadMarker } from "./Playhead";

const HEADER_W = 258;

export function Ruler({ tracksRight }: { tracksRight: boolean }) {
  const toggleTracksSide = useDawStore((s) => s.toggleTracksSide);
  const sb = "1px solid var(--layer-3)";

  return (
    <div
      style={{
        height: 34,
        flex: "none",
        display: "flex",
        flexDirection: tracksRight ? "row-reverse" : "row",
        borderBottom: sb,
        background: "var(--app-ruler)",
      }}
    >
      <div
        style={{
          width: HEADER_W,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px",
          borderRight: tracksRight ? "none" : sb,
          borderLeft: tracksRight ? sb : "none",
        }}
      >
        <span style={{ fontSize: 9, letterSpacing: "0.16em", color: "var(--text-label)", flex: 1 }}>
          TRACKS
        </span>
        <button
          type="button"
          onClick={toggleTracksSide}
          title="Move track list to other side"
          style={{
            width: 24,
            height: 20,
            borderRadius: 6,
            background: "var(--layer-2)",
            border: "1px solid var(--layer-5)",
            color: "var(--text-3)",
            cursor: "pointer",
            fontSize: 11,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          ⇆
        </button>
      </div>
      <div style={{ flex: 1, position: "relative", display: "flex" }}>
        {Array.from({ length: TOTAL_BARS }, (_, i) => {
          const major = i % 4 === 0;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: "100%",
                display: "flex",
                alignItems: "center",
                paddingLeft: 6,
                borderLeft: major ? "1px solid var(--layer-4)" : "1px solid var(--layer-1)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: major ? "var(--text-faint)" : "transparent",
              }}
            >
              {major ? String(i + 1) : ""}
            </div>
          );
        })}
        <PlayheadMarker />
      </div>
    </div>
  );
}

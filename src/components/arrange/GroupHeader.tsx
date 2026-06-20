import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { hexA } from "../../lib/color";
import type { Group } from "../../types";

const idleBtnSm: React.CSSProperties = {
  width: 24,
  height: 22,
  borderRadius: 6,
  border: "1px solid var(--layer-5)",
  background: "var(--layer-2)",
  color: "var(--text-3)",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "var(--font-display)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "none",
};

export function GroupHeader({ g }: { g: Group }) {
  const { collapsed, allMuted, anySolo, toggleGroup, toggleGroupMute, toggleGroupSolo } = useDawStore(
    useShallow((s) => ({
      collapsed: !!s.groupCollapsed[g.id],
      allMuted: g.tracks.length > 0 && g.tracks.every((id) => s.mutes[id]),
      anySolo: g.tracks.some((id) => s.solos[id]),
      toggleGroup: s.toggleGroup,
      toggleGroupMute: s.toggleGroupMute,
      toggleGroupSolo: s.toggleGroupSolo,
    })),
  );

  return (
    <div
      style={{
        height: 34,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        borderBottom: "1px solid var(--layer-2)",
        background: hexA(g.color, 0.1),
        borderLeft: `2px solid ${g.color}`,
      }}
    >
      <button
        type="button"
        onClick={() => toggleGroup(g.id)}
        style={{
          width: 20,
          height: 20,
          borderRadius: 6,
          background: "var(--layer-2)",
          border: "1px solid var(--layer-5)",
          color: "var(--text-2)",
          cursor: "pointer",
          fontSize: 10,
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "none",
        }}
      >
        {collapsed ? "▸" : "▾"}
      </button>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: g.color, boxShadow: `0 0 8px ${g.color}`, flex: "none" }} />
      <span
        style={{
          flex: 1,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: "var(--text-1)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {g.name}
      </span>
      <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}>
        {g.tracks.length} TRK
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleGroupMute(g.id);
        }}
        style={{
          ...idleBtnSm,
          ...(allMuted
            ? { background: "var(--danger-grad)", color: "#fff", borderColor: "rgba(255,120,120,0.6)" }
            : null),
        }}
      >
        M
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleGroupSolo(g.id);
        }}
        style={{
          ...idleBtnSm,
          ...(anySolo
            ? { background: "var(--accent-grad)", color: "#fff", borderColor: "rgba(150,170,255,0.6)" }
            : null),
        }}
      >
        S
      </button>
    </div>
  );
}

/** The thin tinted bar a group renders as in the lanes column. */
export function GroupLane({ g }: { g: Group }) {
  return (
    <div
      style={{
        height: 34,
        borderBottom: "1px solid var(--layer-2)",
        background: hexA(g.color, 0.05),
      }}
    />
  );
}

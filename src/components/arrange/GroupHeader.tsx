import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { hexA } from "../../lib/color";
import { Meter, Slider, Dial } from "../../design-system";
import { AutomationChips, AutomationLane, GROUP_AUTO_PARAMS } from "./AutomationLane";
import type { Group } from "../../types";

const GROUP_ROW_H = 56;

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

export function GroupHeader({ g }: Readonly<{ g: Group }>) {
  const { collapsed, muted, soloed, selected, autoOpen, vol, pan, level, toggleGroup, toggleGroupMute, toggleGroupSolo, toggleAuto, setGroupVolume, setGroupPan, openGroupChain } =
    useDawStore(
      useShallow((s) => ({
        collapsed: !!s.groupCollapsed[g.id],
        muted: !!s.groupMutes[g.id],
        soloed: !!s.groupSolos[g.id],
        selected: s.selTrack === g.id,
        autoOpen: !!s.autoLanes[g.id],
        vol: s.groupVolumes[g.id] ?? 1,
        pan: s.groupPans[g.id] ?? 0.5,
        level: s.groupLevels[g.id] ?? 0,
        toggleGroup: s.toggleGroup,
        toggleGroupMute: s.toggleGroupMute,
        toggleGroupSolo: s.toggleGroupSolo,
        toggleAuto: s.toggleAuto,
        setGroupVolume: s.setGroupVolume,
        setGroupPan: s.setGroupPan,
        openGroupChain: s.openGroupChain,
      })),
    );

  const db = vol <= 0.001 ? "-∞" : (20 * Math.log10(vol)).toFixed(1);
  const panMag =
    pan < 0.5 ? `L${Math.round((0.5 - pan) * 200)}` : `R${Math.round((pan - 0.5) * 200)}`;
  const panLabel = Math.abs(pan - 0.5) < 0.005 ? "C" : panMag;

  return (
    <>
    <div
      onClick={() => openGroupChain(g.id)}
      title="Open group chain"
      style={{
        height: GROUP_ROW_H,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 5,
        padding: "0 12px",
        borderBottom: "1px solid var(--layer-2)",
        background: selected ? hexA(g.color, 0.2) : hexA(g.color, 0.1),
        borderLeft: `${selected ? 3 : 2}px solid ${g.color}`,
        boxSizing: "border-box",
        cursor: "pointer",
      }}
    >
      {/* row 1: name + mute/solo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleGroup(g.id); }}
          title={collapsed ? "Expand group" : "Collapse group"}
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            background: "var(--layer-2)",
            border: "1px solid var(--layer-5)",
            color: "var(--text-2)",
            cursor: "pointer",
            fontSize: 9,
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
        <div style={{ width: 30, flex: "none" }}>
          <Meter value={level} height={5} />
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleGroupMute(g.id); }}
          title="Mute group bus"
          style={{ ...idleBtnSm, ...(muted ? { background: "var(--danger-grad)", color: "#fff", borderColor: "rgba(255,120,120,0.6)" } : null) }}
        >
          M
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleGroupSolo(g.id); }}
          title="Solo group bus"
          style={{ ...idleBtnSm, ...(soloed ? { background: "var(--accent-grad)", color: "#fff", borderColor: "rgba(150,170,255,0.6)" } : null) }}
        >
          S
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleAuto(g.id); }}
          title="Automation lane"
          style={{ ...idleBtnSm, ...(autoOpen ? { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent-line)" } : null) }}
        >
          A
        </button>
      </div>

      {/* row 2: group fader + pan */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 8, color: "var(--text-label)", letterSpacing: "0.1em", flex: "none", width: 22 }}>BUS</span>
        <div style={{ flex: 1 }}>
          <Slider value={vol} onChange={(v) => setGroupVolume(g.id, v)} gradient={`linear-gradient(90deg, ${hexA(g.color, 0.5)}, ${g.color})`} />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-faint)", width: 30, textAlign: "right", flex: "none" }}>{db}</span>
        <div
          onDoubleClick={() => setGroupPan(g.id, 0.5)}
          title={`Group pan: ${panLabel} (double-click to center)`}
          style={{ flex: "none" }}
        >
          <Dial value={pan} onChange={(v) => setGroupPan(g.id, v)} label={null} size={22} color={g.color} />
        </div>
      </div>
    </div>
    {autoOpen && <AutomationChips nodeId={g.id} color={g.color} params={GROUP_AUTO_PARAMS} />}
    </>
  );
}

/** The tinted bar a group renders as in the lanes column (height matches the
 *  header); shows the group's automation envelope below it when the lane is open. */
export function GroupLane({ g }: Readonly<{ g: Group }>) {
  const autoOpen = useDawStore((s) => !!s.autoLanes[g.id]);
  return (
    <>
      <div
        style={{
          height: GROUP_ROW_H,
          borderBottom: "1px solid var(--layer-2)",
          background: hexA(g.color, 0.05),
        }}
      />
      {autoOpen && <AutomationLane nodeId={g.id} color={g.color} />}
    </>
  );
}

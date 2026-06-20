import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { TRACK_DEFS } from "../../data/seed";
import { ZandersEQ } from "./ZandersEQ";
import { ZandersTapeStop } from "./ZandersTapeStop";
import { ZandersPreDrop } from "./ZandersPreDrop";
import { AddDeviceSlot } from "./AddDeviceSlot";

export function DeviceChain() {
  const { rackOpen, selTrack, toggleRack } = useDawStore(
    useShallow((s) => ({ rackOpen: s.rackOpen, selTrack: s.selTrack, toggleRack: s.toggleRack })),
  );

  const selDef =
    selTrack === "master"
      ? { name: "MASTER BUS", color: "#5e93ff" }
      : TRACK_DEFS.find((t) => t.id === selTrack) || TRACK_DEFS[0];

  return (
    <div
      style={{
        height: rackOpen ? 300 : 44,
        flex: "none",
        borderTop: "1px solid var(--layer-3)",
        background: "var(--app-surface)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "height var(--dur-base) var(--ease)",
      }}
    >
      <div
        style={{
          height: 42,
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 22px",
          borderBottom: "1px solid var(--layer-2)",
        }}
      >
        <span style={{ fontSize: 11, letterSpacing: "0.16em", color: "var(--text-2)", fontWeight: 600 }}>
          DEVICE CHAIN
        </span>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 12px",
            borderRadius: 8,
            background: "var(--layer-1)",
            border: "1px solid var(--layer-3)",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: selDef.color,
              boxShadow: `0 0 8px ${selDef.color}`,
              flex: "none",
            }}
          />
          <span style={{ fontSize: 12, color: "var(--text-1)", fontWeight: 600 }}>{selDef.name}</span>
        </span>
        <span style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>
          signal flows left → right
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
          3 devices · 2 slots open
        </span>
        <button
          type="button"
          onClick={toggleRack}
          title="Toggle device chain"
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "var(--layer-2)",
            border: "1px solid var(--layer-5)",
            color: "var(--text-3)",
            cursor: "pointer",
            fontSize: 11,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {rackOpen ? "▾" : "▸"}
        </button>
      </div>

      <div
        className="zd-scroll"
        style={{
          flex: 1,
          display: rackOpen ? "flex" : "none",
          alignItems: "stretch",
          gap: 16,
          padding: "18px 22px",
          overflowX: "auto",
        }}
      >
        <ZandersEQ />
        <ZandersTapeStop />
        <ZandersPreDrop />
        <AddDeviceSlot />
      </div>
    </div>
  );
}

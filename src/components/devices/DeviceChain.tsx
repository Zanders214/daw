import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { TRACK_DEFS, GROUP_DEFS } from "../../data/seed";
import type { DeviceKey } from "../../types";
import { ZandersEQ } from "./ZandersEQ";
import { ZandersTapeStop } from "./ZandersTapeStop";
import { ZandersPreDrop } from "./ZandersPreDrop";
import { AddDeviceSlot } from "./AddDeviceSlot";

const PALETTE: DeviceKey[] = ["eq", "tape", "pre"];
const DEVICE_META: Record<DeviceKey, { label: string; color: string }> = {
  eq: { label: "ZANDERS EQ", color: "#34d8ff" },
  tape: { label: "TAPE STOP", color: "#ffc24b" },
  pre: { label: "PRE-DROP", color: "#ff5fa8" },
};

/** Resolve the selected node id to a display name + color. */
function nodeDef(selNode: string): { name: string; color: string } {
  if (selNode === "master") return { name: "MASTER BUS", color: "#5e93ff" };
  if (selNode.startsWith("return-"))
    return { name: `RETURN ${selNode.endsWith("0") ? "A" : "B"}`, color: "var(--spectrum-violet)" };
  const g = GROUP_DEFS.find((x) => x.id === selNode);
  if (g) return { name: g.name, color: g.color };
  const t = TRACK_DEFS.find((x) => x.id === selNode);
  return t ? { name: t.name, color: t.color } : { name: "MASTER BUS", color: "#5e93ff" };
}

/** One device card in a non-master node's insert rack. */
function NodeDeviceCard({ nodeId, dev }: Readonly<{ nodeId: string; dev: { key: DeviceKey; name?: string; bypassed?: boolean } }>) {
  const { setNodeDeviceBypass, openNodeEditor, removeNodeDevice } = useDawStore(
    useShallow((s) => ({
      setNodeDeviceBypass: s.setNodeDeviceBypass,
      openNodeEditor: s.openNodeEditor,
      removeNodeDevice: s.removeNodeDevice,
    })),
  );
  const meta = DEVICE_META[dev.key];
  const on = !dev.bypassed;
  return (
    <div
      style={{
        width: 188,
        flex: "none",
        display: "flex",
        flexDirection: "column",
        borderRadius: 12,
        border: "1px solid var(--layer-3)",
        background: "var(--panel)",
        overflow: "hidden",
        opacity: on ? 1 : 0.55,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--layer-2)" }}>
        <span style={{ width: 9, height: 9, borderRadius: 2, background: meta.color, boxShadow: `0 0 8px ${meta.color}`, flex: "none" }} />
        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-1)" }}>{meta.label}</span>
        <button
          type="button"
          title="Remove device"
          onClick={() => removeNodeDevice(nodeId, dev.key)}
          style={{ width: 22, height: 22, borderRadius: 6, background: "var(--layer-2)", border: "1px solid var(--layer-5)", color: "var(--text-3)", cursor: "pointer", fontSize: 10, lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px 12px" }}>
        <button
          type="button"
          onClick={() => setNodeDeviceBypass(nodeId, dev.key, on)}
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            cursor: "pointer",
            fontFamily: "var(--font-display)",
            ...(on
              ? { background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-line)" }
              : { background: "var(--layer-2)", color: "var(--text-3)", border: "1px solid var(--layer-5)" }),
          }}
        >
          {on ? "ON" : "BYP"}
        </button>
        <button
          type="button"
          onClick={() => openNodeEditor(nodeId, dev.key)}
          style={{ padding: "7px 14px", borderRadius: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", fontFamily: "var(--font-display)", background: "var(--layer-2)", color: "var(--text-2)", border: "1px solid var(--layer-5)" }}
        >
          EDIT
        </button>
      </div>
    </div>
  );
}

/** The insert rack for a non-master node (track / group / return). */
function NodeRack({ nodeId }: Readonly<{ nodeId: string }>) {
  const { devices, addNodeDevice } = useDawStore(
    useShallow((s) => ({ devices: s.nodeRacks[nodeId] ?? [], addNodeDevice: s.addNodeDevice })),
  );
  const present = new Set(devices.map((d) => d.key));
  const available = PALETTE.filter((k) => !present.has(k));

  return (
    <>
      {devices.map((d) => (
        <NodeDeviceCard key={d.key} nodeId={nodeId} dev={d} />
      ))}
      {available.length > 0 && (
        <div
          style={{
            width: 188,
            flex: "none",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            borderRadius: 12,
            border: "1px dashed var(--layer-4)",
            padding: 14,
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 10, letterSpacing: "0.14em", color: "var(--text-label)", textAlign: "center" }}>ADD DEVICE</span>
          {available.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => addNodeDevice(nodeId, k)}
              style={{
                height: 30,
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: "var(--font-display)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background: "var(--layer-2)",
                color: DEVICE_META[k].color,
                border: "1px solid var(--layer-5)",
              }}
            >
              + {DEVICE_META[k].label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function DeviceChain() {
  const { rackOpen, selNode, toggleRack, deviceCount } = useDawStore(
    useShallow((s) => ({
      rackOpen: s.rackOpen,
      selNode: s.selTrack,
      toggleRack: s.toggleRack,
      deviceCount: s.selTrack === "master" ? 3 : (s.nodeRacks[s.selTrack]?.length ?? 0),
    })),
  );

  const isMaster = selNode === "master";
  const def = nodeDef(selNode);
  const plural = deviceCount === 1 ? "" : "s";
  const deviceLabel = isMaster ? "master mastering chain" : `${deviceCount} device${plural}`;

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
        <span style={{ fontSize: 11, letterSpacing: "0.16em", color: "var(--text-2)", fontWeight: 600 }}>DEVICE CHAIN</span>
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
          <span style={{ width: 10, height: 10, borderRadius: 3, background: def.color, boxShadow: `0 0 8px ${def.color}`, flex: "none" }} />
          <span style={{ fontSize: 12, color: "var(--text-1)", fontWeight: 600 }}>{def.name}</span>
        </span>
        <span style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>
          signal flows left → right
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>
          {deviceLabel}
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
        {isMaster ? (
          <>
            <ZandersEQ />
            <ZandersTapeStop />
            <ZandersPreDrop />
            <AddDeviceSlot />
          </>
        ) : (
          <NodeRack nodeId={selNode} />
        )}
      </div>
    </div>
  );
}

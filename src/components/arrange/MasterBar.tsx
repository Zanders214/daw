import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { Meter } from "../../design-system";

const HEADER_W = 258;

function dot(c: string): React.CSSProperties {
  return { width: 9, height: 9, borderRadius: "50%", background: c, boxShadow: `0 0 8px ${c}`, flex: "none", opacity: 1 };
}

/** Live master-out meter + dB (subscribes to master/playing). */
function MasterOutMeter() {
  const { master, playing } = useDawStore(
    useShallow((s) => ({ master: s.master, playing: s.playing })),
  );
  const masterDb = playing ? (-(1 - master) * 18).toFixed(1) + " dB" : "-∞";
  return (
    <div style={{ flex: 1, maxWidth: 460, display: "flex", flexDirection: "column", gap: 7 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9,
          letterSpacing: "0.14em",
          color: "var(--text-label)",
        }}
      >
        <span>MASTER OUT</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{masterDb}</span>
      </div>
      <Meter value={master} height={9} />
    </div>
  );
}

export function MasterBar({ tracksRight }: { tracksRight: boolean }) {
  const { selMaster, openMasterChain } = useDawStore(
    useShallow((s) => ({ selMaster: s.selTrack === "master", openMasterChain: s.openMasterChain })),
  );
  const sb = "1px solid var(--layer-3)";

  const chip: React.CSSProperties = {
    height: 22,
    padding: "0 9px",
    borderRadius: 6,
    background: "var(--layer-2)",
    border: "1px solid var(--layer-5)",
    color: "var(--text-3)",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.08em",
    fontFamily: "var(--font-display)",
    display: "flex",
    alignItems: "center",
  };

  const chainBtn: React.CSSProperties = {
    padding: "3px 9px",
    borderRadius: 6,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.08em",
    fontFamily: "var(--font-display)",
    flex: "none",
    ...(selMaster
      ? { background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-line)" }
      : { background: "var(--layer-2)", color: "var(--text-3)", border: "1px solid var(--layer-5)" }),
  };

  return (
    <div
      style={{
        height: 62,
        flex: "none",
        display: "flex",
        flexDirection: tracksRight ? "row-reverse" : "row",
        borderTop: sb,
        background: "var(--app-trackhead)",
      }}
    >
      <div
        onClick={openMasterChain}
        title="Open master chain"
        style={{
          width: HEADER_W,
          flex: "none",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 16px",
          cursor: "pointer",
          borderRight: tracksRight ? "none" : sb,
          borderLeft: tracksRight ? sb : "none",
          background: selMaster ? "linear-gradient(90deg, rgba(94,147,255,0.10), transparent)" : "transparent",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={dot("#5e93ff")} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--text-1)", letterSpacing: "0.05em" }}>
            MASTER
          </span>
          <span style={chainBtn}>CHAIN ▸</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9 }}>
          <span style={chip}>DIM</span>
          <span style={chip}>MONO</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}>−14 LUFS</span>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 18, padding: "0 20px", minWidth: 0 }}>
        <MasterOutMeter />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={dot("#34d8ff")} />
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-2)", fontFamily: "var(--font-mono)" }}>EQ</span>
          <span style={{ width: 1, height: 14, background: "var(--layer-3)" }} />
          <span style={dot("#5e93ff")} />
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-2)", fontFamily: "var(--font-mono)" }}>
            LIMITER
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-faint)", letterSpacing: "0.08em" }}>
          double-click a track to open its chain
        </span>
      </div>
    </div>
  );
}

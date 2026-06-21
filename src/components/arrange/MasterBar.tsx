import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { Meter, Slider, Dial } from "../../design-system";

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

/** Master volume fader + dB readout (subscribes to masterVolume). */
function MasterFader() {
  const { masterVolume, setMasterVolume } = useDawStore(
    useShallow((s) => ({ masterVolume: s.masterVolume, setMasterVolume: s.setMasterVolume })),
  );
  const db = masterVolume <= 0.001 ? "-∞" : (20 * Math.log10(masterVolume)).toFixed(1) + " dB";
  return (
    <div style={{ width: 170, flex: "none", display: "flex", flexDirection: "column", gap: 7 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9,
          letterSpacing: "0.14em",
          color: "var(--text-label)",
        }}
      >
        <span>VOLUME</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{db}</span>
      </div>
      <Slider value={masterVolume} onChange={setMasterVolume} gradient="var(--accent-grad)" />
    </div>
  );
}

/** Master pan dial + L/C/R readout (subscribes to masterPan). */
function MasterPan() {
  const { masterPan, setMasterPan } = useDawStore(
    useShallow((s) => ({ masterPan: s.masterPan, setMasterPan: s.setMasterPan })),
  );
  const panMag =
    masterPan < 0.5
      ? `L${Math.round((0.5 - masterPan) * 200)}`
      : `R${Math.round((masterPan - 0.5) * 200)}`;
  const label = Math.abs(masterPan - 0.5) < 0.005 ? "C" : panMag;
  return (
    <div style={{ width: 70, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", width: "100%", fontSize: 9, letterSpacing: "0.14em", color: "var(--text-label)" }}>
        <span>PAN</span>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{label}</span>
      </div>
      <div
        role="button"
        tabIndex={0}
        onDoubleClick={() => setMasterPan(0.5)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setMasterPan(0.5);
          }
        }}
        title="Master pan (double-click to center)"
      >
        <Dial value={masterPan} onChange={setMasterPan} label={null} size={30} color="var(--accent)" />
      </div>
    </div>
  );
}

/** Aux return gains + meters + chain access (subscribes to returnGains/returnLevels). */
function ReturnsStrip() {
  const { returnGains, returnLevels, setReturnGain, openReturnChain, selNode } = useDawStore(
    useShallow((s) => ({
      returnGains: s.returnGains,
      returnLevels: s.returnLevels,
      setReturnGain: s.setReturnGain,
      openReturnChain: s.openReturnChain,
      selNode: s.selTrack,
    })),
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
      {["A", "B"].map((lbl, i) => {
        const sel = selNode === `return-${i}`;
        return (
          <div key={lbl} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: 46 }}>
            <button
              type="button"
              onClick={() => openReturnChain(i)}
              title={`Open return ${lbl} chain`}
              style={{
                fontSize: 9,
                letterSpacing: "0.1em",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                cursor: "pointer",
                padding: "2px 6px",
                borderRadius: 5,
                background: sel ? "var(--accent-soft)" : "transparent",
                color: sel ? "var(--accent)" : "var(--text-label)",
                border: "1px solid " + (sel ? "var(--accent-line)" : "transparent"),
              }}
            >
              RET {lbl}
            </button>
            <div
              role="button"
              tabIndex={0}
              onDoubleClick={() => setReturnGain(i, 1)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setReturnGain(i, 1);
                }
              }}
              title={`Return ${lbl} level`}
            >
              <Dial value={Math.min(1, returnGains[i] ?? 1)} onChange={(v) => setReturnGain(i, v)} label={null} size={26} color="var(--spectrum-violet)" />
            </div>
            <div style={{ width: 30 }}>
              <Meter value={returnLevels[i] ?? 0} height={4} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MasterBar({ tracksRight }: Readonly<{ tracksRight: boolean }>) {
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
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openMasterChain();
          }
        }}
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
        <MasterFader />
        <MasterPan />
        <ReturnsStrip />
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

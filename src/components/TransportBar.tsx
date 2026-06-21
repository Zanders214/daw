import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../store/useDawStore";
import { Wordmark, GlowButton, Meter } from "../design-system";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Live bar.beat.sixteenth position readout (subscribes only to playhead). */
function PositionReadout() {
  const ph = useDawStore((s) => s.playhead);
  const bar = Math.floor(ph / 4) + 1;
  const beat = Math.floor(ph % 4) + 1;
  const six = Math.floor((ph % 1) * 4) + 1;
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 22,
        color: "var(--text-1)",
        letterSpacing: "0.04em",
        lineHeight: 1.1,
      }}
    >
      {`${pad2(bar)}.${beat}.${six}`}
    </span>
  );
}

/** Four beat dots; the current beat lights while playing with metronome on. */
function BeatDots() {
  const { ph, playing, metronome } = useDawStore(
    useShallow((s) => ({ ph: s.playhead, playing: s.playing, metronome: s.metronome })),
  );
  const beatInBar = Math.floor(ph % 4);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {[0, 1, 2, 3].map((i) => {
        const lit = playing && metronome && i === beatInBar;
        const c = i === 0 ? "#ffc24b" : "var(--accent)";
        return (
          <span
            key={i}
            style={{
              width: i === 0 ? 9 : 7,
              height: i === 0 ? 9 : 7,
              borderRadius: "50%",
              flex: "none",
              background: lit ? c : "var(--layer-4)",
              boxShadow: lit ? `0 0 8px ${c}` : "none",
              transition: "background 0.05s, box-shadow 0.05s",
            }}
          />
        );
      })}
    </div>
  );
}

const readoutPill: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  padding: "6px 14px",
  borderRadius: 10,
  background: "var(--well)",
  boxShadow: "var(--shadow-window)",
  border: "1px solid var(--layer-2)",
};
const readoutCap: React.CSSProperties = {
  fontSize: 8.5,
  letterSpacing: "0.18em",
  color: "var(--text-label)",
  fontFamily: "var(--font-display)",
};

/** Master level meter + dB readout (subscribes to master/playing). */
function MasterMeterCluster() {
  const { master, playing } = useDawStore(
    useShallow((s) => ({ master: s.master, playing: s.playing })),
  );
  const masterDb = playing ? (-(1 - master) * 18).toFixed(1) + " dB" : "-∞";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 7, width: 200 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
            fontSize: 9,
            letterSpacing: "0.14em",
            color: "var(--text-label)",
          }}
        >
          <span>MASTER</span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{masterDb}</span>
        </div>
        <div style={{ width: "100%" }}>
          <Meter value={master} height={7} />
        </div>
      </div>
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: "50%",
          background: "var(--knob-face)",
          border: "1px solid var(--layer-5)",
          boxShadow: "var(--shadow-knob)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-2)",
        }}
      >
        0.0
      </div>
    </div>
  );
}

const sideBtn: React.CSSProperties = {
  borderRadius: 10,
  background: "var(--layer-2)",
  border: "1px solid var(--layer-5)",
  cursor: "pointer",
  boxShadow: "var(--inset-top)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const divider = <div style={{ width: 1, height: 34, background: "var(--layer-3)" }} />;

export function TransportBar() {
  const {
    playing,
    recording,
    loop,
    metronome,
    bpm,
    togglePlay,
    stop,
    rewind,
    toggleRecord,
    toggleLoop,
    toggleMetronome,
    openSettings,
    setBpm,
  } = useDawStore(
    useShallow((s) => ({
      playing: s.playing,
      recording: s.recording,
      loop: s.loop,
      metronome: s.metronome,
      bpm: s.bpm,
      togglePlay: s.togglePlay,
      stop: s.stop,
      rewind: s.rewind,
      toggleRecord: s.toggleRecord,
      toggleLoop: s.toggleLoop,
      toggleMetronome: s.toggleMetronome,
      openSettings: s.openSettings,
      setBpm: s.setBpm,
    })),
  );

  const [tempoEdit, setTempoEdit] = useState<string | null>(null);
  const commitTempo = () => {
    const n = parseFloat(tempoEdit ?? "");
    if (!Number.isNaN(n)) setBpm(n);
    setTempoEdit(null);
  };

  const loopBtnStyle: React.CSSProperties = {
    height: 48,
    padding: "0 18px",
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.14em",
    cursor: "pointer",
    fontFamily: "var(--font-display)",
    ...(loop
      ? {
          background: "var(--accent-soft)",
          color: "var(--accent)",
          border: "1px solid var(--accent-line)",
          boxShadow: "0 0 14px var(--accent-glow)",
        }
      : {
          background: "var(--layer-2)",
          color: "var(--text-3)",
          border: "1px solid var(--layer-5)",
          boxShadow: "var(--inset-top)",
        }),
  };

  const metroBtnStyle: React.CSSProperties = {
    width: 40,
    height: 40,
    borderRadius: 10,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-display)",
    ...(metronome
      ? {
          background: "var(--accent-soft)",
          color: "var(--accent)",
          border: "1px solid var(--accent-line)",
          boxShadow: "0 0 12px var(--accent-glow)",
        }
      : {
          background: "var(--layer-2)",
          color: "var(--text-3)",
          border: "1px solid var(--layer-5)",
          boxShadow: "var(--inset-top)",
        }),
  };

  return (
    <div
      style={{
        height: 68,
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 22,
        padding: "0 22px",
        borderBottom: "1px solid var(--layer-3)",
        background: "var(--app-topbar)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.4)",
      }}
    >
      {/* brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div
          onClick={openSettings}
          title="Settings"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "var(--knob-face)",
            border: "1px solid var(--layer-5)",
            boxShadow: "var(--shadow-knob)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: "50%",
              background: "var(--spectrum-ramp)",
              boxShadow: "0 0 9px rgba(120,160,255,0.7)",
            }}
          />
        </div>
        <Wordmark product="Studio" color="var(--spectrum-cyan)" size={18} />
      </div>

      {divider}

      {/* transport */}
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <button
          type="button"
          onClick={rewind}
          style={{ ...sideBtn, width: 40, height: 40, color: "var(--text-2)", fontSize: 13 }}
        >
          ⏮
        </button>
        <div style={{ width: 128 }}>
          <GlowButton engaged={playing} idleLabel="PLAY" onClick={togglePlay}>
            PLAYING
          </GlowButton>
        </div>
        <button
          type="button"
          onClick={stop}
          style={{ ...sideBtn, width: 48, height: 48, color: "var(--text-1)" }}
        >
          <span style={{ width: 13, height: 13, borderRadius: 2, background: "var(--text-1)" }} />
        </button>
        <div style={{ width: 120 }}>
          <GlowButton variant="danger" engaged={recording} idleLabel="REC" onClick={toggleRecord}>
            REC
          </GlowButton>
        </div>
        <button type="button" onClick={toggleLoop} style={loopBtnStyle}>
          LOOP
        </button>
      </div>

      {divider}

      {/* metronome */}
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <button type="button" onClick={toggleMetronome} title="Metronome" style={metroBtnStyle}>
          <span style={{ fontSize: 17, lineHeight: 1 }}>♩</span>
        </button>
        <BeatDots />
      </div>

      {divider}

      {/* readouts */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ ...readoutPill, minWidth: 128 }}>
          <span style={readoutCap}>POSITION</span>
          <PositionReadout />
        </div>
        <div
          style={{ ...readoutPill, cursor: "text" }}
          title="Double-click to set tempo"
          onDoubleClick={() => setTempoEdit(String(bpm))}
        >
          <span style={readoutCap}>TEMPO</span>
          {tempoEdit === null ? (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 22,
                color: "var(--spectrum-cyan)",
                letterSpacing: "0.04em",
                lineHeight: 1.1,
              }}
            >
              {bpm}
              <span style={{ fontSize: 11, color: "var(--text-3)" }}> BPM</span>
            </span>
          ) : (
            <input
              autoFocus
              type="number"
              min={20}
              value={tempoEdit}
              onChange={(e) => setTempoEdit(e.target.value)}
              onBlur={commitTempo}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTempo();
                else if (e.key === "Escape") setTempoEdit(null);
              }}
              style={{
                width: 72,
                background: "var(--well)",
                border: "1px solid var(--accent-line)",
                borderRadius: 5,
                color: "var(--spectrum-cyan)",
                fontFamily: "var(--font-mono)",
                fontSize: 20,
                lineHeight: 1.1,
                padding: "0 4px",
              }}
            />
          )}
        </div>
        <div style={readoutPill}>
          <span style={readoutCap}>SIG</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 22, color: "var(--text-1)", lineHeight: 1.1 }}>
            4/4
          </span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <MasterMeterCluster />
    </div>
  );
}

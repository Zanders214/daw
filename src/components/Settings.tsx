import { useEffect, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../store/useDawStore";
import { OUTPUT_DEVICES, MIDI_INPUTS } from "../data/seed";
import type { ThemeName } from "../types";

const FALLBACK_SAMPLE_RATES = [44.1, 48, 96];
const FALLBACK_BUFFER_SIZES = [64, 128, 256, 512];

function segStyle(active: boolean): React.CSSProperties {
  return {
    padding: "7px 13px",
    borderRadius: 8,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    cursor: "pointer",
    fontFamily: "var(--font-display)",
    ...(active
      ? { background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-line)" }
      : { background: "var(--layer-1)", color: "var(--text-3)", border: "1px solid var(--layer-3)" }),
  };
}

function Segmented<T extends string | number>({
  options,
  value,
  onPick,
}: {
  options: [T, string][];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" onClick={() => onPick(v)} style={segStyle(value === v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        flex: "none",
        cursor: "pointer",
        position: "relative",
        background: on ? "var(--accent-grad)" : "var(--layer-3)",
        border: "1px solid " + (on ? "var(--accent-line)" : "var(--layer-5)"),
        boxShadow: on ? "0 0 12px var(--accent-glow)" : "var(--inset-top)",
        transition: "background var(--dur-base) var(--ease)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: on ? 21 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          transition: "left var(--dur-base) var(--ease)",
        }}
      />
    </div>
  );
}

function Row({ label, desc, last, children }: { label: string; desc: string; last?: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "15px 0",
        borderBottom: last ? "none" : "1px solid var(--layer-2)",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{label}</div>
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{desc}</div>
      </div>
      {children}
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.18em",
  color: "var(--text-label)",
  fontWeight: 700,
  margin: "26px 0 4px",
};

const selectStyle: React.CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 9,
  background: "var(--well)",
  border: "1px solid var(--layer-3)",
  color: "var(--text-1)",
  fontFamily: "var(--font-display)",
  fontSize: 12,
  cursor: "pointer",
  boxShadow: "var(--inset-top)",
  minWidth: 210,
};

export function Settings() {
  const s = useDawStore(
    useShallow((st) => ({
      settingsOpen: st.settingsOpen,
      theme: st.theme,
      tracksRight: st.tracksRight,
      showGrid: st.showGrid,
      vibrantClips: st.vibrantClips,
      sampleRate: st.sampleRate,
      bufferSize: st.bufferSize,
      outputDevice: st.outputDevice,
      availableOutputs: st.availableOutputs,
      availableSampleRates: st.availableSampleRates,
      availableBufferSizes: st.availableBufferSizes,
      refreshDevices: st.refreshDevices,
      midiInput: st.midiInput,
      midiThru: st.midiThru,
      metronome: st.metronome,
      countIn: st.countIn,
      autoSave: st.autoSave,
      closeSettings: st.closeSettings,
      setTheme: st.setTheme,
      setTracksRight: st.setTracksRight,
      toggleGrid: st.toggleGrid,
      toggleVibrant: st.toggleVibrant,
      setSampleRate: st.setSampleRate,
      setBufferSize: st.setBufferSize,
      setOutputDevice: st.setOutputDevice,
      setMidiInput: st.setMidiInput,
      toggleMidiThru: st.toggleMidiThru,
      toggleMetronome: st.toggleMetronome,
      setCountIn: st.setCountIn,
      toggleAutoSave: st.toggleAutoSave,
    })),
  );

  // Pull the real device list from the engine whenever the panel opens.
  useEffect(() => {
    if (s.settingsOpen) s.refreshDevices();
  }, [s.settingsOpen, s.refreshDevices]);

  if (!s.settingsOpen) return null;

  const latencyMs = (s.bufferSize / (s.sampleRate * 1000) * 2000).toFixed(1);

  const outputOptions = s.availableOutputs.length ? s.availableOutputs : OUTPUT_DEVICES;
  const rateOptions = (s.availableSampleRates.length ? s.availableSampleRates : FALLBACK_SAMPLE_RATES).map(
    (r) => [r, String(r)] as [number, string],
  );
  const bufferOptions = (s.availableBufferSizes.length ? s.availableBufferSizes : FALLBACK_BUFFER_SIZES).map(
    (b) => [b, String(b)] as [number, string],
  );

  return (
    <div
      onClick={s.closeSettings}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 760,
          maxHeight: "86%",
          display: "flex",
          flexDirection: "column",
          background: "var(--panel)",
          borderRadius: 16,
          border: "1px solid var(--layer-3)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "20px 26px",
            borderBottom: "1px solid var(--layer-2)",
            flex: "none",
          }}
        >
          <span
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
              fontSize: 15,
              color: "var(--text-2)",
            }}
          >
            ⚙
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", letterSpacing: "0.02em" }}>
              Settings
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              Zanders Studio · session preferences
            </div>
          </div>
          <button
            type="button"
            onClick={s.closeSettings}
            title="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "var(--layer-2)",
              border: "1px solid var(--layer-5)",
              color: "var(--text-2)",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        <div className="zd-scroll" style={{ flex: 1, overflowY: "auto", padding: "2px 26px 24px" }}>
          <div style={{ ...sectionStyle, marginTop: 22 }}>APPEARANCE</div>
          <Row label="Theme" desc="Color treatment for the whole workspace">
            <Segmented<ThemeName>
              options={[
                ["dark", "DARK"],
                ["light", "LIGHT"],
                ["midnight", "MIDNIGHT"],
              ]}
              value={s.theme}
              onPick={s.setTheme}
            />
          </Row>
          <Row label="Track list side" desc="Place track headers on the left or right">
            <Segmented<0 | 1>
              options={[
                [0, "LEFT"],
                [1, "RIGHT"],
              ]}
              value={s.tracksRight ? 1 : 0}
              onPick={(v) => s.setTracksRight(v === 1)}
            />
          </Row>
          <Row label="Show grid" desc="Bar and beat guide lines in the arrange">
            <Switch on={s.showGrid} onToggle={s.toggleGrid} />
          </Row>
          <Row label="Spectrum clips" desc="Vibrant color-coded clip fills">
            <Switch on={s.vibrantClips} onToggle={s.toggleVibrant} />
          </Row>

          <div style={sectionStyle}>AUDIO ENGINE</div>
          <Row label="Output device" desc="Hardware audio interface">
            <select
              value={s.outputDevice}
              onChange={(e) => s.setOutputDevice(e.target.value)}
              style={selectStyle}
            >
              {outputOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Sample rate" desc="Higher rates cost more CPU">
            <div style={{ display: "flex", alignItems: "center" }}>
              <Segmented<number> options={rateOptions} value={s.sampleRate} onPick={s.setSampleRate} />
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-faint)", marginLeft: 8 }}>
                kHz
              </span>
            </div>
          </Row>
          <Row label="Buffer size" desc="Smaller = lower latency, more CPU">
            <div style={{ display: "flex", alignItems: "center" }}>
              <Segmented<number> options={bufferOptions} value={s.bufferSize} onPick={s.setBufferSize} />
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-faint)", marginLeft: 8 }}>
                smp
              </span>
            </div>
          </Row>
          <Row label="Round-trip latency" desc="Calculated from buffer and sample rate">
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--spectrum-cyan)" }}>
              {latencyMs}
              <span style={{ fontSize: 11, color: "var(--text-3)" }}> ms</span>
            </span>
          </Row>

          <div style={sectionStyle}>MIDI</div>
          <Row label="Input device" desc="Controller routed to armed tracks">
            <select value={s.midiInput} onChange={(e) => s.setMidiInput(e.target.value)} style={selectStyle}>
              {MIDI_INPUTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Row>
          <Row label="MIDI thru" desc="Echo input to the track's instrument">
            <Switch on={s.midiThru} onToggle={s.toggleMidiThru} />
          </Row>

          <div style={sectionStyle}>RECORDING</div>
          <Row label="Metronome" desc="Click during playback and recording">
            <Switch on={s.metronome} onToggle={s.toggleMetronome} />
          </Row>
          <Row label="Count-in" desc="Bars of click before recording starts">
            <Segmented<number>
              options={[
                [0, "OFF"],
                [1, "1 BAR"],
                [2, "2 BARS"],
              ]}
              value={s.countIn}
              onPick={s.setCountIn}
            />
          </Row>
          <Row label="Auto-save" desc="Save the session every few minutes" last>
            <Switch on={s.autoSave} onToggle={s.toggleAutoSave} />
          </Row>
        </div>
      </div>
    </div>
  );
}

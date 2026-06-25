import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../../store/useDawStore";
import { Meter, Slider, Dial } from "../../design-system";
import { AutomationChips, TRACK_AUTO_PARAMS } from "./AutomationLane";
import { DEFAULT_VOLUME, BEATS_PER_BAR, DEFAULT_TRACK_H } from "../../lib/constants";
import { engineActive } from "../../lib/engine";
import { startUiResize } from "../../lib/uiDrag";
import type { Track } from "../../types";

// Stable fallback so the sends selector doesn't return a new array each render
// (a fresh `[0, 0]` fails useShallow's shallow check and loops — React #185).
const EMPTY_SENDS: number[] = [0, 0];

const idleBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: "1px solid var(--layer-5)",
  background: "var(--layer-2)",
  color: "var(--text-3)",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "var(--font-display)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "var(--inset-top)",
};

/** Live per-track level meter (subscribes to its own level only). */
function TrackMeter({ id }: Readonly<{ id: string }>) {
  const level = useDawStore((s) => s.levels[id] ?? 0);
  return (
    <div style={{ flex: 1 }}>
      <Meter value={level} height={5} />
    </div>
  );
}

/** Expandable per-track aux-send row (height kept in sync with the lane spacer). */
export const SEND_ROW_H = 52;
function SendRow({ id }: Readonly<{ id: string }>) {
  const { sends, setSend } = useDawStore(
    useShallow((s) => ({ sends: s.sends[id] ?? EMPTY_SENDS, setSend: s.setSend })),
  );
  return (
    <div
      style={{
        height: SEND_ROW_H,
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "0 16px",
        borderBottom: "1px solid var(--layer-2)",
        background: "var(--app-trackhead)",
      }}
    >
      <span style={{ fontSize: 9, letterSpacing: "0.12em", color: "var(--text-label)" }}>SENDS</span>
      {["A", "B"].map((lbl, i) => (
        <div key={lbl} role="button" tabIndex={0} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div
            onDoubleClick={() => setSend(id, i, 0)}
            title={`Send ${lbl} (double-click to zero)`}
          >
            <Dial value={sends[i] ?? 0} onChange={(v) => setSend(id, i, v)} label={null} size={26} color="var(--spectrum-violet)" />
          </div>
          <span style={{ fontSize: 9, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>{lbl}</span>
        </div>
      ))}
    </div>
  );
}

export function TrackHeader({ track }: Readonly<{ track: Track }>) {
  const id = track.id;
  const {
    muted,
    solo,
    armed,
    selected,
    vol,
    pan,
    autoOpen,
    sendsOpen,
    fileLoaded,
    fileName,
    height,
    selectTrack,
    openTrackChain,
    toggleMute,
    toggleSolo,
    toggleArm,
    toggleAuto,
    toggleSendsRow,
    setVolume,
    setPan,
    setTrackHeight,
    pickTrackFile,
    pickClipFile,
    clearTrackFile,
    removeTrack,
  } = useDawStore(
    useShallow((s) => ({
      muted: !!s.mutes[id],
      solo: !!s.solos[id],
      armed: !!s.arms[id],
      selected: s.selTrack === id,
      vol: s.volumes[id] ?? DEFAULT_VOLUME,
      pan: s.pans[id] ?? 0.5,
      autoOpen: !!s.autoLanes[id],
      sendsOpen: !!s.sendsOpen[id],
      height: s.trackHeights[id] ?? DEFAULT_TRACK_H,
      fileLoaded: !!s.trackFiles[id]?.loaded,
      fileName: s.trackFiles[id]?.name,
      selectTrack: s.selectTrack,
      openTrackChain: s.openTrackChain,
      toggleMute: s.toggleMute,
      toggleSolo: s.toggleSolo,
      toggleArm: s.toggleArm,
      toggleAuto: s.toggleAuto,
      toggleSendsRow: s.toggleSendsRow,
      setVolume: s.setVolume,
      setPan: s.setPan,
      setTrackHeight: s.setTrackHeight,
      pickTrackFile: s.pickTrackFile,
      pickClipFile: s.pickClipFile,
      clearTrackFile: s.clearTrackFile,
      removeTrack: s.removeTrack,
    })),
  );
  // Hosted only: the native chooser places an audio clip carrying a disk path
  // (the engine plays clips by path; browser drag-in import is the web path).
  const hosted = engineActive();

  const volDb = vol <= 0.001 ? "-∞" : (20 * Math.log10(vol)).toFixed(1) + " dB";
  const panMag =
    pan < 0.5 ? `L${Math.round((0.5 - pan) * 200)}` : `R${Math.round((pan - 0.5) * 200)}`;
  const panLabel = Math.abs(pan - 0.5) < 0.005 ? "C" : panMag;

  const mStyle = { ...idleBtn, ...(muted ? { background: "var(--danger-grad)", color: "#fff", borderColor: "rgba(255,120,120,0.6)", boxShadow: "0 0 12px var(--danger-glow)" } : null) };
  const sStyle = { ...idleBtn, ...(solo ? { background: "var(--accent-grad)", color: "#fff", borderColor: "rgba(150,170,255,0.6)", boxShadow: "0 0 12px var(--accent-glow)" } : null) };
  const aStyle = { ...idleBtn, ...(armed ? { color: "var(--danger)", borderColor: "var(--danger)", boxShadow: "0 0 10px var(--danger-glow)" } : null) };
  const autoBtnStyle = { ...idleBtn, ...(autoOpen ? { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent-line)", boxShadow: "0 0 10px var(--accent-glow)" } : null) };

  // Drag the bottom edge to resize this lane (header + arrange lane read the same
  // stored height, so the two columns stay row-aligned).
  const onResizeDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    const startY = e.clientY;
    const startH = height;
    startUiResize((ev) => setTrackHeight(id, startH + (ev.clientY - startY)), "ns-resize");
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => { if (!(e.target as HTMLElement).closest("[data-ctl]")) selectTrack(id); }}
        onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("[data-ctl]")) openTrackChain(id); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectTrack(id); } }}
        style={{
          position: "relative",
          height,
          padding: "10px 16px",
          borderBottom: "1px solid var(--layer-2)",
          cursor: "pointer",
          boxSizing: "border-box",
          background: selected ? "linear-gradient(90deg, rgba(94,147,255,0.10), transparent)" : "transparent",
          borderLeft: selected ? "2px solid var(--accent)" : "2px solid transparent",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleMute(id);
            }}
            title="Mute / unmute"
            style={{
              appearance: "none",
              padding: 0,
              font: "inherit",
              boxSizing: "border-box",
              border: "none",
              width: 11,
              height: 11,
              borderRadius: 3,
              background: track.color,
              boxShadow: muted ? "none" : `0 0 9px ${track.color}`,
              flex: "none",
              cursor: "pointer",
              opacity: muted ? 0.3 : 1,
              transition: "opacity 0.1s, box-shadow 0.1s",
            }}
          />
          <span
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-1)",
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {track.name}
          </span>
          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}>{track.io}</span>
          <button
            type="button"
            title="Aux sends"
            onClick={(e) => {
              e.stopPropagation();
              toggleSendsRow(id);
            }}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              fontSize: 11,
              lineHeight: 1,
              cursor: "pointer",
              flex: "none",
              fontFamily: "var(--font-display)",
              ...(sendsOpen
                ? { background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-line)" }
                : { background: "var(--layer-2)", color: "var(--text-3)", border: "1px solid var(--layer-5)" }),
            }}
          >
            ⇄
          </button>
          <button
            type="button"
            title={fileLoaded ? `Audio: ${fileName ?? ""} — click to replace` : "Load an audio file"}
            onClick={(e) => {
              e.stopPropagation();
              pickTrackFile(id);
            }}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              fontSize: 11,
              lineHeight: 1,
              cursor: "pointer",
              flex: "none",
              fontFamily: "var(--font-display)",
              ...(fileLoaded
                ? { background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent-line)" }
                : { background: "var(--layer-2)", color: "var(--text-3)", border: "1px solid var(--layer-5)" }),
            }}
          >
            ♪
          </button>
          {hosted && (
            <button
              type="button"
              title="Add an audio clip at the playhead"
              onClick={(e) => {
                e.stopPropagation();
                pickClipFile(id, Math.floor(useDawStore.getState().playhead / BEATS_PER_BAR));
              }}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                fontSize: 11,
                lineHeight: 1,
                cursor: "pointer",
                flex: "none",
                fontFamily: "var(--font-display)",
                background: "var(--layer-2)",
                color: "var(--text-3)",
                border: "1px solid var(--layer-5)",
              }}
            >
              ＋
            </button>
          )}
          {fileLoaded && (
            <button
              type="button"
              title="Clear audio"
              onClick={(e) => {
                e.stopPropagation();
                clearTrackFile(id);
              }}
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                fontSize: 10,
                lineHeight: 1,
                cursor: "pointer",
                flex: "none",
                background: "var(--layer-2)",
                color: "var(--text-3)",
                border: "1px solid var(--layer-5)",
              }}
            >
              ✕
            </button>
          )}
          <button
            type="button"
            title="Delete track"
            onClick={(e) => {
              e.stopPropagation();
              removeTrack(id);
            }}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              fontSize: 11,
              lineHeight: 1,
              cursor: "pointer",
              flex: "none",
              fontFamily: "var(--font-display)",
              background: "var(--layer-2)",
              color: "var(--text-3)",
              border: "1px solid var(--layer-5)",
            }}
          >
            🗑
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9 }}>
          <button type="button" onClick={(e) => { e.stopPropagation(); toggleMute(id); }} style={mStyle}>M</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); toggleSolo(id); }} style={sStyle}>S</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); toggleArm(id); }} style={aStyle}>●</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); toggleAuto(id); }} title="Automation lane" style={autoBtnStyle}>A</button>
          <div
            data-ctl=""
            onDoubleClick={(e) => { e.stopPropagation(); setPan(id, 0.5); }}
            title={`Pan: ${panLabel} (double-click to center)`}
            style={{ flex: "none" }}
          >
            <Dial value={pan} onChange={(v) => setPan(id, v)} label={null} size={28} color="var(--accent)" />
          </div>
          <TrackMeter id={id} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 9 }}>
          <span style={{ fontSize: 9, color: "var(--text-label)", letterSpacing: "0.1em", flex: "none" }}>VOL</span>
          <div style={{ flex: 1 }} data-ctl="">
            <Slider value={vol} onChange={(v) => setVolume(id, v)} />
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-faint)",
              width: 48,
              textAlign: "right",
              flex: "none",
            }}
          >
            {volDb}
          </span>
        </div>
        <div
          data-ctl=""
          onPointerDown={onResizeDown}
          title="Drag to resize track height"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 6,
            cursor: "ns-resize",
            touchAction: "none",
            zIndex: 3,
          }}
        />
      </div>
      {autoOpen && <AutomationChips nodeId={id} color={track.color} params={TRACK_AUTO_PARAMS} />}
      {sendsOpen && <SendRow id={id} />}
    </>
  );
}

import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useDawStore } from "../store/useDawStore";
import { hexA } from "../lib/color";
import { BEATS_PER_BAR, NOTE_STEP, PITCH_MAX, PITCH_MIN } from "../lib/constants";
import { newNoteId } from "../lib/dnd";
import { snap, startDrag } from "../lib/timeline";
import type { Note } from "../types";

const ROW_H = 14;
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (p: number) => NAMES[((p % 12) + 12) % 12] + (Math.floor(p / 12) - 1);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const gridStep = (alt: boolean) => (alt ? 0 : NOTE_STEP);

export function PianoRoll() {
  const { editorOpen, editorClip, editorTrack, tracks, closeEditor, addNote, moveNote, resizeNote, removeNote } =
    useDawStore(
      useShallow((s) => ({
        editorOpen: s.editorOpen,
        editorClip: s.editorClip,
        editorTrack: s.editorTrack,
        tracks: s.tracks,
        closeEditor: s.closeEditor,
        addNote: s.addNote,
        moveNote: s.moveNote,
        resizeNote: s.resizeNote,
        removeNote: s.removeNote,
      })),
    );
  const gridRef = useRef<HTMLDivElement>(null);
  const [selNote, setSelNote] = useState("");

  const track = tracks.find((t) => t.id === editorTrack);
  const clip = track?.clips.find((c) => c.id === editorClip);
  if (!editorOpen || !track || !clip) return null;

  const rows = PITCH_MAX - PITCH_MIN + 1;
  const clipBeats = clip.len * BEATS_PER_BAR || BEATS_PER_BAR;
  const notes = clip.notes ?? [];
  const color = track.color;

  const rect = () => gridRef.current?.getBoundingClientRect() ?? null;
  const beatAtX = (clientX: number, r: DOMRect) => clamp01((clientX - r.left) / r.width) * clipBeats;
  const pitchAtY = (clientY: number, r: DOMRect) =>
    PITCH_MAX - Math.floor(clamp01((clientY - r.top) / r.height) * rows);

  const xPct = (beats: number) => (beats / clipBeats) * 100 + "%";
  const topPx = (pitch: number) => (PITCH_MAX - pitch) * ROW_H;

  const addAt = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const r = rect();
    if (!r) return;
    const id = newNoteId();
    const start = snap(beatAtX(e.clientX, r), gridStep(e.altKey));
    addNote(track.id, clip.id, { id, start, len: 1, pitch: pitchAtY(e.clientY, r) });
    setSelNote(id);
  };

  const moveNoteDrag = (n: Note) => (e: React.PointerEvent) => {
    e.stopPropagation();
    setSelNote(n.id);
    const r = rect();
    if (!r || e.button !== 0) return;
    const grab = beatAtX(e.clientX, r) - n.start;
    startDrag((ev) => {
      moveNote(track.id, clip.id, n.id, snap(beatAtX(ev.clientX, r) - grab, gridStep(ev.altKey)), pitchAtY(ev.clientY, r));
    });
  };

  const resizeNoteDrag = (n: Note) => (e: React.PointerEvent) => {
    e.stopPropagation();
    setSelNote(n.id);
    const r = rect();
    if (!r || e.button !== 0) return;
    startDrag((ev) => resizeNote(track.id, clip.id, n.id, snap(beatAtX(ev.clientX, r) - n.start, gridStep(ev.altKey))));
  };

  const del = (id: string) => {
    removeNote(track.id, clip.id, id);
    if (selNote === id) setSelNote("");
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) closeEditor(); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Escape") closeEditor();
        else if ((e.key === "Delete" || e.key === "Backspace") && selNote) { e.preventDefault(); del(selNote); }
      }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          width: "84%",
          height: "82%",
          display: "flex",
          flexDirection: "column",
          background: "var(--panel)",
          borderRadius: 16,
          border: "1px solid var(--layer-3)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--layer-2)" }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: color, boxShadow: `0 0 8px ${color}`, flex: "none" }} />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-1)" }}>{clip.name}</span>
          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-faint)" }}>
            PIANO ROLL · click to add · drag to move · edge to resize · Del to remove
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={closeEditor}
            title="Close (Esc)"
            style={{ width: 26, height: 26, borderRadius: 7, background: "var(--layer-2)", border: "1px solid var(--layer-5)", color: "var(--text-3)", cursor: "pointer", fontSize: 13, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* body: pitch labels + scrollable grid */}
        <div className="zd-scroll" style={{ flex: 1, overflow: "auto", display: "flex" }}>
          <div style={{ width: 46, flex: "none", borderRight: "1px solid var(--layer-2)" }}>
            {Array.from({ length: rows }, (_, i) => {
              const pitch = PITCH_MAX - i;
              const isC = pitch % 12 === 0;
              return (
                <div
                  key={pitch}
                  style={{
                    height: ROW_H,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    paddingRight: 6,
                    fontSize: 8,
                    fontFamily: "var(--font-mono)",
                    color: isC ? "var(--text-3)" : "var(--text-faint)",
                    background: NAMES[((pitch % 12) + 12) % 12].includes("#") ? "var(--layer-1)" : "transparent",
                    borderBottom: isC ? "1px solid var(--layer-3)" : "1px solid var(--layer-1)",
                    boxSizing: "border-box",
                  }}
                >
                  {isC ? noteName(pitch) : ""}
                </div>
              );
            })}
          </div>

          <div
            ref={gridRef}
            onPointerDown={addAt}
            style={{
              flex: 1,
              position: "relative",
              height: rows * ROW_H,
              cursor: "crosshair",
              touchAction: "none",
              backgroundImage:
                "linear-gradient(var(--layer-1) 1px, transparent 1px), linear-gradient(90deg, var(--layer-2) 1px, transparent 1px)",
              backgroundSize: `100% ${ROW_H}px, calc(100% / ${clipBeats}) 100%`,
            }}
          >
            {notes.map((n) => {
              const sel = n.id === selNote;
              return (
                <div
                  key={n.id}
                  onPointerDown={moveNoteDrag(n)}
                  onContextMenu={(e) => { e.preventDefault(); del(n.id); }}
                  style={{
                    position: "absolute",
                    left: xPct(n.start),
                    width: `calc(${(n.len / clipBeats) * 100}% - 1px)`,
                    top: topPx(n.pitch),
                    height: ROW_H - 1,
                    background: color,
                    border: `1px solid ${hexA(color, 0.7)}`,
                    borderRadius: 3,
                    boxShadow: sel ? `0 0 0 1px #fff, 0 0 10px ${hexA(color, 0.8)}` : `0 0 4px ${hexA(color, 0.5)}`,
                    cursor: "grab",
                    touchAction: "none",
                    boxSizing: "border-box",
                  }}
                >
                  <div
                    onPointerDown={resizeNoteDrag(n)}
                    style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 6, cursor: "ew-resize", touchAction: "none" }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

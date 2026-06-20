import React, { useRef } from "react";

/**
 * Slider — a thin rail with a gradient fill and a round handle. Drag
 * horizontally to set. Label + mono value sit in a row above the rail.
 */
export function Slider({
  value = 0.5,              // 0..1
  onChange,
  label,
  valueLabel,
  gradient = "var(--ramp-cool)",
  style,
  ...rest
}) {
  const railRef = useRef(null);
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const pct = (value * 100).toFixed(1) + "%";

  const onPointerDown = (e) => {
    if (!onChange) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const set = (ev) => onChange(clamp((ev.clientX - rect.left) / rect.width));
    set(e);
    const move = (ev) => set(ev);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div style={style} {...rest}>
      {(label || valueLabel) && (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--fs-label-sm)", marginBottom: 8 }}>
          <span style={{ color: "var(--text-label)", letterSpacing: "0.08em", fontFamily: "var(--font-display)" }}>{label}</span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{valueLabel}</span>
        </div>
      )}
      <div
        ref={railRef}
        onPointerDown={onPointerDown}
        style={{ position: "relative", height: 18, display: "flex", alignItems: "center", cursor: onChange ? "ew-resize" : "default", touchAction: "none" }}
      >
        <div style={{ position: "absolute", left: 0, right: 0, height: "var(--slider-track)", borderRadius: 2, background: "var(--track)" }} />
        <div style={{ position: "absolute", left: 0, height: "var(--slider-track)", width: pct, borderRadius: 2, background: gradient }} />
        <div
          style={{
            position: "absolute",
            left: pct,
            width: "var(--slider-handle)",
            height: "var(--slider-handle)",
            borderRadius: "50%",
            background: "var(--text-1)",
            boxShadow: "var(--shadow-handle)",
            transform: "translateX(-50%)",
          }}
        />
      </div>
    </div>
  );
}

import React, { useRef } from "react";

/**
 * Knob — the hero control. A 270° masked-donut spectrum ring tracks the
 * value, a recessed face carries a white indicator, and the center shows
 * a large numeric readout. Drag vertically to set (ns-resize).
 */
export function Knob({
  value = 0.5,            // 0..1
  onChange,
  size = 172,
  label = "AMOUNT",
  format = (v) => Math.round(v * 100),
  unit = "%",
  sensitivity = 220,      // px of drag for full travel
  style,
  ...rest
}) {
  const startRef = useRef(null);

  const clamp = (x) => Math.min(1, Math.max(0, x));
  const onPointerDown = (e) => {
    if (!onChange) return;
    e.preventDefault();
    startRef.current = { y: e.clientY, v: value };
    const move = (ev) =>
      onChange(clamp(startRef.current.v + (startRef.current.y - ev.clientY) / sensitivity));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const ringDeg = (value * 270).toFixed(1) + "deg";
  const knobDeg = (-135 + value * 270).toFixed(1) + "deg";
  const mask =
    "radial-gradient(circle, transparent 66px, #000 67px, #000 78px, transparent 79px)";
  const scale = size / 172;
  const inner = Math.round(24 * scale);

  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: "relative",
        width: size,
        height: size,
        cursor: onChange ? "ns-resize" : "default",
        touchAction: "none",
        ...style,
      }}
      {...rest}
    >
      {/* track */}
      <div
        style={{
          position: "absolute",
          inset: 6,
          borderRadius: "50%",
          background:
            "conic-gradient(from 225deg, var(--layer-3) 0deg, var(--layer-3) 270deg, transparent 270deg)",
          WebkitMask: mask,
          mask,
          transform: scale !== 1 ? `scale(${scale})` : undefined,
        }}
      />
      {/* spectrum sweep */}
      <div
        style={{
          position: "absolute",
          inset: 6,
          borderRadius: "50%",
          background: `conic-gradient(from 225deg, var(--spectrum-cyan), var(--spectrum-violet), var(--spectrum-pink), var(--spectrum-amber) ${ringDeg}, transparent ${ringDeg})`,
          WebkitMask: mask,
          mask,
          filter: "var(--glow-ring)",
          transform: scale !== 1 ? `scale(${scale})` : undefined,
        }}
      />
      {/* face */}
      <div
        style={{
          position: "absolute",
          inset: inner,
          borderRadius: "50%",
          background: "var(--knob-face)",
          border: "var(--border-line)",
          boxShadow: "var(--shadow-knob)",
        }}
      />
      {/* indicator */}
      <div style={{ position: "absolute", inset: inner, transform: `rotate(${knobDeg})` }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 12,
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: "#fff",
            transform: "translateX(-50%)",
            boxShadow: "var(--indicator-glow)",
          }}
        />
      </div>
      {/* readout */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          fontFamily: "var(--font-display)",
        }}
      >
        <div
          style={{
            fontSize: Math.round(38 * scale),
            fontWeight: "var(--fw-semibold)",
            letterSpacing: "var(--tracking-display)",
            lineHeight: 1,
            color: "var(--text-1)",
          }}
        >
          {format(value)}
          <span style={{ fontSize: Math.round(16 * scale), color: "var(--text-3)" }}>{unit}</span>
        </div>
        {label && (
          <div
            style={{
              fontSize: Math.round(10 * scale),
              letterSpacing: "var(--tracking-wide)",
              color: "var(--text-muted)",
              marginTop: 4,
            }}
          >
            {label}
          </div>
        )}
      </div>
    </div>
  );
}

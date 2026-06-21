import { useRef } from "react";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface KnobProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** 0..1 */
  value?: number;
  onChange?: (v: number) => void;
  /** Outer diameter in px (geometry scales from 172). */
  size?: number;
  label?: ReactNode;
  format?: (v: number) => ReactNode;
  unit?: ReactNode;
  /** px of drag for full 0..1 travel. */
  sensitivity?: number;
}

/**
 * Knob — the hero control. A 270° masked-donut spectrum ring tracks the
 * value, a recessed face carries a white indicator, and the center shows a
 * large numeric readout. Drag vertically to set (ns-resize).
 */
export function Knob({
  value = 0.5,
  onChange,
  size = 172,
  label = "AMOUNT",
  format = (v) => Math.round(v * 100),
  unit = "%",
  sensitivity = 220,
  style,
  ...rest
}: Readonly<KnobProps>) {
  const startRef = useRef<{ y: number; v: number } | null>(null);
  const clamp = (x: number) => Math.min(1, Math.max(0, x));

  const onPointerDown = (e: React.PointerEvent) => {
    if (!onChange) return;
    e.preventDefault();
    startRef.current = { y: e.clientY, v: value };
    const move = (ev: PointerEvent) =>
      onChange(clamp(startRef.current!.v + (startRef.current!.y - ev.clientY) / sensitivity));
    const up = () => {
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", up);
    };
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", up);
  };

  const ringDeg = (value * 270).toFixed(1) + "deg";
  const knobDeg = (-135 + value * 270).toFixed(1) + "deg";
  const mask = "radial-gradient(circle, transparent 66px, #000 67px, #000 78px, transparent 79px)";
  const scale = size / 172;
  const inner = Math.round(24 * scale);

  const ringStyle: CSSProperties = {
    position: "absolute",
    inset: 6,
    borderRadius: "50%",
    WebkitMaskImage: mask,
    maskImage: mask,
    transform: scale === 1 ? undefined : `scale(${scale})`,
  };

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
          ...ringStyle,
          background:
            "conic-gradient(from 225deg, var(--layer-3) 0deg, var(--layer-3) 270deg, transparent 270deg)",
        }}
      />
      {/* spectrum sweep */}
      <div
        style={{
          ...ringStyle,
          background: `conic-gradient(from 225deg, var(--spectrum-cyan), var(--spectrum-violet), var(--spectrum-pink), var(--spectrum-amber) ${ringDeg}, transparent ${ringDeg})`,
          filter: "var(--glow-ring)",
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
            fontWeight: 600,
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

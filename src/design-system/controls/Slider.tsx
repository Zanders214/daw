import type { HTMLAttributes, ReactNode } from "react";

export interface SliderProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** 0..1 */
  value?: number;
  onChange?: (v: number) => void;
  label?: ReactNode;
  valueLabel?: ReactNode;
  gradient?: string;
}

/**
 * Slider — a thin rail with a gradient fill and a round handle. Drag
 * horizontally to set. Optional label + mono value sit in a row above.
 */
export function Slider({
  value = 0.5,
  onChange,
  label,
  valueLabel,
  gradient = "var(--ramp-cool)",
  style,
  ...rest
}: Readonly<SliderProps>) {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const pct = (value * 100).toFixed(1) + "%";

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onChange) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const set = (clientX: number) => onChange(clamp((clientX - rect.left) / rect.width));
    set(e.clientX);
    const move = (ev: PointerEvent) => set(ev.clientX);
    const up = () => {
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", up);
    };
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", up);
  };

  return (
    <div style={style} {...rest}>
      {(label || valueLabel) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "var(--fs-label-sm)",
            marginBottom: 8,
          }}
        >
          <span
            style={{
              color: "var(--text-label)",
              letterSpacing: "0.08em",
              fontFamily: "var(--font-display)",
            }}
          >
            {label}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{valueLabel}</span>
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        style={{
          position: "relative",
          height: 18,
          display: "flex",
          alignItems: "center",
          cursor: onChange ? "ew-resize" : "default",
          touchAction: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: "var(--slider-track)",
            borderRadius: 2,
            background: "var(--track)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            height: "var(--slider-track)",
            width: pct,
            borderRadius: 2,
            background: gradient,
          }}
        />
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

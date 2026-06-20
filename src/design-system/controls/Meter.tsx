import type { HTMLAttributes } from "react";

export interface MeterProps extends HTMLAttributes<HTMLDivElement> {
  /** 0..1 */
  value?: number;
  height?: number;
  gradient?: string;
  glow?: boolean;
}

/**
 * Meter — a thin progress bar carrying the full spectrum ramp with a warm
 * glow halo. Read-only level indicator (output, energy, track level).
 */
export function Meter({
  value = 0.5,
  height = 6,
  gradient = "var(--spectrum-ramp)",
  glow = true,
  style,
  ...rest
}: MeterProps) {
  return (
    <div
      style={{
        position: "relative",
        height,
        borderRadius: height / 2,
        background: "var(--track)",
        overflow: "hidden",
        ...style,
      }}
      {...rest}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: (Math.min(1, Math.max(0, value)) * 100).toFixed(1) + "%",
          borderRadius: height / 2,
          background: gradient,
          boxShadow: glow ? "var(--glow-meter)" : "none",
        }}
      />
    </div>
  );
}

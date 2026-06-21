import type { HTMLAttributes, ReactNode } from "react";

export interface ChipProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
  color?: string;
  active?: boolean;
  /** Dot glow opacity 0..1. */
  glow?: number;
}

/**
 * Chip — a small status tile: a glowing color dot + a label and a mono value
 * beneath it. Used in rows to show effect bands. Dims to 0.4 when inactive.
 */
export function Chip({
  label,
  value,
  color = "var(--spectrum-cyan)",
  active = true,
  glow = 1,
  style,
  ...rest
}: Readonly<ChipProps>) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: 9,
        borderRadius: "var(--radius-button)",
        background: "var(--layer-1)",
        opacity: active ? 1 : 0.4,
        transition: "opacity var(--dur-base) var(--ease)",
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "var(--radius-full)",
          background: color,
          boxShadow: `0 0 7px ${color}`,
          opacity: glow,
          flex: "none",
        }}
      />
      <div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-label-sm)",
            fontWeight: 600,
            color: "var(--text-2)",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-tick)",
            color: "var(--text-label)",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

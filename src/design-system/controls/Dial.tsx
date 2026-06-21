import { useRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";

export interface DialProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** 0..1 */
  value?: number;
  onChange?: (v: number) => void;
  color?: string;
  label?: ReactNode;
  /** Diameter in px. */
  size?: number;
  format?: (v: number) => ReactNode;
  sensitivity?: number;
}

/**
 * Dial — compact arc control. A 270° SVG arc (rotated 135°) in a single
 * spectrum color over a faint track, with a filled core that scales with the
 * value. Drag vertically to set. Label + mono value sit beneath.
 */
export function Dial({
  value = 0.5,
  onChange,
  color = "var(--spectrum-violet)",
  label = "MAIN",
  size = 78,
  format = (v) => Math.round(v * 100) + "%",
  sensitivity = 200,
  style,
  ...rest
}: Readonly<DialProps>) {
  const startRef = useRef<{ y: number; v: number } | null>(null);
  const R = 28;
  const ARC = 2 * Math.PI * R * 0.75; // 270deg
  const FULL = 2 * Math.PI * R;
  const clamp = (x: number) => Math.min(1, Math.max(0, x));

  const onPointerDown = (e: React.PointerEvent) => {
    if (!onChange) return;
    e.preventDefault();
    startRef.current = { y: e.clientY, v: value };
    const move = (ev: PointerEvent) =>
      onChange(
        clamp(startRef.current!.v + (startRef.current!.y - ev.clientY) * (1 / sensitivity) * 40),
      );
    const up = () => {
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", up);
    };
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", up);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-5)",
        ...style,
      }}
      {...rest}
    >
      <div
        onPointerDown={onPointerDown}
        style={{
          width: size,
          height: size,
          cursor: onChange ? "ns-resize" : "default",
          touchAction: "none",
        }}
      >
        <svg
          viewBox="0 0 80 80"
          style={{ width: "100%", height: "100%", overflow: "visible", transform: "rotate(135deg)" }}
        >
          <circle
            cx="40"
            cy="40"
            r={R}
            fill="rgba(8,11,18,0.6)"
            stroke="var(--layer-5)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${ARC.toFixed(2)} ${FULL.toFixed(2)}`}
          />
          <circle
            cx="40"
            cy="40"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(value * ARC).toFixed(2)} ${FULL.toFixed(2)}`}
            style={{ filter: `drop-shadow(0 0 ${(3 + value * 6).toFixed(1)}px ${color})` }}
          />
          <circle
            cx="40"
            cy="40"
            r={Number((4 + value * 5).toFixed(2))}
            fill={color}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
      </div>
      {label && (
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--fs-label-sm)",
              fontWeight: 600,
              letterSpacing: "var(--tracking-data)",
              color: "var(--text-2)",
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-label-sm)",
              color,
              marginTop: 2,
            }}
          >
            {format(value)}
          </div>
        </div>
      )}
    </div>
  );
}

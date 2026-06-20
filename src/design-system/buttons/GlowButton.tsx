import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface GlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
  engaged?: boolean;
  variant?: "accent" | "danger";
  /** Alternate caption shown while idle (children show while engaged). */
  idleLabel?: ReactNode;
}

/**
 * GlowButton — the kit's primary toggle. A wide pill with a small square
 * status dot and an outer color glow when engaged. Idle is a flat
 * white-alpha fill; engaged fills with a color gradient and lights up.
 */
export function GlowButton({
  children,
  engaged = false,
  variant = "accent",
  idleLabel,
  style,
  ...rest
}: GlowButtonProps) {
  const palette =
    variant === "danger"
      ? {
          grad: "linear-gradient(180deg,#ff5a5a,#e23b3b)",
          border: "rgba(255,120,120,0.6)",
          glow: "rgba(255,80,80,0.5)",
          idleGlow: "rgba(255,80,80,0.8)",
        }
      : {
          grad: "var(--accent-grad)",
          border: "rgba(150,170,255,0.6)",
          glow: "var(--accent-glow)",
          idleGlow: "rgba(94,147,255,0.8)",
        };

  const s = engaged
    ? {
        background: palette.grad,
        color: "#fff",
        border: `1px solid ${palette.border}`,
        boxShadow: `0 0 22px ${palette.glow}, inset 0 1px 0 rgba(255,255,255,0.3)`,
        dotBg: "#fff",
        dotGlow: "#fff",
      }
    : {
        background: "var(--layer-2)",
        color: "var(--text-1)",
        border: "1px solid var(--layer-5)",
        boxShadow: "var(--inset-top)",
        dotBg: "var(--text-1)",
        dotGlow: palette.idleGlow,
      };

  return (
    <button
      type="button"
      style={{
        height: "var(--button-h)",
        width: "100%",
        borderRadius: "var(--radius-button-lg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-4)",
        cursor: "pointer",
        userSelect: "none",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        letterSpacing: "var(--tracking-cap)",
        fontSize: "14px",
        transition: "all var(--dur-base) var(--ease)",
        background: s.background,
        color: s.color,
        border: s.border,
        boxShadow: s.boxShadow,
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: 2,
          background: s.dotBg,
          boxShadow: `0 0 8px ${s.dotGlow}`,
        }}
      />
      {engaged ? children : idleLabel || children}
    </button>
  );
}

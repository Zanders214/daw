import type { HTMLAttributes, ReactNode } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
}

/**
 * Badge — a tiny all-caps pill in the blue accent, used for the product mode
 * label (VST3, BUILD-UP, WIND-DOWN) in a panel header.
 */
export function Badge({ children, style, ...rest }: BadgeProps) {
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "var(--fs-label-sm)",
        fontWeight: 600,
        letterSpacing: "var(--tracking-label)",
        color: "var(--accent)",
        background: "var(--accent-soft)",
        borderRadius: "var(--radius-pill)",
        padding: "4px 11px",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}

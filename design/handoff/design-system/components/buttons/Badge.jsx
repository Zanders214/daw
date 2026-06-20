import React from "react";

/**
 * Badge — a tiny all-caps pill in the blue accent. Used for the
 * product mode label (BUILD-UP, WIND-DOWN, GRAND) in the panel header.
 */
export function Badge({ children, style, ...rest }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-display)",
        fontSize: "var(--fs-label-sm)",
        fontWeight: "var(--fw-semibold)",
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

import React from "react";

/**
 * Panel — the dark-glass shell every product lives in. A radial well with
 * a hairline border and a deep outer drop shadow. Holds the whole plugin
 * face; pads at 26px by default.
 */
export function Panel({ children, width, pad = 26, radius = 16, style, ...rest }) {
  return (
    <div
      style={{
        width,
        borderRadius: radius,
        padding: pad,
        background: "var(--panel)",
        border: "var(--border-hairline)",
        boxShadow: "var(--shadow-panel)",
        color: "var(--text-1)",
        fontFamily: "var(--font-display)",
        boxSizing: "border-box",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

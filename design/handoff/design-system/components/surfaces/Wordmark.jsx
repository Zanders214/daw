import React from "react";

/**
 * Wordmark — the house brand "Zanders" in primary text set tight against
 * the product name, which takes one spectrum color and NO space between.
 */
export function Wordmark({
  product = "PreDrop",
  color = "var(--spectrum-pink)",
  size = 17,
  style,
  ...rest
}) {
  return (
    <div
      style={{
        fontFamily: "var(--font-display)",
        fontSize: size,
        fontWeight: "var(--fw-semibold)",
        letterSpacing: "var(--tracking-title)",
        color: "var(--text-1)",
        ...style,
      }}
      {...rest}
    >
      Zanders<span style={{ color }}>{product}</span>
    </div>
  );
}

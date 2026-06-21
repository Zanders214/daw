import type { HTMLAttributes, ReactNode } from "react";

export interface WordmarkProps extends HTMLAttributes<HTMLDivElement> {
  /** Product name appended after "Zanders" (takes the accent color). */
  product?: ReactNode;
  color?: string;
  size?: number;
}

/**
 * Wordmark — the house brand "Zanders" in primary text set tight against the
 * product name, which takes one spectrum color and NO space between.
 */
export function Wordmark({
  product = "PreDrop",
  color = "var(--spectrum-pink)",
  size = 17,
  style,
  ...rest
}: Readonly<WordmarkProps>) {
  return (
    <div
      style={{
        fontFamily: "var(--font-display)",
        fontSize: size,
        fontWeight: 600,
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

import type { HTMLAttributes, ReactNode } from "react";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  width?: number | string;
  pad?: number;
  radius?: number;
}

/**
 * Panel — the dark-glass shell every product lives in. A radial well with a
 * hairline border and a deep outer drop shadow.
 */
export function Panel({ children, width, pad = 26, radius = 16, style, ...rest }: PanelProps) {
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

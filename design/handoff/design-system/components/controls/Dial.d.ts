import * as React from "react";

/** Compact 270° arc dial in a single spectrum color, with filled core + label/value beneath. */
export interface DialProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0..1. */
  value?: number;
  /** Called with the new 0..1 value while dragging. Omit for static. */
  onChange?: (v: number) => void;
  /** Arc + core color (usually a spectrum stop). */
  color?: string;
  /** Caption beneath, e.g. "MAIN". */
  label?: React.ReactNode;
  /** Diameter in px. */
  size?: number;
  /** Maps 0..1 -> the mono value string. */
  format?: (v: number) => React.ReactNode;
  sensitivity?: number;
}
export function Dial(props: DialProps): JSX.Element;

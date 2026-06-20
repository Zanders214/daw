import * as React from "react";

/** Read-only thin progress bar carrying the full spectrum ramp with a warm glow. */
export interface MeterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0..1. */
  value?: number;
  /** Bar height in px. */
  height?: number;
  /** Fill gradient (defaults to the full spectrum ramp). */
  gradient?: string;
  /** Toggle the warm glow halo. */
  glow?: boolean;
}
export function Meter(props: MeterProps): JSX.Element;

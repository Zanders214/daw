import * as React from "react";

/** Thin rail slider: gradient fill + round handle, with optional label/value row above. Drag horizontally. */
export interface SliderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0..1. */
  value?: number;
  /** Called with the new 0..1 value while dragging. Omit for static. */
  onChange?: (v: number) => void;
  /** Uppercase label at left of the header row. */
  label?: React.ReactNode;
  /** Mono value at right of the header row. */
  valueLabel?: React.ReactNode;
  /** Fill gradient — var(--ramp-cool) for normal params, var(--ramp-warm) for character/noise. */
  gradient?: string;
}
export function Slider(props: SliderProps): JSX.Element;

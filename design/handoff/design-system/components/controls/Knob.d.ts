import * as React from "react";

/**
 * The hero control: a 270° spectrum sweep ring + recessed face with white indicator + center readout. Drag vertically.
 * @startingPoint section="Controls" subtitle="Hero knob with spectrum sweep ring" viewport="220x220"
 */
export interface KnobProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0..1. */
  value?: number;
  /** Called with the new 0..1 value while dragging. Omit for a static display. */
  onChange?: (v: number) => void;
  /** Outer diameter in px (geometry scales from 172). */
  size?: number;
  /** Caption under the readout, e.g. "AMOUNT". */
  label?: React.ReactNode;
  /** Maps 0..1 -> the big number shown in the center. */
  format?: (v: number) => React.ReactNode;
  /** Unit suffix after the number, e.g. "%". */
  unit?: React.ReactNode;
  /** Pixels of vertical drag for full 0..1 travel. */
  sensitivity?: number;
}
export function Knob(props: KnobProps): JSX.Element;

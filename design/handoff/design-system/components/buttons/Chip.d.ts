import * as React from "react";

/** A small status tile: glowing color dot + label + mono value. Dims when inactive. */
export interface ChipProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Short uppercase label, e.g. "HPF". */
  label: React.ReactNode;
  /** Mono readout, e.g. "240 Hz". */
  value: React.ReactNode;
  /** Dot color — usually a spectrum stop. */
  color?: string;
  /** When false, the whole chip dims to 0.4. */
  active?: boolean;
  /** 0..1 dot glow intensity. */
  glow?: number;
}
export function Chip(props: ChipProps): JSX.Element;

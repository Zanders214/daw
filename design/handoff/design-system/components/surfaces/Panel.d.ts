import * as React from "react";

/**
 * The dark-glass shell every product lives in: radial well, hairline border, deep outer drop.
 * @startingPoint section="Surfaces" subtitle="Dark-glass product panel" viewport="360x300"
 */
export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  /** Fixed width, e.g. 360 or "100%". */
  width?: number | string;
  /** Inner padding in px (default 26). */
  pad?: number;
  /** Corner radius in px (default 16). */
  radius?: number;
}
export function Panel(props: PanelProps): JSX.Element;

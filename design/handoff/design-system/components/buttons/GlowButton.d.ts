import * as React from "react";

/**
 * The kit's primary toggle button: wide pill, square status dot, color glow when engaged.
 * @startingPoint section="Buttons" subtitle="Glow toggle button" viewport="320x80"
 */
export interface GlowButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Content shown when engaged (and when idle unless idleLabel is set). */
  children?: React.ReactNode;
  /** Engaged = filled gradient + outer glow. Idle = flat white-alpha fill. */
  engaged?: boolean;
  /** Color identity of the engaged state. */
  variant?: "accent" | "danger";
  /** Optional alternate label shown only in the idle state (e.g. "STOP" -> "STOPPING"). */
  idleLabel?: React.ReactNode;
}
export function GlowButton(props: GlowButtonProps): JSX.Element;

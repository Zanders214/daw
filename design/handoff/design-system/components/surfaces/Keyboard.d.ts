import * as React from "react";

/** A playable octave-tiling keyboard; keys glow + depress on press and report note indices. */
export interface KeyboardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of white keys (>= 7). */
  whites?: number;
  whiteFill?: string;
  whitePress?: string;
  blackFill?: string;
  blackPress?: string;
  /** Glow color shown while a key is held. */
  accent?: string;
  keyBorder?: string;
  /** Called with the note index when a key goes down. */
  onPress?: (idx: number) => void;
  /** Called with the note index when a key is released. */
  onRelease?: (idx: number) => void;
}
export function Keyboard(props: KeyboardProps): JSX.Element;

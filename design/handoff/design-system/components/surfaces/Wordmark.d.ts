import * as React from "react";

/** House brand "Zanders" set tight against a spectrum-colored product name (no space). */
export interface WordmarkProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Product name appended after "Zanders", e.g. "PreDrop". */
  product?: React.ReactNode;
  /** Color of the product name — one spectrum stop per product. */
  color?: string;
  /** Font size in px. */
  size?: number;
}
export function Wordmark(props: WordmarkProps): JSX.Element;

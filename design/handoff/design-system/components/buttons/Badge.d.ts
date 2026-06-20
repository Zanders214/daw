import * as React from "react";

/** A tiny all-caps accent pill for product mode labels. */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children?: React.ReactNode;
}
export function Badge(props: BadgeProps): JSX.Element;

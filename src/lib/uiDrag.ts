/**
 * Lightweight pointer-drag for UI layout resizing (panel dividers, track-height
 * grips). Mirrors timeline.startDrag's global-listener idiom, but deliberately
 * does NOT open an undo-history transaction — resizing the workspace is not a
 * musical edit and shouldn't land in the same undo stack as notes/clips.
 *
 * The given `cursor` is pinned to the whole document for the gesture (and
 * text selection suppressed) so the resize cursor doesn't flicker as the
 * pointer crosses other elements, then both are restored on pointerup.
 */
export function startUiResize(
  onMove: (ev: PointerEvent) => void,
  cursor = "default",
  onEnd?: () => void,
): void {
  const prevCursor = document.body.style.cursor;
  const prevSelect = document.body.style.userSelect;
  document.body.style.cursor = cursor;
  document.body.style.userSelect = "none";
  const up = () => {
    globalThis.removeEventListener("pointermove", onMove);
    globalThis.removeEventListener("pointerup", up);
    document.body.style.cursor = prevCursor;
    document.body.style.userSelect = prevSelect;
    onEnd?.();
  };
  globalThis.addEventListener("pointermove", onMove);
  globalThis.addEventListener("pointerup", up);
}

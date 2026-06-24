import { useEffect } from "react";
import { undo, redo } from "../lib/history";

/** True for elements that own their own text editing (so we don't hijack typing). */
function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

/**
 * Global keyboard shortcuts. Currently: undo / redo.
 *  - Cmd/Ctrl+Z       → undo
 *  - Cmd/Ctrl+Shift+Z → redo
 *  - Ctrl+Y           → redo (Windows idiom)
 * Skipped while focus is in a text field so renames/tempo entry keep their own
 * editing. Mount once (from App).
 */
export function useGlobalKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      const isUndo = k === "z" && !e.shiftKey;
      const isRedo = (k === "z" && e.shiftKey) || k === "y";
      if (!isUndo && !isRedo) return;
      if (isEditable(e.target)) return;
      e.preventDefault();
      if (isRedo) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

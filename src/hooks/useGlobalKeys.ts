import { useEffect } from "react";
import { undo, redo } from "../lib/history";
import { useDawStore } from "../store/useDawStore";

/** True for elements that own their own text editing (so we don't hijack typing). */
function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

/**
 * True for the focused controls that already consume Space themselves — text
 * fields, native buttons/selects, and ARIA button/switch/checkbox widgets (the
 * track headers, mixer switches, transport buttons…). When one of these has
 * focus we leave Space to it instead of also toggling transport, so a single
 * press never both activates the control and starts playback.
 */
function ownsSpace(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (isEditable(el) || el.tagName === "BUTTON" || el.tagName === "SELECT") return true;
  const role = el.getAttribute("role");
  return role === "button" || role === "switch" || role === "checkbox";
}

/**
 * Global keyboard shortcuts. Mount once (from App).
 *  - Space             → play / pause (the universal transport shortcut)
 *  - Cmd/Ctrl+Z        → undo
 *  - Cmd/Ctrl+Shift+Z  → redo
 *  - Ctrl+Y            → redo (Windows idiom)
 * Space is skipped while a text field or an interactive control owns it (so
 * typing a space, or activating a focused button/switch, still works); undo/redo
 * are skipped while focus is in a text field.
 */
export function useGlobalKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Spacebar → play/pause. Bare Space only (modified combos are left alone),
      // and not when a focused control already handles Space.
      if ((e.key === " " || e.code === "Space") && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (ownsSpace(e.target)) return;
        e.preventDefault(); // stop the page from scrolling on Space
        useDawStore.getState().togglePlay();
        return;
      }

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
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, []);
}

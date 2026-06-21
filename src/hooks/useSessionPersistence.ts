import { useEffect } from "react";
import { applyPrefs, applySession } from "../lib/session";
import { sessionBackend, AUTOSAVE_NAME } from "../lib/sessionStore";
import { startAutosave } from "../lib/autosave";

/**
 * Session + global-prefs persistence, active in BOTH shells (native files when
 * hosted, localStorage in the browser). On mount: load prefs, restore the last
 * working session (the rolling autosave), then start autosaving. Runs once.
 */
export function useSessionPersistence() {
  useEffect(() => {
    let stopAutosave: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const prefs = await sessionBackend.loadPrefs();
      if (cancelled) return;
      if (prefs) applyPrefs(prefs);

      // Restore the last working state unless autosave was turned off.
      if (prefs?.autoSave !== false) {
        const last = await sessionBackend.load(AUTOSAVE_NAME);
        if (cancelled) return;
        if (last) applySession(last);
      }

      if (!cancelled) stopAutosave = startAutosave();
    })();

    return () => {
      cancelled = true;
      stopAutosave?.();
    };
  }, []);
}

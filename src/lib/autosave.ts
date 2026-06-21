/**
 * Rolling autosave. Whenever the musical state changes (and autoSave is on),
 * debounce-write it to the reserved __autosave__ session so the exact working
 * state is restored on next launch. Global prefs always persist (they're tiny,
 * and this is how the autoSave toggle itself sticks).
 *
 * Baselines are seeded from the current state, so a quiet session never
 * overwrites an existing autosave on startup. Call after restore completes.
 */
import { useDawStore, type DawState } from "../store/useDawStore";
import { serializeSession, serializePrefs, SESSION_VERSION } from "./session";
import { sessionBackend, AUTOSAVE_NAME } from "./sessionStore";

const DEBOUNCE_MS = 800;

export function startAutosave(): () => void {
  let sessionTimer: ReturnType<typeof setTimeout> | undefined;
  let prefsTimer: ReturnType<typeof setTimeout> | undefined;

  const snapPrefs = (s: DawState) => JSON.stringify(serializePrefs(s));
  // Change-detection also watches node-rack contents (engine-owned, persisted by
  // the host) so adding/bypassing a node device triggers a save even when no UI
  // field changed; the saved `ui` payload is still just serializeSession.
  const detect = (s: DawState) => JSON.stringify(serializeSession(s)) + "|" + JSON.stringify(s.nodeRacks);

  let lastSession = detect(useDawStore.getState());
  let lastPrefs = snapPrefs(useDawStore.getState());

  const unsub = useDawStore.subscribe((s) => {
    // Prefs always persist (also how turning autoSave OFF is remembered).
    const pr = snapPrefs(s);
    if (pr !== lastPrefs) {
      lastPrefs = pr;
      clearTimeout(prefsTimer);
      prefsTimer = setTimeout(() => sessionBackend.savePrefs(JSON.parse(pr)), DEBOUNCE_MS);
    }

    // Musical autosave is gated by the toggle.
    if (!s.autoSave) return;
    const det = detect(s);
    if (det !== lastSession) {
      lastSession = det;
      clearTimeout(sessionTimer);
      sessionTimer = setTimeout(() => {
        const st = useDawStore.getState();
        sessionBackend.save(AUTOSAVE_NAME, {
          version: SESSION_VERSION,
          name: st.currentSessionName ?? "Autosave",
          ui: serializeSession(st),
        });
      }, DEBOUNCE_MS);
    }
  });

  return () => {
    unsub();
    clearTimeout(sessionTimer);
    clearTimeout(prefsTimer);
  };
}

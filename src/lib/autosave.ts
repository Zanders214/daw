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

  const snapSession = (s: DawState) => JSON.stringify(serializeSession(s));
  const snapPrefs = (s: DawState) => JSON.stringify(serializePrefs(s));

  let lastSession = snapSession(useDawStore.getState());
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
    const sess = snapSession(s);
    if (sess !== lastSession) {
      lastSession = sess;
      clearTimeout(sessionTimer);
      sessionTimer = setTimeout(() => {
        sessionBackend.save(AUTOSAVE_NAME, {
          version: SESSION_VERSION,
          name: useDawStore.getState().currentSessionName ?? "Autosave",
          ui: JSON.parse(sess),
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

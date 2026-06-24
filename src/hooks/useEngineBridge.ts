import { useEffect } from "react";
import { useDawStore } from "../store/useDawStore";
import { engineActive, subscribeEngine } from "../lib/engine";
import { applySessionToEngine } from "../lib/engineSync";
import { applySession, SESSION_VERSION, type SessionUi } from "../lib/session";

/**
 * When running inside the JUCE host, subscribe to engine state events (which
 * drive the playhead / meters / tape reel) and push the current UI state to
 * the freshly-connected engine. Also applies sessions imported via the native
 * file dialog (delivered as an engineSessionImported event). No-op in a plain
 * browser. Session/prefs persistence (which works in both shells) lives in
 * useSessionPersistence.
 */
export function useEngineBridge() {
  useEffect(() => {
    if (!engineActive()) return;

    const unsub = subscribeEngine({
      onState: (s) => useDawStore.getState().setEngineState(s),
      onTracks: (t) => useDawStore.getState().setEngineTracks(t),
      onNodeRacks: (r) => useDawStore.getState().setNodeRacks(r),
      onSessionImported: (p) => {
        applySession({ version: SESSION_VERSION, name: p.name ?? "Imported", ui: p.ui as SessionUi });
        useDawStore.getState().setCurrentSessionName(p.name ?? null);
      },
      onClipImported: (p) => useDawStore.getState().addImportedClip(p),
    });

    // Sync current UI state down to the freshly-connected engine.
    applySessionToEngine(useDawStore.getState());
    useDawStore.getState().refreshDevices();

    return unsub;
  }, []);
}

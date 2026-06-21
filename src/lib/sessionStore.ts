/**
 * sessionStore — the storage backend for sessions + prefs, abstracted so the UI
 * doesn't care where bytes live.
 *
 *  - Hosted (native app): bridge commands → JSON files in the app-data dir.
 *    Reliable across restarts; required for plugin-state blobs and the native
 *    Export/Import file dialogs.
 *  - Plain browser (dev shell): localStorage, so in-app named sessions are
 *    testable without building the host. Native Export/Import are unavailable
 *    (`canUseFiles` is false) and the UI hides them.
 */
import { engine, engineActive } from "./engine";
import {
  SESSION_VERSION,
  serializeSession,
  type PrefsData,
  type SessionData,
  type SessionUi,
} from "./session";
import { useDawStore } from "../store/useDawStore";

/** Reserved name for the rolling autosave (hidden from the session list). */
export const AUTOSAVE_NAME = "__autosave__";

export interface SessionListItem {
  name: string;
  savedAt?: string;
}

export interface SessionBackend {
  /** True when native file dialogs (Export/Import) are available. */
  readonly canUseFiles: boolean;
  save(name: string, data: SessionData): Promise<boolean>;
  load(name: string): Promise<SessionData | null>;
  list(): Promise<SessionListItem[]>;
  remove(name: string): Promise<boolean>;
  /** Native "Save As" to a .zdaw file (hosted only). */
  exportFile(name: string): Promise<void>;
  /** Native "Open" of a .zdaw file (hosted only; result arrives via event). */
  importFile(): Promise<void>;
  savePrefs(p: PrefsData): Promise<void>;
  loadPrefs(): Promise<PrefsData | null>;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

// ---- hosted backend (native files via the bridge) ----
const hostedBackend: SessionBackend = {
  canUseFiles: true,
  async save(name, data) {
    // The web sends only the `ui` payload; C++ wraps it with version/savedAt and
    // captures the engine plugin-state blobs.
    const r = await engine.session.save(name, data.ui);
    return !!(isObject(r) ? r.ok : true);
  },
  async load(name) {
    const ui = await engine.session.load(name);
    if (!isObject(ui)) return null; // empty var → not found
    return { version: SESSION_VERSION, name, ui: ui as unknown as SessionUi };
  },
  async list() {
    const r = await engine.session.list();
    return Array.isArray(r) ? (r as SessionListItem[]) : [];
  },
  async remove(name) {
    const r = await engine.session.remove(name);
    return !!(isObject(r) ? r.ok : true);
  },
  async exportFile(name) {
    await engine.session.export(name, serializeSession(useDawStore.getState()));
  },
  async importFile() {
    await engine.session.import(); // result delivered via "engineSessionImported"
  },
  async savePrefs(p) {
    await engine.session.savePrefs(p);
  },
  async loadPrefs() {
    const p = await engine.session.loadPrefs();
    return isObject(p) ? (p as unknown as PrefsData) : null;
  },
};

// ---- browser backend (localStorage) ----
const SKEY = (name: string) => `zdaw:session:${name}`;
const PKEY = "zdaw:prefs";
const SPREFIX = "zdaw:session:";

const browserBackend: SessionBackend = {
  canUseFiles: false,
  async save(name, data) {
    try {
      localStorage.setItem(
        SKEY(name),
        JSON.stringify({ ...data, name, savedAt: new Date().toISOString() }),
      );
      return true;
    } catch {
      return false;
    }
  },
  async load(name) {
    const raw = localStorage.getItem(SKEY(name));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SessionData;
    } catch {
      return null;
    }
  },
  async list() {
    const out: SessionListItem[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(SPREFIX)) continue;
      const name = key.slice(SPREFIX.length);
      if (name.startsWith("_")) continue; // reserved (e.g. __autosave__)
      let savedAt: string | undefined;
      try {
        savedAt = (JSON.parse(localStorage.getItem(key) ?? "{}") as SessionData).savedAt;
      } catch {
        /* ignore */
      }
      out.push({ name, savedAt });
    }
    return out;
  },
  async remove(name) {
    localStorage.removeItem(SKEY(name));
    return true;
  },
  async exportFile() {
    /* native dialogs unavailable in the browser */
  },
  async importFile() {
    /* native dialogs unavailable in the browser */
  },
  async savePrefs(p) {
    try {
      localStorage.setItem(PKEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  },
  async loadPrefs() {
    const raw = localStorage.getItem(PKEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PrefsData;
    } catch {
      return null;
    }
  },
};

// Resolve the backend lazily on first use: window.__JUCE__ is reliably present
// by the time effects run (post-mount), not necessarily at module-init time.
let resolved: SessionBackend | null = null;
const impl = (): SessionBackend => (resolved ??= engineActive() ? hostedBackend : browserBackend);

export const sessionBackend: SessionBackend = {
  get canUseFiles() {
    return impl().canUseFiles;
  },
  save: (name, data) => impl().save(name, data),
  load: (name) => impl().load(name),
  list: () => impl().list(),
  remove: (name) => impl().remove(name),
  exportFile: (name) => impl().exportFile(name),
  importFile: () => impl().importFile(),
  savePrefs: (p) => impl().savePrefs(p),
  loadPrefs: () => impl().loadPrefs(),
};

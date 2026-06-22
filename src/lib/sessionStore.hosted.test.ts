// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_VERSION, type PrefsData, type SessionData, type SessionUi } from "./session";

// Exercises the HOSTED (native-bridge) backend of sessionStore — selected lazily
// when engineActive() is true. The cleanest, most robust way to force that path
// without a real JUCE host is to mock ./engine so engineActive() returns true and
// engine.session.* are spies, then import sessionStore FRESH (resetModules clears
// the module-level `resolved` backend cache) so it resolves to the hosted impl.

// Hoisted spy bag so the (hoisted) vi.mock factory can reference it.
const h = vi.hoisted(() => ({
  save: vi.fn(),
  load: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  exportFn: vi.fn(),
  importFn: vi.fn(),
  savePrefs: vi.fn(),
  loadPrefs: vi.fn(),
  active: true,
}));

vi.mock("./engine", () => ({
  engineActive: () => h.active,
  engine: {
    session: {
      save: (name: string, ui: unknown) => h.save(name, ui),
      load: (name: string) => h.load(name),
      list: () => h.list(),
      remove: (name: string) => h.remove(name),
      export: (name: string, ui: unknown) => h.exportFn(name, ui),
      import: () => h.importFn(),
      savePrefs: (p: unknown) => h.savePrefs(p),
      loadPrefs: () => h.loadPrefs(),
    },
  },
}));

const makeUi = (over: Partial<SessionUi> = {}): SessionUi =>
  ({ bpm: 120, loop: false, ...over } as unknown as SessionUi);

const makeSession = (name: string, ui: Partial<SessionUi> = {}): SessionData => ({
  version: SESSION_VERSION,
  name,
  ui: makeUi(ui),
});

/** Import a fresh copy of sessionStore so its lazy backend cache re-resolves. */
async function freshBackend() {
  vi.resetModules();
  const mod = await import("./sessionStore");
  return mod.sessionBackend;
}

beforeEach(() => {
  h.active = true;
  for (const key of ["save", "load", "list", "remove", "exportFn", "importFn", "savePrefs", "loadPrefs"] as const) {
    h[key].mockReset();
  }
});

afterEach(() => {
  vi.resetModules();
});

describe("sessionBackend — hosted (native bridge)", () => {
  it("reports canUseFiles === true when the engine is active", async () => {
    const backend = await freshBackend();
    expect(backend.canUseFiles).toBe(true);
  });

  it("save() forwards only the ui payload and maps {ok} → boolean", async () => {
    const backend = await freshBackend();
    h.save.mockResolvedValue({ ok: true });

    const data = makeSession("Song", { bpm: 140 });
    const ok = await backend.save("Song", data);

    expect(ok).toBe(true);
    // The web sends only data.ui (C++ wraps it with version/savedAt).
    expect(h.save).toHaveBeenCalledWith("Song", data.ui);
  });

  it("save() returns false when the bridge result is {ok:false}", async () => {
    const backend = await freshBackend();
    h.save.mockResolvedValue({ ok: false });
    expect(await backend.save("X", makeSession("X"))).toBe(false);
  });

  it("save() defaults to true when the bridge returns a non-object (no ok field)", async () => {
    const backend = await freshBackend();
    h.save.mockResolvedValue(undefined);
    // isObject(undefined) is false → falls back to `true`.
    expect(await backend.save("X", makeSession("X"))).toBe(true);
  });

  it("load() wraps the returned ui object with version + name", async () => {
    const backend = await freshBackend();
    h.load.mockResolvedValue({ bpm: 137 });

    const loaded = await backend.load("Tune");
    expect(h.load).toHaveBeenCalledWith("Tune");
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(SESSION_VERSION);
    expect(loaded!.name).toBe("Tune");
    expect((loaded!.ui as unknown as { bpm: number }).bpm).toBe(137);
  });

  it("load() returns null when the bridge yields a non-object (session absent)", async () => {
    const backend = await freshBackend();
    h.load.mockResolvedValue(undefined);
    expect(await backend.load("missing")).toBeNull();
  });

  it("list() passes through an array result unchanged", async () => {
    const backend = await freshBackend();
    const rows = [{ name: "A", savedAt: "2024-01-01" }, { name: "B" }];
    h.list.mockResolvedValue(rows);

    const items = await backend.list();
    expect(h.list).toHaveBeenCalledTimes(1);
    expect(items).toEqual(rows);
  });

  it("list() returns [] when the bridge yields a non-array", async () => {
    const backend = await freshBackend();
    h.list.mockResolvedValue(null);
    expect(await backend.list()).toEqual([]);
  });

  it("remove() forwards the name and maps {ok} → boolean", async () => {
    const backend = await freshBackend();
    h.remove.mockResolvedValue({ ok: true });

    expect(await backend.remove("Old")).toBe(true);
    expect(h.remove).toHaveBeenCalledWith("Old");
  });

  it("remove() defaults to true when the bridge returns a non-object", async () => {
    const backend = await freshBackend();
    h.remove.mockResolvedValue("done");
    expect(await backend.remove("Old")).toBe(true);
  });

  it("exportFile() forwards the name and a serialized ui snapshot", async () => {
    const backend = await freshBackend();
    h.exportFn.mockResolvedValue(undefined);

    await backend.exportFile("MyExport");
    expect(h.exportFn).toHaveBeenCalledTimes(1);
    const [name, ui] = h.exportFn.mock.calls[0];
    expect(name).toBe("MyExport");
    // serializeSession(useDawStore.getState()) produces an object ui payload.
    expect(ui).toBeTypeOf("object");
    expect(ui).not.toBeNull();
  });

  it("importFile() triggers the native import command (result arrives via event)", async () => {
    const backend = await freshBackend();
    h.importFn.mockResolvedValue(undefined);

    await backend.importFile();
    expect(h.importFn).toHaveBeenCalledTimes(1);
  });

  it("savePrefs() forwards the prefs object to the bridge", async () => {
    const backend = await freshBackend();
    h.savePrefs.mockResolvedValue(undefined);

    const prefs = { theme: "midnight", autoSave: true } as unknown as PrefsData;
    await backend.savePrefs(prefs);
    expect(h.savePrefs).toHaveBeenCalledWith(prefs);
  });

  it("loadPrefs() returns the prefs object when the bridge yields one", async () => {
    const backend = await freshBackend();
    h.loadPrefs.mockResolvedValue({ theme: "noir", bufferSize: 512 });

    const p = await backend.loadPrefs();
    expect(p).toEqual({ theme: "noir", bufferSize: 512 });
  });

  it("loadPrefs() returns null when the bridge yields a non-object", async () => {
    const backend = await freshBackend();
    h.loadPrefs.mockResolvedValue(undefined);
    expect(await backend.loadPrefs()).toBeNull();
  });
});

// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { AUTOSAVE_NAME, sessionBackend } from "./sessionStore";
import { SESSION_VERSION, type PrefsData, type SessionData, type SessionUi } from "./session";

// Build a minimal-but-typed SessionUi. Only the fields the browser backend
// actually round-trips through JSON matter; the rest are placeholders to satisfy
// the type and prove they survive serialization unchanged.
const makeUi = (over: Partial<SessionUi> = {}): SessionUi => ({
  bpm: 124,
  loop: false,
  loopStart: 0,
  loopEnd: 16,
  volumes: {},
  pans: {},
  mutes: {},
  solos: {},
  arms: {},
  masterVolume: 0.8,
  masterPan: 0,
  groupVolumes: {},
  groupPans: {},
  groupMutes: {},
  groupSolos: {},
  sends: {},
  returnGains: [],
  trackFiles: {},
  devices: {} as SessionUi["devices"],
  preAmount: 0,
  autoLanes: {},
  autoParam: {},
  autoData: {},
  metronome: false,
  countIn: 0,
  ...over,
});

const makeSession = (name: string, ui: Partial<SessionUi> = {}): SessionData => ({
  version: SESSION_VERSION,
  name,
  ui: makeUi(ui),
});

const makePrefs = (over: Partial<PrefsData> = {}): PrefsData => ({
  theme: "midnight",
  tracksRight: false,
  showGrid: true,
  vibrantClips: false,
  sampleRate: 48,
  bufferSize: 256,
  outputDevice: "Default",
  midiInput: "",
  midiThru: false,
  autoSave: true,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
});

describe("sessionBackend (browser / offline)", () => {
  it("canUseFiles is false offline (no native engine)", () => {
    // window.__JUCE__ is absent under happy-dom, so the lazy impl resolves to the
    // browser backend whose file dialogs are unavailable.
    expect(sessionBackend.canUseFiles).toBe(false);
  });

  it("save → load round-trips the ui payload and stamps name + savedAt", async () => {
    const ok = await sessionBackend.save("My Song", makeSession("My Song", { bpm: 140 }));
    expect(ok).toBe(true);

    const loaded = await sessionBackend.load("My Song");
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("My Song");
    expect(loaded!.ui.bpm).toBe(140);
    // save() injects a fresh ISO timestamp.
    expect(typeof loaded!.savedAt).toBe("string");
    expect(Number.isNaN(Date.parse(loaded!.savedAt!))).toBe(false);
  });

  it("save writes under the sanitized key and load reads it back", async () => {
    // "Bad/Name" sanitizes to "BadName"; the raw localStorage key uses the safe form.
    await sessionBackend.save("Bad/Name", makeSession("Bad/Name", { bpm: 100 }));
    expect(localStorage.getItem("zdaw:session:BadName")).not.toBeNull();
    expect(localStorage.getItem("zdaw:session:Bad/Name")).toBeNull();

    const loaded = await sessionBackend.load("BadName");
    expect(loaded!.name).toBe("BadName");
    expect(loaded!.ui.bpm).toBe(100);
  });

  it("load returns null for a missing session", async () => {
    expect(await sessionBackend.load("does-not-exist")).toBeNull();
  });

  it("load returns null when the stored value is corrupt JSON", async () => {
    localStorage.setItem("zdaw:session:Broken", "{not valid json");
    expect(await sessionBackend.load("Broken")).toBeNull();
  });

  it("list returns saved sessions with their savedAt", async () => {
    await sessionBackend.save("Alpha", makeSession("Alpha"));
    await sessionBackend.save("Beta", makeSession("Beta"));

    const items = await sessionBackend.list();
    const names = items.map((i) => i.name).sort();
    expect(names).toEqual(["Alpha", "Beta"]);
    for (const item of items) {
      expect(typeof item.savedAt).toBe("string");
      expect(Number.isNaN(Date.parse(item.savedAt!))).toBe(false);
    }
  });

  it("list skips reserved names beginning with an underscore (e.g. autosave)", async () => {
    await sessionBackend.save("Keeper", makeSession("Keeper"));
    // The autosave name is reserved and must stay hidden from the list.
    await sessionBackend.save(AUTOSAVE_NAME, makeSession(AUTOSAVE_NAME));
    // ...but it IS still persisted and loadable directly.
    expect(await sessionBackend.load(AUTOSAVE_NAME)).not.toBeNull();

    const items = await sessionBackend.list();
    expect(items.map((i) => i.name)).toEqual(["Keeper"]);
  });

  it("list ignores localStorage keys outside the session prefix", async () => {
    await sessionBackend.save("Real", makeSession("Real"));
    localStorage.setItem("unrelated-key", "x");
    localStorage.setItem("zdaw:prefs", JSON.stringify(makePrefs()));

    const items = await sessionBackend.list();
    expect(items.map((i) => i.name)).toEqual(["Real"]);
  });

  it("list tolerates a session entry whose body is corrupt JSON (savedAt undefined)", async () => {
    localStorage.setItem("zdaw:session:Corrupt", "{oops");
    const items = await sessionBackend.list();
    const corrupt = items.find((i) => i.name === "Corrupt");
    expect(corrupt).toBeDefined();
    expect(corrupt!.savedAt).toBeUndefined();
  });

  it("remove deletes a session and returns true", async () => {
    await sessionBackend.save("Temp", makeSession("Temp"));
    expect(await sessionBackend.load("Temp")).not.toBeNull();

    const removed = await sessionBackend.remove("Temp");
    expect(removed).toBe(true);
    expect(await sessionBackend.load("Temp")).toBeNull();
    expect((await sessionBackend.list()).map((i) => i.name)).not.toContain("Temp");
  });

  it("remove is idempotent for an unknown name", async () => {
    expect(await sessionBackend.remove("never-existed")).toBe(true);
  });

  it("savePrefs → loadPrefs round-trips the preferences object", async () => {
    const prefs = makePrefs({ theme: "midnight", bufferSize: 512, autoSave: false });
    await sessionBackend.savePrefs(prefs);

    const loaded = await sessionBackend.loadPrefs();
    expect(loaded).toEqual(prefs);
    // stored under the dedicated prefs key
    expect(localStorage.getItem("zdaw:prefs")).not.toBeNull();
  });

  it("loadPrefs returns null when nothing has been saved", async () => {
    expect(await sessionBackend.loadPrefs()).toBeNull();
  });

  it("loadPrefs returns null when the stored prefs are corrupt JSON", async () => {
    localStorage.setItem("zdaw:prefs", "not-json");
    expect(await sessionBackend.loadPrefs()).toBeNull();
  });

  it("exportFile / importFile are no-ops offline (native dialogs unavailable)", async () => {
    await expect(sessionBackend.exportFile("Anything")).resolves.toBeUndefined();
    await expect(sessionBackend.importFile()).resolves.toBeUndefined();
  });
});

describe("sessionBackend — sanitizeName behaviour (observed via save key)", () => {
  // sanitizeName isn't exported, so we exercise it through the public save() path:
  // the localStorage key reflects the sanitized name.
  const savedKeys = (): string[] => {
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("zdaw:session:")) out.push(k.slice("zdaw:session:".length));
    }
    return out;
  };

  it("keeps letters, numbers, spaces and . _ ( ) - intact", async () => {
    const name = "Mix_v2 (final-take).take";
    await sessionBackend.save(name, makeSession(name));
    expect(savedKeys()).toContain(name);
  });

  it("strips characters outside the allowed set", async () => {
    // slashes, colons, angle brackets and emoji are removed.
    await sessionBackend.save("a/b:c<d>e", makeSession("x"));
    expect(savedKeys()).toContain("abcde");
  });

  it("preserves unicode letters and marks", async () => {
    const name = "Café Naïve";
    await sessionBackend.save(name, makeSession(name));
    // accented letters and combining marks are in the allowed \p{L}\p{M} classes.
    expect(savedKeys()).toContain(name);
  });

  it("caps the name at 200 characters", async () => {
    const long = "z".repeat(500);
    await sessionBackend.save(long, makeSession(long));
    const keys = savedKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toHaveLength(200);
    // the persisted body also records the truncated name
    const body = JSON.parse(localStorage.getItem(`zdaw:session:${keys[0]}`)!) as SessionData;
    expect(body.name).toHaveLength(200);
  });

  it("an all-junk name sanitizes to the empty string (still a valid key)", async () => {
    await sessionBackend.save("***", makeSession("***"));
    expect(savedKeys()).toContain("");
    expect(localStorage.getItem("zdaw:session:")).not.toBeNull();
  });
});

describe("AUTOSAVE_NAME", () => {
  it("is the reserved underscore-prefixed autosave key", () => {
    expect(AUTOSAVE_NAME).toBe("__autosave__");
    expect(AUTOSAVE_NAME.startsWith("_")).toBe(true);
  });
});

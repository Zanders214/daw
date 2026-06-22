import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPrefs,
  applySession,
  buildSession,
  serializePrefs,
  serializeSession,
  SESSION_VERSION,
  type PrefsData,
  type SessionData,
} from "./session";
import { useDawStore } from "../store/useDawStore";

const pristine = { ...useDawStore.getState() };
const get = () => useDawStore.getState();

beforeEach(() => {
  useDawStore.setState(pristine, true);
});

describe("session — serialize", () => {
  it("serializeSession captures the musical fields", () => {
    useDawStore.setState({ bpm: 99, masterVolume: 0.5, mutes: { kick: true } });
    const ui = serializeSession(get());
    expect(ui.bpm).toBe(99);
    expect(ui.masterVolume).toBe(0.5);
    expect(ui.mutes).toEqual({ kick: true });
    // a representative spread of the rest of the contract is present
    expect(ui).toHaveProperty("loopEnd");
    expect(ui).toHaveProperty("returnGains");
    expect(ui).toHaveProperty("autoData");
  });

  it("serializePrefs captures appearance + device prefs", () => {
    useDawStore.setState({ theme: "midnight", autoSave: false, bufferSize: 512 });
    const prefs = serializePrefs(get());
    expect(prefs.theme).toBe("midnight");
    expect(prefs.autoSave).toBe(false);
    expect(prefs.bufferSize).toBe(512);
  });
});

describe("session — buildSession", () => {
  it("wraps the live store with a version and ISO timestamp", () => {
    useDawStore.setState({ bpm: 88 });
    const data = buildSession("Track 1");
    expect(data.version).toBe(SESSION_VERSION);
    expect(data.name).toBe("Track 1");
    expect(data.ui.bpm).toBe(88);
    expect(typeof data.savedAt).toBe("string");
    expect(Number.isNaN(Date.parse(data.savedAt!))).toBe(false);
  });
});

describe("session — apply", () => {
  it("serialize → applySession round-trips musical state into a fresh store", () => {
    useDawStore.setState({
      bpm: 99,
      masterVolume: 0.5,
      mutes: { kick: true },
      volumes: { lead: 0.3 },
    });
    const ui = serializeSession(get());

    useDawStore.setState(pristine, true);
    expect(get().bpm).toBe(124); // back to default

    applySession({ version: SESSION_VERSION, name: "n", ui });
    expect(get().bpm).toBe(99);
    expect(get().masterVolume).toBe(0.5);
    expect(get().mutes).toEqual({ kick: true });
    expect(get().volumes).toEqual({ lead: 0.3 });
  });

  it("applySession ignores data with no ui payload", () => {
    const before = get().bpm;
    applySession({ version: SESSION_VERSION, name: "x" } as unknown as SessionData);
    expect(get().bpm).toBe(before);
  });

  it("applyPrefs hydrates appearance/device prefs (engine inactive)", () => {
    useDawStore.setState({ theme: "midnight", autoSave: false, bufferSize: 512 });
    const prefs = serializePrefs(get());

    useDawStore.setState(pristine, true);
    applyPrefs(prefs);
    expect(get().theme).toBe("midnight");
    expect(get().autoSave).toBe(false);
    expect(get().bufferSize).toBe(512);
  });

  it("applyPrefs ignores nullish input", () => {
    const before = get().theme;
    applyPrefs(null as unknown as Partial<PrefsData>);
    expect(get().theme).toBe(before);
  });
});

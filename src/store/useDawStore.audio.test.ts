import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeAudio } from "../test/fakeAudio";

// importAudioFile decodes via audioImport → ensureAudio, so the fake Web Audio
// globals must be installed before the store (and its deps) are imported.
type StoreMod = typeof import("./useDawStore");

let uninstall: () => void;
let S: StoreMod;

beforeEach(async () => {
  vi.resetModules();
  uninstall = installFakeAudio();
  S = await import("./useDawStore");
});

afterEach(() => {
  uninstall();
  vi.resetModules();
});

const fakeFile = (name: string): File =>
  ({ name, arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as File;

describe("useDawStore — audio assets", () => {
  it("starts with no assets", () => {
    expect(S.useDawStore.getState().assets).toEqual({});
  });

  it("addAsset / removeAsset register and drop metadata", () => {
    const asset = { id: "a1", name: "x", duration: 1, sampleRate: 48000, channels: 2 };
    S.useDawStore.getState().addAsset(asset);
    expect(S.useDawStore.getState().assets.a1).toEqual(asset);
    S.useDawStore.getState().removeAsset("a1");
    expect(S.useDawStore.getState().assets.a1).toBeUndefined();
  });

  it("importAudioFile adds an asset and an audio clip atomically", async () => {
    const st = S.useDawStore.getState();
    const trackId = st.tracks[0].id;
    const before = st.tracks[0].clips.length;

    await st.importAudioFile(fakeFile("loop.wav"), trackId, 3);

    const track = S.useDawStore.getState().tracks.find((t) => t.id === trackId)!;
    expect(track.clips).toHaveLength(before + 1);
    const clip = track.clips[track.clips.length - 1];
    expect(clip.src).toBeDefined();
    expect(clip.bar).toBe(3);
    expect(S.useDawStore.getState().assets[clip.src!]).toBeDefined();
  });

  it("newSession clears imported assets", async () => {
    const st = S.useDawStore.getState();
    await st.importAudioFile(fakeFile("loop.wav"), st.tracks[0].id, 0);
    expect(Object.keys(S.useDawStore.getState().assets).length).toBeGreaterThan(0);
    S.useDawStore.getState().newSession();
    expect(S.useDawStore.getState().assets).toEqual({});
  });

  it("addImportedClip (hosted chooser result) adds a path-bearing asset + clip", () => {
    const st = S.useDawStore.getState();
    const trackId = st.tracks[0].id;
    const before = st.tracks[0].clips.length;

    // 2s @ 124bpm → ~1.033 bars (durationToBars).
    st.addImportedClip({ trackId, bar: 5, path: "/h/loop.wav", name: "loop.wav", durationSec: 2 });

    const track = S.useDawStore.getState().tracks.find((t) => t.id === trackId)!;
    expect(track.clips).toHaveLength(before + 1);
    const clip = track.clips[track.clips.length - 1];
    expect(clip.bar).toBe(5);
    expect(clip.src).toBeDefined();
    expect(clip.len).toBeGreaterThan(0);

    const asset = S.useDawStore.getState().assets[clip.src!];
    expect(asset).toBeDefined();
    expect(asset.path).toBe("/h/loop.wav");
    expect(asset.duration).toBe(2);
  });
});

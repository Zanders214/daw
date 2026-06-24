import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeAudio } from "../test/fakeAudio";

// audioImport → ensureAudio memoizes an AudioContext at module load, so install
// the fake Web Audio globals and reset modules around every test.
type ImportMod = typeof import("./audioImport");
type AssetStore = typeof import("./assetStore");

let uninstall: () => void;
let M: ImportMod;
let AS: AssetStore;

beforeEach(async () => {
  vi.resetModules();
  uninstall = installFakeAudio();
  M = await import("./audioImport");
  AS = await import("./assetStore");
});

afterEach(() => {
  AS.clearAssets();
  uninstall();
  vi.resetModules();
});

const fakeFile = (name: string): File =>
  ({ name, arrayBuffer: async () => new ArrayBuffer(16) }) as unknown as File;

describe("durationToBars", () => {
  it("converts seconds to bars at a given tempo", () => {
    // 2s @ 120bpm = 4 beats = 1 bar; 1s @ 120bpm = 0.5 bar.
    expect(M.durationToBars(2, 120)).toBeCloseTo(1);
    expect(M.durationToBars(1, 120)).toBeCloseTo(0.5);
  });
});

describe("decodeAudioFile", () => {
  it("decodes a file into asset metadata + a src-bearing clip and caches peaks", async () => {
    const res = await M.decodeAudioFile(fakeFile("vox.wav"), 120, 4);
    expect(res).not.toBeNull();
    const { asset, clip } = res!;

    expect(asset.name).toBe("vox.wav");
    expect(asset.duration).toBeGreaterThan(0);
    expect(asset.channels).toBe(2);

    expect(clip.src).toBe(asset.id);
    expect(clip.bar).toBe(4);
    expect(clip.len).toBeGreaterThan(0);
    expect(clip.name).toBe("vox.wav");

    // Decoded buffer + peaks are cached out-of-store under the asset id.
    expect(AS.hasAsset(asset.id)).toBe(true);
    expect(AS.getAsset(asset.id)!.peaks.length).toBeGreaterThan(0);
  });

  it("clamps the drop bar within the timeline", async () => {
    const res = await M.decodeAudioFile(fakeFile("x.wav"), 120, -5);
    expect(res!.clip.bar).toBe(0);
  });
});

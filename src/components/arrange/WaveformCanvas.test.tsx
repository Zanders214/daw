// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { WaveformCanvas } from "./WaveformCanvas";
import { putAsset, clearAssets } from "../../lib/assetStore";

const peaks = (n: number) => ({ min: new Float32Array(n), max: new Float32Array(n), length: n });

afterEach(() => {
  cleanup();
  clearAssets();
});

describe("WaveformCanvas", () => {
  it("renders a canvas keyed by the asset id when the buffer is in memory", () => {
    putAsset("asset1", { buffer: {} as AudioBuffer, peaks: peaks(8) });
    const { container } = render(<WaveformCanvas src="asset1" color="#34d8ff" />);
    expect(container.querySelector('canvas[data-waveform="asset1"]')).not.toBeNull();
    expect(container.querySelector("[data-waveform-missing]")).toBeNull();
  });

  it("renders a 'missing' placeholder when the decoded buffer isn't loaded", () => {
    const { container } = render(<WaveformCanvas src="gone" color="#34d8ff" />);
    expect(container.querySelector('[data-waveform-missing="gone"]')).not.toBeNull();
    expect(container.querySelector("canvas")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { encodeWav } from "./wav";

/** Minimal AudioBuffer-like with real channel data for the encoder. */
function buf(channels: number[][], sampleRate = 44100): AudioBuffer {
  const data = channels.map((c) => Float32Array.from(c));
  return {
    numberOfChannels: data.length,
    length: data[0]?.length ?? 0,
    sampleRate,
    getChannelData: (c: number) => data[c],
  } as unknown as AudioBuffer;
}

const ascii = (view: DataView, offset: number, len: number) =>
  Array.from({ length: len }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join("");

describe("encodeWav", () => {
  it("writes a valid 16-bit PCM RIFF/WAVE header", async () => {
    const b = encodeWav(buf([[0, 0, 0, 0]], 48000)); // mono, 4 frames
    const view = new DataView(await b.arrayBuffer());

    expect(ascii(view, 0, 4)).toBe("RIFF");
    expect(ascii(view, 8, 4)).toBe("WAVE");
    expect(ascii(view, 12, 4)).toBe("fmt ");
    expect(view.getUint32(16, true)).toBe(16); // fmt chunk size
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(48000); // sample rate
    expect(view.getUint16(32, true)).toBe(2); // block align (1ch * 2 bytes)
    expect(view.getUint16(34, true)).toBe(16); // bit depth
    expect(ascii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(4 * 2); // 4 frames * 2 bytes
    expect(b.type).toBe("audio/wav");
  });

  it("maps samples to signed 16-bit (1→32767, -1→-32768, 0→0) and clamps", async () => {
    const b = encodeWav(buf([[0, 1, -1, 2, -2]])); // includes out-of-range
    const view = new DataView(await b.arrayBuffer());
    const sample = (i: number) => view.getInt16(44 + i * 2, true);
    expect(sample(0)).toBe(0);
    expect(sample(1)).toBe(32767);
    expect(sample(2)).toBe(-32768);
    expect(sample(3)).toBe(32767); // 2 clamped to 1.0
    expect(sample(4)).toBe(-32768); // -2 clamped to -1.0
  });

  it("interleaves stereo channels frame by frame", async () => {
    const b = encodeWav(buf([[1, 1], [-1, -1]])); // L=+1, R=-1
    const view = new DataView(await b.arrayBuffer());
    // frame 0: L then R
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
    // total data bytes = 2 frames * 2 ch * 2 bytes
    expect(view.getUint32(40, true)).toBe(8);
  });
});

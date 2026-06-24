/**
 * Minimal WAV (RIFF/PCM) encoder. Takes a rendered AudioBuffer and produces a
 * 16-bit little-endian PCM WAV Blob — enough to download a bounce. No external
 * deps; pure DataView writes so it unit-tests without Web Audio.
 */

/** Encode an AudioBuffer as a 16-bit PCM WAV Blob (audio/wav). */
export function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const frames = buffer.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numCh * bytesPerSample;
  const dataBytes = frames * blockAlign;

  const out = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(out);
  let p = 0;
  const u16 = (v: number) => { view.setUint16(p, v, true); p += 2; };
  const u32 = (v: number) => { view.setUint32(p, v, true); p += 4; };
  const str = (s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i)); };

  // RIFF header
  str("RIFF"); u32(36 + dataBytes); str("WAVE");
  // fmt chunk (PCM)
  str("fmt "); u32(16); u16(1); u16(numCh); u32(sampleRate);
  u32(sampleRate * blockAlign); u16(blockAlign); u16(16);
  // data chunk
  str("data"); u32(dataBytes);

  // Interleave channels, clamp to [-1,1], map to signed 16-bit
  // (1.0 → 32767, -1.0 → -32768, 0 → 0).
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = channels[c][i];
      s = s < -1 ? -1 : s > 1 ? 1 : s;
      const v = Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
      view.setInt16(p, v < -0x8000 ? -0x8000 : v > 0x7fff ? 0x7fff : v, true);
      p += 2;
    }
  }

  return new Blob([out], { type: "audio/wav" });
}

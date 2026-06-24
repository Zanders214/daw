import { useEffect, useRef } from "react";
import { getAsset } from "../../lib/assetStore";
import { hexA } from "../../lib/color";

/** Fixed internal raster size; peaks are resolution-independent so the canvas is
 *  stretched to the clip width via CSS without quality loss. */
const RASTER_W = 600;
const RASTER_H = 64;

/**
 * Real audio waveform for a clip, drawn from the decoded asset's min/max peaks
 * (lib/assetStore). When the decoded buffer isn't in memory — e.g. a session was
 * reloaded and the file wasn't re-imported — it renders a dimmed placeholder
 * instead of a fake waveform, signalling "audio missing".
 */
export function WaveformCanvas({ src, color }: Readonly<{ src: string; color: string }>) {
  const ref = useRef<HTMLCanvasElement>(null);
  const entry = getAsset(src);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !entry) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return; // jsdom/happy-dom without a canvas backend
    const { min, max, length } = entry.peaks;
    const mid = RASTER_H / 2;
    ctx.clearRect(0, 0, RASTER_W, RASTER_H);
    ctx.fillStyle = color;
    for (let x = 0; x < RASTER_W; x++) {
      const b = Math.min(length - 1, Math.floor((x / RASTER_W) * length));
      const top = mid - max[b] * mid;
      const h = Math.max(1, (max[b] - min[b]) * mid);
      ctx.fillRect(x, top, 1, h);
    }
  }, [src, color, entry]);

  if (!entry) {
    return (
      <div
        data-waveform-missing={src}
        title="Audio not loaded — re-import the file"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "56%",
          opacity: 0.4,
          background: `repeating-linear-gradient(90deg, ${hexA(color, 0.6)} 0 1.5px, transparent 1.5px 6px)`,
          WebkitMaskImage: "linear-gradient(180deg, transparent, #000 65%)",
          maskImage: "linear-gradient(180deg, transparent, #000 65%)",
        }}
      />
    );
  }

  return (
    <canvas
      ref={ref}
      data-waveform={src}
      width={RASTER_W}
      height={RASTER_H}
      style={{
        position: "absolute",
        left: 4,
        right: 4,
        bottom: 4,
        width: "calc(100% - 8px)",
        height: "60%",
        opacity: 0.85,
      }}
    />
  );
}

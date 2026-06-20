import React, { useMemo } from "react";

/**
 * Keyboard — a playable octave-tiling keyboard. White keys flex to fill;
 * black keys overlay at 62% width. Pressing a key swaps its fill, lights
 * a colored glow and depresses it 2px. Reports MIDI-ish note indices.
 */
export function Keyboard({
  whites = 15,
  whiteFill = "#f8f5ef",
  whitePress = "#e7d8bd",
  blackFill = "#1a1714",
  blackPress = "#473d31",
  accent = "#e0a96d",
  keyBorder = "rgba(0,0,0,0.16)",
  onPress,
  onRelease,
  style,
  ...rest
}) {
  const N = Math.max(7, Math.round(whites));
  const ww = 100 / N;
  const whiteSemis = [0, 2, 4, 5, 7, 9, 11];

  const { white, black } = useMemo(() => {
    const white = [];
    for (let i = 0; i < N; i++) {
      white.push({
        idx: Math.floor(i / 7) * 12 + whiteSemis[i % 7],
        style: {
          flex: "1 1 0",
          height: "100%",
          background: whiteFill,
          borderRight: `1px solid ${keyBorder}`,
          borderRadius: "0 0 4px 4px",
          cursor: "pointer",
          boxShadow: "inset 0 -7px 9px -7px rgba(0,0,0,.22)",
          transition: "transform .04s, box-shadow .08s, background .08s",
        },
      });
    }
    const bw = ww * 0.62;
    const black = [];
    for (let i = 0; i < N - 1; i++) {
      if ([0, 1, 3, 4, 5].includes(i % 7)) {
        black.push({
          idx: Math.floor(i / 7) * 12 + whiteSemis[i % 7] + 1,
          style: {
            position: "absolute",
            top: 0,
            height: "61%",
            zIndex: 2,
            left: ((i + 1) * ww - bw / 2).toFixed(3) + "%",
            width: bw.toFixed(3) + "%",
            background: blackFill,
            borderRadius: "0 0 3px 3px",
            cursor: "pointer",
            boxShadow: "0 3px 4px rgba(0,0,0,.4), inset 0 -3px 5px rgba(255,255,255,.07)",
            transition: "transform .04s, box-shadow .08s, background .08s",
          },
        });
      }
    }
    return { white, black };
  }, [N, whiteFill, blackFill, keyBorder, ww]);

  const press = (base, pressCol, idx) => (e) => {
    const el = e.currentTarget;
    el.style.background = pressCol;
    el.style.boxShadow = `0 0 16px ${accent}, inset 0 0 10px ${accent}`;
    el.style.transform = "translateY(2px)";
    onPress && onPress(idx);
  };
  const release = (base, idx) => (e) => {
    const el = e.currentTarget;
    el.style.background = base;
    el.style.boxShadow = "";
    el.style.transform = "none";
    onRelease && onRelease(idx);
  };

  return (
    <div
      style={{ position: "relative", display: "flex", width: "100%", height: "100%", borderRadius: 3, overflow: "hidden", ...style }}
      {...rest}
    >
      {white.map((w, i) => (
        <div
          key={"w" + i}
          style={w.style}
          onPointerDown={press(whiteFill, whitePress, w.idx)}
          onPointerUp={release(whiteFill, w.idx)}
          onPointerLeave={release(whiteFill, w.idx)}
        />
      ))}
      {black.map((b, i) => (
        <div
          key={"b" + i}
          style={b.style}
          onPointerDown={press(blackFill, blackPress, b.idx)}
          onPointerUp={release(blackFill, b.idx)}
          onPointerLeave={release(blackFill, b.idx)}
        />
      ))}
    </div>
  );
}

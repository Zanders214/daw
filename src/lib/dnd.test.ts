// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  ITEM_MIME,
  TRACK_COLORS,
  newInstanceId,
  newTrackId,
  newClipId,
  newGroupId,
  newNoteId,
  setDragItem,
  getDragItem,
  hasDragItem,
  deviceDescriptorForItem,
  trackTypeForItem,
  trackDefaultsForItem,
} from "./dnd";
import type { BrowserItem } from "../types";

const item = (over: Partial<BrowserItem> = {}): BrowserItem => ({
  kind: "fx",
  glyph: "*",
  name: "Reverb",
  ...over,
});

describe("setDragItem / getDragItem round-trip", () => {
  it("serializes a browser item under the custom MIME and reads it back", () => {
    const dt = new DataTransfer();
    const it = item({ name: "Delay", kind: "fx" });
    setDragItem(dt, it);

    expect(dt.effectAllowed).toBe("copy");
    expect(dt.getData("text/plain")).toBe("Delay");

    const out = getDragItem(dt);
    expect(out).toEqual(it);
  });

  it("returns null for a null DataTransfer", () => {
    expect(getDragItem(null)).toBeNull();
  });

  it("returns null when the custom MIME payload is absent", () => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "just text");
    expect(getDragItem(dt)).toBeNull();
  });

  it("returns null for malformed (non-JSON) payloads", () => {
    const dt = new DataTransfer();
    dt.setData(ITEM_MIME, "{not valid json");
    expect(getDragItem(dt)).toBeNull();
  });

  it("returns null when JSON is valid but missing required string fields", () => {
    const dt = new DataTransfer();
    // valid JSON, but `name`/`kind` are not strings
    dt.setData(ITEM_MIME, JSON.stringify({ name: 42, kind: 7, glyph: "x" }));
    expect(getDragItem(dt)).toBeNull();
  });

  it("returns null when JSON parses to null", () => {
    const dt = new DataTransfer();
    dt.setData(ITEM_MIME, "null");
    expect(getDragItem(dt)).toBeNull();
  });

  it("accepts a payload with the two required string fields", () => {
    const dt = new DataTransfer();
    dt.setData(ITEM_MIME, JSON.stringify({ name: "X", kind: "audio" }));
    const out = getDragItem(dt);
    expect(out).toMatchObject({ name: "X", kind: "audio" });
  });
});

describe("hasDragItem", () => {
  it("is false for null", () => {
    expect(hasDragItem(null)).toBe(false);
  });

  it("is false when the custom MIME isn't among the types", () => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "nope");
    expect(hasDragItem(dt)).toBe(false);
  });

  it("is true once a browser item has been set", () => {
    const dt = new DataTransfer();
    setDragItem(dt, item());
    expect(hasDragItem(dt)).toBe(true);
    expect(Array.from(dt.types)).toContain(ITEM_MIME);
  });
});

describe("deviceDescriptorForItem", () => {
  it("maps ZandersEQ to the eq house plugin", () => {
    expect(deviceDescriptorForItem(item({ name: "ZandersEQ" }))).toEqual({
      kind: "eq",
      name: "ZANDERS EQ",
    });
  });

  it("maps ZandersTapeStop to the tape house plugin", () => {
    expect(deviceDescriptorForItem(item({ name: "ZandersTapeStop" }))).toEqual({
      kind: "tape",
      name: "TAPE STOP",
    });
  });

  it("maps ZandersPreDrop to the pre house plugin", () => {
    expect(deviceDescriptorForItem(item({ name: "ZandersPreDrop" }))).toEqual({
      kind: "pre",
      name: "PRE-DROP",
    });
  });

  it("slugs an arbitrary name into a kind and upper-cases the name", () => {
    expect(deviceDescriptorForItem(item({ name: "Super Reverb!!" }))).toEqual({
      kind: "super-reverb",
      name: "SUPER REVERB!!",
    });
  });

  it("trims leading/trailing separators produced by the slug", () => {
    expect(deviceDescriptorForItem(item({ name: "  Wide Field  " }))).toEqual({
      kind: "wide-field",
      name: "  WIDE FIELD  ",
    });
  });

  it("falls back to kind 'fx' when the name slugs to an empty string", () => {
    const d = deviceDescriptorForItem(item({ name: "!!!" }));
    expect(d.kind).toBe("fx");
    expect(d.name).toBe("!!!");
  });
});

describe("trackTypeForItem", () => {
  it("returns 'audio' for audio browser items", () => {
    expect(trackTypeForItem(item({ kind: "audio" }))).toBe("audio");
  });

  it("returns 'midi' for instrument items", () => {
    expect(trackTypeForItem(item({ kind: "inst" }))).toBe("midi");
  });

  it("returns 'midi' for midi items", () => {
    expect(trackTypeForItem(item({ kind: "midi" }))).toBe("midi");
  });

  it("returns 'midi' for preset items", () => {
    expect(trackTypeForItem(item({ kind: "preset" }))).toBe("midi");
  });
});

describe("trackDefaultsForItem", () => {
  it("upper-cases the name and derives the type", () => {
    const d = trackDefaultsForItem(item({ name: "lead synth", kind: "inst" }), 0);
    expect(d.name).toBe("LEAD SYNTH");
    expect(d.type).toBe("midi");
    expect(d.color).toBe(TRACK_COLORS[0]);
  });

  it("uses an audio type for audio items", () => {
    const d = trackDefaultsForItem(item({ name: "vox", kind: "audio" }), 1);
    expect(d.type).toBe("audio");
    expect(d.color).toBe(TRACK_COLORS[1]);
  });

  it("cycles the color palette by index (modulo)", () => {
    const len = TRACK_COLORS.length;
    // index 0 and index len should pick the same first color.
    expect(trackDefaultsForItem(item(), 0).color).toBe(TRACK_COLORS[0]);
    expect(trackDefaultsForItem(item(), len).color).toBe(TRACK_COLORS[0]);
    expect(trackDefaultsForItem(item(), len + 2).color).toBe(TRACK_COLORS[2]);
  });

  it("walks the entire palette across consecutive indices", () => {
    for (let i = 0; i < TRACK_COLORS.length * 2; i++) {
      expect(trackDefaultsForItem(item(), i).color).toBe(
        TRACK_COLORS[i % TRACK_COLORS.length],
      );
    }
  });
});

describe("id factories", () => {
  const factories: Array<[() => string, string]> = [
    [newInstanceId, "dev-"],
    [newTrackId, "trk-"],
    [newClipId, "clip-"],
    [newGroupId, "g-"],
    [newNoteId, "note-"],
  ];

  it("each factory returns ids with its readable prefix", () => {
    for (const [fn, prefix] of factories) {
      expect(fn().startsWith(prefix)).toBe(true);
    }
  });

  it("produces unique ids across many calls", () => {
    const ids = new Set<string>();
    const n = 200;
    for (let i = 0; i < n; i++) {
      ids.add(newTrackId());
      ids.add(newClipId());
      ids.add(newInstanceId());
      ids.add(newGroupId());
      ids.add(newNoteId());
    }
    expect(ids.size).toBe(n * 5);
  });

  it("increments the embedded sequence number per factory", () => {
    const a = newTrackId();
    const b = newTrackId();
    const seqA = Number(a.split("-")[1]);
    const seqB = Number(b.split("-")[1]);
    expect(seqB).toBe(seqA + 1);
  });

  it("embeds an 8-char hex/uuid suffix", () => {
    const id = newClipId();
    const suffix = id.split("-").pop() ?? "";
    expect(suffix).toHaveLength(8);
    expect(/^[0-9a-f]{8}$/.test(suffix)).toBe(true);
  });
});

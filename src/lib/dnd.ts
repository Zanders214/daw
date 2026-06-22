/**
 * Drag-and-drop glue for browser items → tracks / device chains, plus the small
 * id factories used when the store materializes new tracks and device instances.
 *
 * The browser is the single drag source; lanes/headers and the arrange empty
 * zone are drop targets. A tiny custom MIME type carries the dragged
 * `BrowserItem` so a stray OS file/text drop is ignored.
 */
import type { BrowserItem, DeviceDescriptor, Track, TrackType } from "../types";

/** Custom drag MIME so we only accept our own browser items. */
export const ITEM_MIME = "application/x-zd-item";

/** Accent palette for freshly created tracks (cycled by index). */
export const TRACK_COLORS = [
  "#34d8ff", "#59c6f5", "#8b7bff", "#b06fe0", "#ff5fa8", "#ff8a7a", "#ffc24b",
];

let instanceSeq = 0;
let trackSeq = 0;
let clipSeq = 0;

/** A stable unique id with a readable prefix (uuid when available). */
function uid(prefix: string, seq: number): string {
  const rnd =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${seq}-${rnd}`;
}

let groupSeq = 0;

export const newInstanceId = (): string => uid("dev", ++instanceSeq);
export const newTrackId = (): string => uid("trk", ++trackSeq);
export const newClipId = (): string => uid("clip", ++clipSeq);
export const newGroupId = (): string => uid("g", ++groupSeq);

/** Serialize a browser item onto a drag event. */
export function setDragItem(dt: DataTransfer, item: BrowserItem): void {
  dt.effectAllowed = "copy";
  dt.setData(ITEM_MIME, JSON.stringify(item));
  // Plain-text fallback keeps the drag image/label sane in some webviews.
  dt.setData("text/plain", item.name);
}

/** Read a browser item from a drop event, or null if it isn't one of ours. */
export function getDragItem(dt: DataTransfer | null): BrowserItem | null {
  if (!dt) return null;
  const raw = dt.getData(ITEM_MIME);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as BrowserItem;
    return v && typeof v.name === "string" && typeof v.kind === "string" ? v : null;
  } catch {
    return null;
  }
}

/** True when a drag carries one of our browser items. */
export function hasDragItem(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types).includes(ITEM_MIME);
}

const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Map a browser FX item to a device descriptor (house plugins → their keys). */
export function deviceDescriptorForItem(item: BrowserItem): DeviceDescriptor {
  switch (item.name) {
    case "ZandersEQ":
      return { kind: "eq", name: "ZANDERS EQ" };
    case "ZandersTapeStop":
      return { kind: "tape", name: "TAPE STOP" };
    case "ZandersPreDrop":
      return { kind: "pre", name: "PRE-DROP" };
    default:
      return { kind: slug(item.name) || "fx", name: item.name.toUpperCase() };
  }
}

/** The track type a non-FX browser item should create. */
export function trackTypeForItem(item: BrowserItem): TrackType {
  if (item.kind === "audio") return "audio";
  return "midi"; // inst / midi / preset all author MIDI tracks
}

/** Defaults for a new track created from a dropped browser item. */
export function trackDefaultsForItem(
  item: BrowserItem,
  index: number,
): Pick<Track, "name" | "type" | "color"> {
  return {
    name: item.name.toUpperCase(),
    type: trackTypeForItem(item),
    color: TRACK_COLORS[index % TRACK_COLORS.length],
  };
}

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackLane } from "./TrackLane";
import { useDawStore } from "../../store/useDawStore";
import { ITEM_MIME } from "../../lib/dnd";
import type { Track } from "../../types";

// TrackLane reads many store slices and dispatches clip mutations. Snapshot the
// slices a test might touch and restore them afterward so order doesn't matter.
type LaneSnapshot = {
  tracks: Track[];
  selClip: string;
  selClips: string[];
  showGrid: boolean;
  vibrantClips: boolean;
  autoLanes: Record<string, boolean>;
  autoParam: Record<string, string>;
  sendsOpen: Record<string, boolean>;
  mutes: Record<string, boolean>;
  solos: Record<string, boolean>;
  nodeRacks: Record<string, unknown[]>;
  editorOpen: boolean;
  editorClip: string;
  editorTrack: string;
};

let snapshot: LaneSnapshot;

const cloneTracks = (tracks: Track[]): Track[] =>
  tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c })) }));

beforeEach(() => {
  const s = useDawStore.getState();
  snapshot = {
    tracks: cloneTracks(s.tracks),
    selClip: s.selClip,
    selClips: [...s.selClips],
    showGrid: s.showGrid,
    vibrantClips: s.vibrantClips,
    autoLanes: { ...s.autoLanes },
    autoParam: { ...s.autoParam },
    sendsOpen: { ...s.sendsOpen },
    mutes: { ...s.mutes },
    solos: { ...s.solos },
    nodeRacks: { ...(s.nodeRacks as Record<string, unknown[]>) },
    editorOpen: s.editorOpen,
    editorClip: s.editorClip,
    editorTrack: s.editorTrack,
  };
});

afterEach(() => {
  useDawStore.setState({
    tracks: cloneTracks(snapshot.tracks),
    selClip: snapshot.selClip,
    selClips: [...snapshot.selClips],
    showGrid: snapshot.showGrid,
    vibrantClips: snapshot.vibrantClips,
    autoLanes: { ...snapshot.autoLanes },
    autoParam: { ...snapshot.autoParam },
    sendsOpen: { ...snapshot.sendsOpen },
    mutes: { ...snapshot.mutes },
    solos: { ...snapshot.solos },
    nodeRacks: { ...snapshot.nodeRacks } as never,
    editorOpen: snapshot.editorOpen,
    editorClip: snapshot.editorClip,
    editorTrack: snapshot.editorTrack,
  });
});

/** Read a fresh copy of a seeded track by id from the store. */
const trackById = (id: string): Track =>
  useDawStore.getState().tracks.find((t) => t.id === id) as Track;

describe("TrackLane", () => {
  it("renders the lane with a data-track-id and every clip name", () => {
    const track = trackById("kick"); // drum track, 2 clips
    const { container } = render(<TrackLane track={track} />);

    expect(container.querySelector(`[data-track-id="${track.id}"]`)).not.toBeNull();
    expect(screen.getByText("4-on-floor")).toBeInTheDocument();
    expect(screen.getByText("Drop Kick")).toBeInTheDocument();

    // One clip element per clip.
    const clips = container.querySelectorAll("[data-clip-id]");
    expect(clips).toHaveLength(track.clips.length);
  });

  it("renders MIDI note preview chips for a MIDI/drum track", () => {
    const track = trackById("kick"); // type "drum" → isMidi
    const { container } = render(<TrackLane track={track} />);
    const firstClip = container.querySelector(`[data-clip-id="${track.clips[0].id}"]`) as HTMLElement;
    // The MIDI preview renders a bunch of small absolutely-positioned note divs.
    // There should be at least one descendant div inside the clip body besides edges/label.
    const innerDivs = firstClip.querySelectorAll("div");
    expect(innerDivs.length).toBeGreaterThan(2);
  });

  it("renders an audio track's waveform stub instead of note chips", () => {
    const track = trackById("vox"); // type "audio"
    const { container } = render(<TrackLane track={track} />);
    expect(screen.getByText("Vox")).toBeInTheDocument();
    expect(container.querySelector(`[data-clip-id="${track.clips[0].id}"]`)).not.toBeNull();
  });

  it("selects a clip on a plain pointer-down (no shift)", () => {
    useDawStore.setState({ selClip: "", selClips: [] });
    const track = trackById("reese");
    const { container } = render(<TrackLane track={track} />);
    const clip = track.clips[0];
    const el = container.querySelector(`[data-clip-id="${clip.id}"]`) as HTMLElement;

    fireEvent.pointerDown(el, { button: 0, clientX: 100, clientY: 10 });
    expect(useDawStore.getState().selClip).toBe(clip.id);
  });

  it("shift+pointer-down toggles the clip into the selection without selecting solely", () => {
    useDawStore.setState({ selClip: "", selClips: [] });
    const track = trackById("reese");
    const { container } = render(<TrackLane track={track} />);
    const clip = track.clips[0];
    const el = container.querySelector(`[data-clip-id="${clip.id}"]`) as HTMLElement;

    fireEvent.pointerDown(el, { button: 0, shiftKey: true, clientX: 100, clientY: 10 });
    expect(useDawStore.getState().selClips).toContain(clip.id);
  });

  it("double-click opens the editor for a clip", () => {
    const track = trackById("kick");
    const { container } = render(<TrackLane track={track} />);
    const clip = track.clips[0];
    const el = container.querySelector(`[data-clip-id="${clip.id}"]`) as HTMLElement;

    fireEvent.doubleClick(el);
    const s = useDawStore.getState();
    // openEditor flips editorOpen and records the clip + track ids.
    expect(s.editorOpen).toBe(true);
    expect(s.editorClip).toBe(clip.id);
    expect(s.editorTrack).toBe(track.id);
  });

  it("right-click (contextmenu) removes the clip", () => {
    const track = trackById("kick");
    const { container } = render(<TrackLane track={track} />);
    const clip = track.clips[1];
    const el = container.querySelector(`[data-clip-id="${clip.id}"]`) as HTMLElement;

    fireEvent.contextMenu(el);
    const after = trackById("kick").clips.find((c) => c.id === clip.id);
    expect(after).toBeUndefined();
  });

  it("Delete key on a focused clip removes it", () => {
    useDawStore.setState({ selClip: "", selClips: [] });
    const track = trackById("reese");
    const { container } = render(<TrackLane track={track} />);
    const clip = track.clips[0];
    const el = container.querySelector(`[data-clip-id="${clip.id}"]`) as HTMLElement;

    fireEvent.keyDown(el, { key: "Delete" });
    expect(trackById("reese").clips.find((c) => c.id === clip.id)).toBeUndefined();
  });

  it("Ctrl+D duplicates the clip", () => {
    useDawStore.setState({ selClip: "", selClips: [] });
    const track = trackById("reese");
    const before = trackById("reese").clips.length;
    const { container } = render(<TrackLane track={track} />);
    const clip = track.clips[0];
    const el = container.querySelector(`[data-clip-id="${clip.id}"]`) as HTMLElement;

    fireEvent.keyDown(el, { key: "d", ctrlKey: true });
    expect(trackById("reese").clips).toHaveLength(before + 1);
  });

  it("Enter key on a clip selects it", () => {
    useDawStore.setState({ selClip: "", selClips: [] });
    const track = trackById("pluck");
    const { container } = render(<TrackLane track={track} />);
    const clip = track.clips[0];
    const el = container.querySelector(`[data-clip-id="${clip.id}"]`) as HTMLElement;

    fireEvent.keyDown(el, { key: "Enter" });
    expect(useDawStore.getState().selClip).toBe(clip.id);
  });

  it("renders the nested AutomationLane when autoLanes[track.id] is set", () => {
    const track = trackById("kick");
    useDawStore.setState({ autoLanes: { [track.id]: true }, autoParam: { [track.id]: "vol" } });
    const { container } = render(<TrackLane track={track} />);
    // The automation lane carries this distinctive title.
    expect(container.querySelector("[title^='Click to add a point']")).not.toBeNull();
  });

  it("does not render the automation lane when autoLanes is unset", () => {
    const track = trackById("kick");
    useDawStore.setState({ autoLanes: {} });
    const { container } = render(<TrackLane track={track} />);
    expect(container.querySelector("[title^='Click to add a point']")).toBeNull();
  });

  it("dropping an FX item adds a device to the track's rack", () => {
    const track = trackById("kick");
    const { container } = render(<TrackLane track={track} />);
    const lane = container.querySelector(`[data-track-id="${track.id}"]`) as HTMLElement;

    const item = { kind: "fx", glyph: "EQ", name: "ZandersEQ" };
    const dataTransfer = makeDataTransfer(item);
    fireEvent.drop(lane, { dataTransfer });

    const rack = useDawStore.getState().nodeRacks[track.id] ?? [];
    expect(rack.length).toBeGreaterThan(0);
  });

  it("dimmed track (muted) still renders its clips", () => {
    const track = trackById("kick");
    useDawStore.setState({ mutes: { [track.id]: true } });
    render(<TrackLane track={track} />);
    expect(screen.getByText("4-on-floor")).toBeInTheDocument();
  });
});

/** Build a DataTransfer carrying one of our browser items (jsdom/happy-dom). */
function makeDataTransfer(item: unknown): DataTransfer {
  const store: Record<string, string> = {
    [ITEM_MIME]: JSON.stringify(item),
    "text/plain": (item as { name: string }).name,
  };
  return {
    types: Object.keys(store),
    getData: (t: string) => store[t] ?? "",
    setData: (t: string, v: string) => {
      store[t] = v;
    },
    dropEffect: "copy",
    effectAllowed: "copy",
  } as unknown as DataTransfer;
}

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Arrange } from "./Arrange";
import { useDawStore } from "../../store/useDawStore";
import type { Group, Track } from "../../types";

// Arrange reads/mutates a broad slice of the store (tracks, groups, selection,
// layout). Snapshot what we touch so tests stay order-independent.
type Snap = {
  tracks: Track[];
  groups: Group[];
  groupCollapsed: Record<string, boolean>;
  tracksRight: boolean;
  selClips: string[];
  selClip: string;
  selTrack: string;
};
let snap: Snap;

beforeEach(() => {
  const s = useDawStore.getState();
  snap = {
    tracks: s.tracks,
    groups: s.groups,
    groupCollapsed: { ...s.groupCollapsed },
    tracksRight: s.tracksRight,
    selClips: [...s.selClips],
    selClip: s.selClip,
    selTrack: s.selTrack,
  };
});

afterEach(() => {
  // Restore the full arrangement structure (some tests add tracks).
  useDawStore.setState({
    tracks: snap.tracks,
    groups: snap.groups,
    groupCollapsed: snap.groupCollapsed,
    tracksRight: snap.tracksRight,
    selClips: snap.selClips,
    selClip: snap.selClip,
    selTrack: snap.selTrack,
  });
});

describe("Arrange composition", () => {
  it("renders the Ruler's TRACKS label and the ADD TRACK button", () => {
    render(<Arrange />);
    expect(screen.getByText("TRACKS")).toBeInTheDocument();
    expect(screen.getByTitle("Add a new track")).toBeInTheDocument();
    expect(screen.getByText(/ADD TRACK/)).toBeInTheDocument();
  });

  it("shows every seeded group name as a header", () => {
    render(<Arrange />);
    for (const g of useDawStore.getState().groups) {
      // The implicit empty 'g-tracks' bucket is skipped while empty.
      if (g.id === "g-tracks" && g.tracks.length === 0) continue;
      expect(screen.getByText(g.name)).toBeInTheDocument();
    }
  });

  it("shows every seeded track name (groups expanded by default)", () => {
    render(<Arrange />);
    // Seed tracks: KICK, SUB BASS, REESE, PLUCKS, LEAD SYNTH, VOX CHOP, RISER FX.
    expect(screen.getByText("KICK")).toBeInTheDocument();
    expect(screen.getByText("SUB BASS")).toBeInTheDocument();
    expect(screen.getByText("LEAD SYNTH")).toBeInTheDocument();
    expect(screen.getByText("VOX CHOP")).toBeInTheDocument();
    expect(screen.getByText("RISER FX")).toBeInTheDocument();
  });

  it("hides a collapsed group's tracks but keeps the group header", () => {
    // Collapse the DRUMS group (holds KICK).
    useDawStore.setState({ groupCollapsed: { "g-drums": true } });
    render(<Arrange />);
    expect(screen.getByText("DRUMS")).toBeInTheDocument();
    expect(screen.queryByText("KICK")).toBeNull();
    // A non-collapsed group's tracks still render.
    expect(screen.getByText("SUB BASS")).toBeInTheDocument();
  });

  it("renders the MasterBar at the bottom", () => {
    render(<Arrange />);
    expect(screen.getByText("MASTER")).toBeInTheDocument();
  });

  it("clicking ADD TRACK appends a track via the store", () => {
    const before = useDawStore.getState().tracks.length;
    render(<Arrange />);
    fireEvent.click(screen.getByTitle("Add a new track"));
    expect(useDawStore.getState().tracks).toHaveLength(before + 1);
  });

  it("lays out the body row-reverse when tracksRight is true", () => {
    const { container } = render(<Arrange />);
    // The scrolling body is the .zd-scroll element.
    const body = container.querySelector(".zd-scroll") as HTMLElement;
    expect(body.style.flexDirection).toBe("row");

    useDawStore.setState({ tracksRight: true });
    const { container: c2 } = render(<Arrange />);
    const body2 = c2.querySelector(".zd-scroll") as HTMLElement;
    expect(body2.style.flexDirection).toBe("row-reverse");
  });
});

describe("Arrange marquee selection", () => {
  /** Locate the lanes host: the onPointerDown div with position relative inside the body. */
  function getLanes(container: HTMLElement): HTMLElement {
    const body = container.querySelector(".zd-scroll") as HTMLElement;
    // The lanes column is the second flex child (header column is first in DOM order).
    const lanes = body.querySelector(":scope > div:nth-child(2)") as HTMLElement;
    return lanes;
  }

  it("a plain empty-lane click with no drag clears the clip selection", () => {
    useDawStore.setState({ selClips: ["lead-drop", "kick-i"], selClip: "lead-drop" });
    const { container } = render(<Arrange />);
    const lanes = getLanes(container);
    lanes.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, right: 800, bottom: 400, height: 400, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    // Down then up with no movement -> clearClipSelection on pointerup.
    fireEvent.pointerDown(lanes, { button: 0, clientX: 10, clientY: 10, shiftKey: false });
    globalThis.dispatchEvent(new Event("pointerup"));
    expect(useDawStore.getState().selClips).toEqual([]);
  });

  it("ignores a non-primary button press on the lanes", () => {
    useDawStore.setState({ selClips: ["lead-drop"], selClip: "lead-drop" });
    const { container } = render(<Arrange />);
    const lanes = getLanes(container);
    fireEvent.pointerDown(lanes, { button: 2, clientX: 10, clientY: 10 });
    globalThis.dispatchEvent(new Event("pointerup"));
    // Selection untouched (handler returned early; no pointerup listener registered).
    expect(useDawStore.getState().selClips).toEqual(["lead-drop"]);
  });

  it("dragging the marquee renders a selection rectangle and selects intersecting clips", () => {
    useDawStore.setState({ selClips: [], selClip: "" });
    const { container } = render(<Arrange />);
    const lanes = getLanes(container);
    lanes.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, right: 800, bottom: 400, height: 400, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    // Stub a clip element inside the lanes that intersects the marquee box.
    const fakeClip = document.createElement("div");
    fakeClip.dataset.clipId = "test-clip";
    fakeClip.getBoundingClientRect = () =>
      ({ left: 20, top: 20, width: 40, right: 60, bottom: 60, height: 40, x: 20, y: 20, toJSON: () => {} }) as DOMRect;
    lanes.appendChild(fakeClip);

    fireEvent.pointerDown(lanes, { button: 0, clientX: 0, clientY: 0, shiftKey: false });
    // A pointermove (via startDrag's global listener) drags a box over the clip.
    globalThis.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 100, clientY: 100 }));

    // The marquee rectangle is rendered (an absolutely positioned overlay).
    expect(useDawStore.getState().selClips).toContain("test-clip");
    globalThis.dispatchEvent(new Event("pointerup"));
  });

  it("a click on a clip element does not start a marquee (clips handle their own drag)", () => {
    useDawStore.setState({ selClips: ["lead-drop"], selClip: "lead-drop" });
    const { container } = render(<Arrange />);
    const lanes = getLanes(container);

    const clip = document.createElement("div");
    clip.dataset.clipId = "owned-clip";
    lanes.appendChild(clip);

    // Pointer down targeting the clip element -> handler returns early.
    fireEvent.pointerDown(clip, { button: 0, clientX: 5, clientY: 5 });
    globalThis.dispatchEvent(new Event("pointerup"));
    // Because the marquee never started, selection is unchanged.
    expect(useDawStore.getState().selClips).toEqual(["lead-drop"]);
  });
});

describe("Arrange drop-to-create-track", () => {
  /** Minimal DataTransfer-like stub our dnd helpers understand. */
  function dndStub(item: { kind: string; name: string }): unknown {
    const ITEM_MIME = "application/x-zd-item";
    return {
      types: [ITEM_MIME],
      dropEffect: "",
      getData: (mime: string) => (mime === ITEM_MIME ? JSON.stringify(item) : ""),
      setData: () => {},
    };
  }

  it("dropping an instrument item creates a new track named after it", () => {
    const before = useDawStore.getState().tracks.length;
    render(<Arrange />);
    // The drop target carries this title.
    const dropZone = screen.getByTitle("Drop an instrument or sample here to create a track");

    const dt = dndStub({ kind: "inst", name: "Supersaw Engine" });
    fireEvent.dragOver(dropZone, { dataTransfer: dt });
    fireEvent.drop(dropZone, { dataTransfer: dt });

    const tracks = useDawStore.getState().tracks;
    expect(tracks).toHaveLength(before + 1);
    const added = tracks[tracks.length - 1];
    // trackDefaultsForItem uppercases the item name into the track name.
    expect(added.name).toBe("SUPERSAW ENGINE");
    // addTrack with an instrument seeds a clip named after the instrument.
    expect(added.clips.some((c) => c.name === "Supersaw Engine")).toBe(true);
  });

  it("dropping an FX item does NOT create a track (FX needs a target chain)", () => {
    const before = useDawStore.getState().tracks.length;
    render(<Arrange />);
    const dropZone = screen.getByTitle("Drop an instrument or sample here to create a track");

    const dt = dndStub({ kind: "fx", name: "Hall Reverb" });
    fireEvent.drop(dropZone, { dataTransfer: dt });
    expect(useDawStore.getState().tracks).toHaveLength(before);
  });
});

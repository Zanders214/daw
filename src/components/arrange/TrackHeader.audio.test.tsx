// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackHeader } from "./TrackHeader";
import { useDawStore, type DawState } from "../../store/useDawStore";

// Companion cases for TrackHeader covering the branches the base test misses:
//   - the audio-file load button (pickTrackFile)
//   - the expandable SendRow (sends dials + double-click-to-zero)
//   - the extreme pan label edge (full-right)
// Snapshot every slice TrackHeader / SendRow read or mutate so cases stay
// order-independent; the store is a singleton seeded with demo data.
let snapshot: Partial<DawState>;

beforeEach(() => {
  const s = useDawStore.getState();
  snapshot = {
    selTrack: s.selTrack,
    sendsOpen: { ...s.sendsOpen },
    sends: { ...s.sends },
    pans: { ...s.pans },
    volumes: { ...s.volumes },
    trackFiles: { ...s.trackFiles },
    pickTrackFile: s.pickTrackFile,
    clearTrackFile: s.clearTrackFile,
    setSend: s.setSend,
    tracks: s.tracks,
  };
});

afterEach(() => {
  useDawStore.setState(snapshot);
  vi.restoreAllMocks();
});

const firstTrack = () => useDawStore.getState().tracks[0];

/** Dispatch a global pointer event the way Dial's drag handler reads it. */
function dispatchGlobalPointer(type: "pointermove" | "pointerup", clientY: number) {
  const Ctor = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  globalThis.dispatchEvent(new Ctor(type, { clientY, bubbles: true }));
}

describe("TrackHeader — audio file load/clear", () => {
  it("offers the 'Load an audio file' button when no file is loaded", () => {
    const track = firstTrack();
    useDawStore.setState({ trackFiles: { ...useDawStore.getState().trackFiles, [track.id]: { loaded: false } } });
    render(<TrackHeader track={track} />);
    expect(screen.getByTitle("Load an audio file")).toBeInTheDocument();
    // No file -> no clear (✕) button yet.
    expect(screen.queryByTitle("Clear audio")).not.toBeInTheDocument();
  });

  it("clicking the load button calls pickTrackFile with the track id and stops propagation", () => {
    const track = firstTrack();
    const pick = vi.fn();
    const selectTrack = vi.fn();
    useDawStore.setState({
      trackFiles: { ...useDawStore.getState().trackFiles, [track.id]: { loaded: false } },
      pickTrackFile: pick,
      // Spy on selectTrack to prove the header-body onClick did NOT fire (stopPropagation).
      selectTrack: (id: string) => selectTrack(id),
    });
    render(<TrackHeader track={track} />);

    fireEvent.click(screen.getByTitle("Load an audio file"));
    expect(pick).toHaveBeenCalledWith(track.id);
    expect(selectTrack).not.toHaveBeenCalled();
  });

  it("with a loaded file, the replace-title load button is shown and clear calls clearTrackFile", () => {
    const track = firstTrack();
    const clear = vi.fn();
    useDawStore.setState({
      trackFiles: { ...useDawStore.getState().trackFiles, [track.id]: { loaded: true, name: "loop.wav" } },
      clearTrackFile: (id: string) => clear(id),
    });
    render(<TrackHeader track={track} />);

    // Load button title flips to the "Audio: … — click to replace" form.
    expect(screen.getByTitle("Audio: loop.wav — click to replace")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Clear audio"));
    expect(clear).toHaveBeenCalledWith(track.id);
  });

  it("a loaded file with no name still renders a replace title (Audio:  — click to replace)", () => {
    const track = firstTrack();
    useDawStore.setState({
      trackFiles: { ...useDawStore.getState().trackFiles, [track.id]: { loaded: true } },
    });
    render(<TrackHeader track={track} />);
    // fileName is undefined -> the `?? ""` branch renders an empty name segment.
    // getByTitle normalizes runs of whitespace, so match with a flexible regex.
    expect(screen.getByTitle(/^Audio:\s+— click to replace$/)).toBeInTheDocument();
  });
});

describe("TrackHeader — expandable SendRow", () => {
  it("renders the SENDS row with A and B dials when sendsOpen[id] is true", () => {
    const track = firstTrack();
    useDawStore.setState({
      sendsOpen: { ...useDawStore.getState().sendsOpen, [track.id]: true },
      sends: { ...useDawStore.getState().sends, [track.id]: [0.3, 0.6] },
    });
    render(<TrackHeader track={track} />);

    expect(screen.getByText("SENDS")).toBeInTheDocument();
    expect(screen.getByTitle("Send A (double-click to zero)")).toBeInTheDocument();
    expect(screen.getByTitle("Send B (double-click to zero)")).toBeInTheDocument();
  });

  it("dragging a send dial calls setSend for that track + slot", () => {
    const track = firstTrack();
    const setSend = vi.fn();
    useDawStore.setState({
      sendsOpen: { ...useDawStore.getState().sendsOpen, [track.id]: true },
      sends: { ...useDawStore.getState().sends, [track.id]: [0, 0] },
      setSend: (id: string, idx: number, v: number) => setSend(id, idx, v),
    });
    render(<TrackHeader track={track} />);

    // The Send A dial's drag surface is the svg's parent <div onPointerDown>.
    const wrapA = screen.getByTitle("Send A (double-click to zero)");
    const drag = wrapA.querySelector("svg")!.parentElement as HTMLElement;

    fireEvent.pointerDown(drag, { clientY: 100 });
    dispatchGlobalPointer("pointermove", 60); // drag up -> increase
    dispatchGlobalPointer("pointerup", 60);

    expect(setSend).toHaveBeenCalled();
    const [id, idx] = setSend.mock.calls.at(-1)!;
    expect(id).toBe(track.id);
    expect(idx).toBe(0); // slot A
  });

  it("double-clicking a send dial wrapper zeros that send slot", () => {
    const track = firstTrack();
    const setSend = vi.fn();
    useDawStore.setState({
      sendsOpen: { ...useDawStore.getState().sendsOpen, [track.id]: true },
      sends: { ...useDawStore.getState().sends, [track.id]: [0.5, 0.5] },
      setSend: (id: string, idx: number, v: number) => setSend(id, idx, v),
    });
    render(<TrackHeader track={track} />);

    fireEvent.doubleClick(screen.getByTitle("Send B (double-click to zero)"));
    expect(setSend).toHaveBeenCalledWith(track.id, 1, 0);
  });

  it("falls back to a [0,0] send pair when the track has no sends entry", () => {
    const track = firstTrack();
    const sends = { ...useDawStore.getState().sends };
    delete sends[track.id];
    useDawStore.setState({
      sendsOpen: { ...useDawStore.getState().sendsOpen, [track.id]: true },
      sends,
    });
    // Should render both dials without throwing despite the missing entry.
    render(<TrackHeader track={track} />);
    expect(screen.getByTitle("Send A (double-click to zero)")).toBeInTheDocument();
    expect(screen.getByTitle("Send B (double-click to zero)")).toBeInTheDocument();
  });
});

describe("TrackHeader — pan label edges", () => {
  it("shows a full-right pan label at pan = 1.0", () => {
    const track = firstTrack();
    useDawStore.setState({ pans: { ...useDawStore.getState().pans, [track.id]: 1 } });
    render(<TrackHeader track={track} />);
    // pan 1.0 -> R100
    expect(screen.getByTitle("Pan: R100 (double-click to center)")).toBeInTheDocument();
  });
});

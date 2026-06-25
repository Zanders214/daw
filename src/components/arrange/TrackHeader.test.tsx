// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrackHeader } from "./TrackHeader";
import { useDawStore, type DawState } from "../../store/useDawStore";
import { DEFAULT_VOLUME, MIN_TRACK_H } from "../../lib/constants";

// Snapshot every store slice TrackHeader reads or mutates so cases stay
// order-independent. The store is a singleton seeded with demo data at import.
let snapshot: Partial<DawState>;

beforeEach(() => {
  const s = useDawStore.getState();
  snapshot = {
    selTrack: s.selTrack,
    mutes: { ...s.mutes },
    solos: { ...s.solos },
    arms: { ...s.arms },
    autoLanes: { ...s.autoLanes },
    sendsOpen: { ...s.sendsOpen },
    volumes: { ...s.volumes },
    pans: { ...s.pans },
    trackHeights: { ...s.trackHeights },
    trackFiles: { ...s.trackFiles },
    tracks: s.tracks,
  };
});

afterEach(() => {
  useDawStore.setState(snapshot);
});

const firstTrack = () => useDawStore.getState().tracks[0];

// startUiResize attaches pointermove/pointerup to globalThis; happy-dom may lack
// PointerEvent, so fall back to MouseEvent (the handler only reads clientY).
const PtrEvent = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
const movePointerY = (clientY: number) =>
  (globalThis as unknown as Window).dispatchEvent(new PtrEvent("pointermove", { clientY, clientX: 0, bubbles: true }));
const releasePointer = () =>
  (globalThis as unknown as Window).dispatchEvent(new PtrEvent("pointerup", { bubbles: true }));

describe("TrackHeader", () => {
  it("renders the track name and IO label", () => {
    const track = firstTrack();
    render(<TrackHeader track={track} />);
    expect(screen.getByText(track.name)).toBeInTheDocument();
    expect(screen.getByText(track.io)).toBeInTheDocument();
  });

  it("dragging the bottom grip resizes track height and clamps to the minimum", () => {
    const track = firstTrack();
    render(<TrackHeader track={track} />);
    const grip = screen.getByTitle("Drag to resize track height");

    // Default height 108; drag down +100 → 208.
    fireEvent.pointerDown(grip, { button: 0, clientX: 0, clientY: 20 });
    movePointerY(120);
    releasePointer();
    expect(useDawStore.getState().trackHeights[track.id]).toBe(208);

    // Drag far up (208 + (0 - 200) = 8) → clamps to MIN_TRACK_H.
    fireEvent.pointerDown(grip, { button: 0, clientX: 0, clientY: 200 });
    movePointerY(0);
    releasePointer();
    expect(useDawStore.getState().trackHeights[track.id]).toBe(MIN_TRACK_H);
  });

  it("renders the M / S / A mixer buttons and the arm dot", () => {
    render(<TrackHeader track={firstTrack()} />);
    expect(screen.getByRole("button", { name: "M" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "S" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
    // The arm button is the "●" glyph.
    expect(screen.getByRole("button", { name: "●" })).toBeInTheDocument();
  });

  it("renders the color/mute swatch and the action buttons by title", () => {
    render(<TrackHeader track={firstTrack()} />);
    expect(screen.getByTitle("Mute / unmute")).toBeInTheDocument();
    expect(screen.getByTitle("Aux sends")).toBeInTheDocument();
    expect(screen.getByTitle("Load an audio file")).toBeInTheDocument();
    expect(screen.getByTitle("Delete track")).toBeInTheDocument();
    expect(screen.getByTitle("Automation lane")).toBeInTheDocument();
  });

  it("toggles mute in the store when the color swatch is clicked", () => {
    const track = firstTrack();
    // Start from a known un-muted state for this case.
    useDawStore.setState({ mutes: { ...useDawStore.getState().mutes, [track.id]: false } });

    render(<TrackHeader track={track} />);
    fireEvent.click(screen.getByTitle("Mute / unmute"));

    expect(useDawStore.getState().mutes[track.id]).toBe(true);

    // A second click un-mutes.
    fireEvent.click(screen.getByTitle("Mute / unmute"));
    expect(!!useDawStore.getState().mutes[track.id]).toBe(false);
  });

  it("toggles mute via the M button too", () => {
    const track = firstTrack();
    useDawStore.setState({ mutes: { ...useDawStore.getState().mutes, [track.id]: false } });
    render(<TrackHeader track={track} />);
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    expect(useDawStore.getState().mutes[track.id]).toBe(true);
  });

  it("toggles solo and arm via the S and ● buttons", () => {
    const track = firstTrack();
    render(<TrackHeader track={track} />);

    const soloBefore = !!useDawStore.getState().solos[track.id];
    fireEvent.click(screen.getByRole("button", { name: "S" }));
    expect(useDawStore.getState().solos[track.id]).toBe(!soloBefore);

    // Arm may be seeded on or off in the demo data, so assert it flips.
    const armBefore = !!useDawStore.getState().arms[track.id];
    fireEvent.click(screen.getByRole("button", { name: "●" }));
    expect(!!useDawStore.getState().arms[track.id]).toBe(!armBefore);
  });

  it("selects the track when the header body is clicked", () => {
    const track = firstTrack();
    useDawStore.setState({ selTrack: undefined });
    render(<TrackHeader track={track} />);

    // Click the track name (inside the body, not a stop-propagation control).
    fireEvent.click(screen.getByText(track.name));
    expect(useDawStore.getState().selTrack).toBe(track.id);
  });

  it("opens and closes the automation lane via the A button", () => {
    const track = firstTrack();
    useDawStore.setState({ autoLanes: { ...useDawStore.getState().autoLanes, [track.id]: false } });
    render(<TrackHeader track={track} />);

    fireEvent.click(screen.getByRole("button", { name: "A" }));
    expect(useDawStore.getState().autoLanes[track.id]).toBe(true);
  });

  it("toggles the aux sends row open via the ⇄ button", () => {
    const track = firstTrack();
    useDawStore.setState({ sendsOpen: { ...useDawStore.getState().sendsOpen, [track.id]: false } });
    render(<TrackHeader track={track} />);

    fireEvent.click(screen.getByTitle("Aux sends"));
    expect(useDawStore.getState().sendsOpen[track.id]).toBe(true);
  });

  it("removes the track when the delete button is clicked", () => {
    const track = firstTrack();
    expect(useDawStore.getState().tracks.some((t) => t.id === track.id)).toBe(true);

    render(<TrackHeader track={track} />);
    fireEvent.click(screen.getByTitle("Delete track"));

    expect(useDawStore.getState().tracks.some((t) => t.id === track.id)).toBe(false);
  });

  it("shows the centered pan label and a dB volume readout by default", () => {
    const track = firstTrack();
    useDawStore.setState({
      pans: { ...useDawStore.getState().pans, [track.id]: 0.5 },
      volumes: { ...useDawStore.getState().volumes, [track.id]: DEFAULT_VOLUME },
    });
    render(<TrackHeader track={track} />);

    // Pan 0.5 -> centered, the dial wrapper title reflects "C".
    expect(screen.getByTitle("Pan: C (double-click to center)")).toBeInTheDocument();

    // VOL label is always present.
    expect(screen.getByText("VOL")).toBeInTheDocument();
    // DEFAULT_VOLUME of 1.0 reads as 0.0 dB; any non-silent value shows " dB".
    const dbText = screen.getByText(/dB$|^-∞$/);
    expect(dbText).toBeInTheDocument();
  });

  it("reflects a panned-left value in the pan title", () => {
    const track = firstTrack();
    useDawStore.setState({ pans: { ...useDawStore.getState().pans, [track.id]: 0.25 } });
    render(<TrackHeader track={track} />);
    // 0.25 -> L50
    expect(screen.getByTitle("Pan: L50 (double-click to center)")).toBeInTheDocument();
  });

  it("shows -∞ for a silenced volume", () => {
    const track = firstTrack();
    useDawStore.setState({ volumes: { ...useDawStore.getState().volumes, [track.id]: 0 } });
    render(<TrackHeader track={track} />);
    expect(screen.getByText("-∞")).toBeInTheDocument();
  });

  it("reflects a loaded audio file: shows replace title and a clear button", () => {
    const track = firstTrack();
    useDawStore.setState({
      trackFiles: {
        ...useDawStore.getState().trackFiles,
        [track.id]: { loaded: true, name: "kick.wav" },
      },
    });
    render(<TrackHeader track={track} />);

    expect(screen.getByTitle("Audio: kick.wav — click to replace")).toBeInTheDocument();
    expect(screen.getByTitle("Clear audio")).toBeInTheDocument();

    // Clearing the file calls the store action.
    fireEvent.click(screen.getByTitle("Clear audio"));
    expect(!!useDawStore.getState().trackFiles[track.id]?.loaded).toBe(false);
  });
});

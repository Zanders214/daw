// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TransportBar } from "./TransportBar";
import { Settings } from "./Settings";
import { Sessions } from "./Sessions";
import { useDawStore } from "../store/useDawStore";

// Snapshot the slice of store state this component reads/mutates so tests stay
// order-independent.
type TransportSnapshot = {
  playing: boolean;
  recording: boolean;
  loop: boolean;
  metronome: boolean;
  bpm: number;
  playhead: number;
  master: number;
  settingsOpen: boolean;
  sessionsOpen: boolean;
  currentSessionName: string | null;
};

let snapshot: TransportSnapshot;

beforeEach(() => {
  const s = useDawStore.getState();
  snapshot = {
    playing: s.playing,
    recording: s.recording,
    loop: s.loop,
    metronome: s.metronome,
    bpm: s.bpm,
    playhead: s.playhead,
    master: s.master,
    settingsOpen: s.settingsOpen,
    sessionsOpen: s.sessionsOpen,
    currentSessionName: s.currentSessionName,
  };
});

afterEach(() => {
  useDawStore.setState(snapshot);
});

describe("TransportBar", () => {
  it("renders the brand wordmark and PLAY / REC / LOOP transport controls", () => {
    // Known idle defaults.
    useDawStore.setState({ playing: false, recording: false, loop: false, currentSessionName: null });
    render(<TransportBar />);

    expect(screen.getByText("Zanders")).toBeInTheDocument();
    expect(screen.getByText("Studio")).toBeInTheDocument();

    // GlowButton shows idleLabel while idle.
    expect(screen.getByRole("button", { name: "PLAY" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "REC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LOOP" })).toBeInTheDocument();
  });

  it("shows the SESSIONS placeholder when there is no current session", () => {
    useDawStore.setState({ currentSessionName: null });
    render(<TransportBar />);
    expect(screen.getByText("SESSIONS")).toBeInTheDocument();
  });

  it("shows the current session name when one is set", () => {
    useDawStore.setState({ currentSessionName: "My Jam" });
    render(<TransportBar />);
    expect(screen.getByText("My Jam")).toBeInTheDocument();
    expect(screen.queryByText("SESSIONS")).not.toBeInTheDocument();
  });

  it("renders tempo and time-signature readouts", () => {
    useDawStore.setState({ bpm: 124 });
    render(<TransportBar />);

    expect(screen.getByText("TEMPO")).toBeInTheDocument();
    expect(screen.getByText("124")).toBeInTheDocument();
    expect(screen.getByText("BPM")).toBeInTheDocument();

    expect(screen.getByText("SIG")).toBeInTheDocument();
    expect(screen.getByText("4/4")).toBeInTheDocument();
  });

  it("renders the POSITION readout in bar.beat.sixteenth form", () => {
    // playhead 64 => bar = floor(64/4)+1 = 17, beat = 1, six = 1.
    useDawStore.setState({ playhead: 64 });
    render(<TransportBar />);
    expect(screen.getByText("POSITION")).toBeInTheDocument();
    expect(screen.getByText("17.1.1")).toBeInTheDocument();
  });

  it("renders the MASTER meter cluster with -∞ readout when stopped", () => {
    useDawStore.setState({ playing: false });
    render(<TransportBar />);
    expect(screen.getByText("MASTER")).toBeInTheDocument();
    expect(screen.getByText("-∞")).toBeInTheDocument();
  });

  it("renders the MASTER dB readout when playing", () => {
    useDawStore.setState({ playing: true, master: 1 });
    render(<TransportBar />);
    // masterDb = (-(1 - 1) * 18).toFixed(1) + " dB" => "0.0 dB"
    expect(screen.getByText("0.0 dB")).toBeInTheDocument();
  });

  it("clicking PLAY toggles the store play state and the button caption", () => {
    useDawStore.setState({ playing: false });
    render(<TransportBar />);

    const playBtn = screen.getByRole("button", { name: "PLAY" });
    expect(useDawStore.getState().playing).toBe(false);

    fireEvent.click(playBtn);

    expect(useDawStore.getState().playing).toBe(true);
    // Engaged GlowButton swaps to its children caption.
    expect(screen.getByRole("button", { name: "PLAYING" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PLAY" })).not.toBeInTheDocument();
  });

  it("clicking REC toggles the store recording state", () => {
    useDawStore.setState({ recording: false });
    render(<TransportBar />);

    fireEvent.click(screen.getByRole("button", { name: "REC" }));
    expect(useDawStore.getState().recording).toBe(true);
  });

  it("clicking LOOP toggles the store loop state", () => {
    useDawStore.setState({ loop: false });
    render(<TransportBar />);

    fireEvent.click(screen.getByRole("button", { name: "LOOP" }));
    expect(useDawStore.getState().loop).toBe(true);
  });

  it("clicking the metronome button toggles metronome state", () => {
    useDawStore.setState({ metronome: false });
    render(<TransportBar />);

    fireEvent.click(screen.getByTitle("Metronome"));
    expect(useDawStore.getState().metronome).toBe(true);
  });

  it("clicking the settings dot opens settings", () => {
    useDawStore.setState({ settingsOpen: false });
    render(<TransportBar />);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(useDawStore.getState().settingsOpen).toBe(true);
  });

  it("clicking the sessions button opens sessions", () => {
    useDawStore.setState({ sessionsOpen: false, currentSessionName: null });
    render(<TransportBar />);

    fireEvent.click(screen.getByText("SESSIONS"));
    expect(useDawStore.getState().sessionsOpen).toBe(true);
  });

  // End-to-end of the dead-button fix: clicking the toolbar control must reveal
  // the panel and leave it open (the opening click must not dismiss it).
  it("opening Settings from the toolbar reveals the panel and keeps it open", () => {
    useDawStore.setState({ settingsOpen: false });
    render(<><TransportBar /><Settings /></>);

    expect(screen.queryByText("Zanders Studio · session preferences")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(useDawStore.getState().settingsOpen).toBe(true);
    expect(screen.getByText("Zanders Studio · session preferences")).toBeInTheDocument();
  });

  it("opening Sessions from the toolbar reveals the panel and keeps it open", () => {
    useDawStore.setState({ sessionsOpen: false, currentSessionName: null });
    render(<><TransportBar /><Sessions /></>);

    fireEvent.click(screen.getByText("SESSIONS"));
    expect(useDawStore.getState().sessionsOpen).toBe(true);
    // The "Sessions" panel heading is now present (distinct from the toolbar button).
    expect(screen.getByText("Untitled session")).toBeInTheDocument();
  });

  it("rewind resets the playhead to zero", () => {
    useDawStore.setState({ playhead: 64 });
    render(<TransportBar />);
    expect(screen.getByText("17.1.1")).toBeInTheDocument();

    // The rewind (⏮) button is the first plain transport button.
    fireEvent.click(screen.getByRole("button", { name: "⏮" }));
    expect(useDawStore.getState().playhead).toBe(0);
    // bar.beat.sixteenth for playhead 0 => 01.1.1
    expect(screen.getByText("01.1.1")).toBeInTheDocument();
  });

  it("stop resets play state and playhead", () => {
    useDawStore.setState({ playing: true, playhead: 64 });
    render(<TransportBar />);

    // Stop is the square button: it has no accessible name, find by its container.
    // It is the button with neither a name nor a title among transport buttons;
    // grab all buttons and pick the stop one via the playhead effect.
    const buttons = screen.getAllByRole("button");
    const stopBtn = buttons.find(
      (b) =>
        b.getAttribute("title") === null &&
        b.textContent === "" &&
        b !== screen.getByRole("button", { name: "Settings" }),
    );
    expect(stopBtn).toBeTruthy();
    fireEvent.click(stopBtn as HTMLElement);

    expect(useDawStore.getState().playing).toBe(false);
    expect(useDawStore.getState().playhead).toBe(0);
  });

  it("double-clicking the TEMPO pill opens an editable input committing a new bpm", () => {
    useDawStore.setState({ bpm: 124 });
    render(<TransportBar />);

    const tempoPill = screen.getByText("TEMPO").parentElement as HTMLElement;
    fireEvent.doubleClick(tempoPill);

    const input = within(tempoPill).getByRole("spinbutton") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.value).toBe("124");

    fireEvent.change(input, { target: { value: "90" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(useDawStore.getState().bpm).toBe(90);
    // Back to read-only display.
    expect(screen.getByText("90")).toBeInTheDocument();
  });

  it("Escape in the tempo input cancels the edit without changing bpm", () => {
    useDawStore.setState({ bpm: 124 });
    render(<TransportBar />);

    const tempoPill = screen.getByText("TEMPO").parentElement as HTMLElement;
    fireEvent.doubleClick(tempoPill);

    const input = within(tempoPill).getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "200" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(useDawStore.getState().bpm).toBe(124);
    expect(screen.getByText("124")).toBeInTheDocument();
  });

  it("blurring the tempo input with a non-numeric value leaves bpm unchanged", () => {
    useDawStore.setState({ bpm: 124 });
    render(<TransportBar />);

    const tempoPill = screen.getByText("TEMPO").parentElement as HTMLElement;
    fireEvent.doubleClick(tempoPill);

    const input = within(tempoPill).getByRole("spinbutton") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    // Number.parseFloat("") is NaN -> setBpm not called.
    expect(useDawStore.getState().bpm).toBe(124);
  });
});

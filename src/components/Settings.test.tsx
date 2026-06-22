// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Settings } from "./Settings";
import { useDawStore } from "../store/useDawStore";
import { OUTPUT_DEVICES, MIDI_INPUTS } from "../data/seed";

// Snapshot the slice of store state this component reads/mutates so tests stay
// order-independent.
type SettingsSnapshot = {
  settingsOpen: boolean;
  theme: ReturnType<typeof useDawStore.getState>["theme"];
  tracksRight: boolean;
  showGrid: boolean;
  vibrantClips: boolean;
  sampleRate: number;
  bufferSize: number;
  outputDevice: string;
  availableOutputs: string[];
  availableSampleRates: number[];
  availableBufferSizes: number[];
  midiInput: string;
  midiThru: boolean;
  metronome: boolean;
  countIn: number;
  autoSave: boolean;
};

let snapshot: SettingsSnapshot;

beforeEach(() => {
  const s = useDawStore.getState();
  snapshot = {
    settingsOpen: s.settingsOpen,
    theme: s.theme,
    tracksRight: s.tracksRight,
    showGrid: s.showGrid,
    vibrantClips: s.vibrantClips,
    sampleRate: s.sampleRate,
    bufferSize: s.bufferSize,
    outputDevice: s.outputDevice,
    availableOutputs: s.availableOutputs,
    availableSampleRates: s.availableSampleRates,
    availableBufferSizes: s.availableBufferSizes,
    midiInput: s.midiInput,
    midiThru: s.midiThru,
    metronome: s.metronome,
    countIn: s.countIn,
    autoSave: s.autoSave,
  };
});

afterEach(() => {
  useDawStore.setState(snapshot);
});

function openSettings() {
  useDawStore.setState({ settingsOpen: true });
}

// Walk up from a row's label text to the Row container element that holds the
// row's control (the nearest ancestor containing a [role=switch]).
function rowFor(label: string): HTMLElement {
  let el: HTMLElement | null = screen.getByText(label);
  while (el && !el.querySelector('[role="switch"]')) {
    el = el.parentElement;
  }
  if (!el) throw new Error(`No switch row found for label: ${label}`);
  return el;
}

describe("Settings", () => {
  it("renders nothing while settingsOpen is false", () => {
    useDawStore.setState({ settingsOpen: false });
    const { container } = render(<Settings />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the panel header and all section labels when open", () => {
    openSettings();
    render(<Settings />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Zanders Studio · session preferences")).toBeInTheDocument();

    // Section headings.
    expect(screen.getByText("APPEARANCE")).toBeInTheDocument();
    expect(screen.getByText("AUDIO ENGINE")).toBeInTheDocument();
    expect(screen.getByText("MIDI")).toBeInTheDocument();
    expect(screen.getByText("RECORDING")).toBeInTheDocument();
  });

  it("renders each row label", () => {
    openSettings();
    render(<Settings />);

    for (const label of [
      "Theme",
      "Track list side",
      "Show grid",
      "Spectrum clips",
      "Output device",
      "Sample rate",
      "Buffer size",
      "Round-trip latency",
      "Input device",
      "MIDI thru",
      "Metronome",
      "Count-in",
      "Auto-save",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("computes the round-trip latency from buffer size and sample rate", () => {
    // 256 / (48 * 1000) * 2000 = 10.7 (toFixed(1))
    useDawStore.setState({ settingsOpen: true, sampleRate: 48, bufferSize: 256 });
    render(<Settings />);
    expect(screen.getByText("10.7")).toBeInTheDocument();
    expect(screen.getByText("ms")).toBeInTheDocument();
  });

  it("changes the theme when a theme segment is clicked", () => {
    useDawStore.setState({ settingsOpen: true, theme: "dark" });
    render(<Settings />);

    fireEvent.click(screen.getByRole("button", { name: "LIGHT" }));
    expect(useDawStore.getState().theme).toBe("light");

    fireEvent.click(screen.getByRole("button", { name: "MIDNIGHT" }));
    expect(useDawStore.getState().theme).toBe("midnight");
  });

  it("moves the track list to the right and back via the segmented control", () => {
    useDawStore.setState({ settingsOpen: true, tracksRight: false });
    render(<Settings />);

    fireEvent.click(screen.getByRole("button", { name: "RIGHT" }));
    expect(useDawStore.getState().tracksRight).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "LEFT" }));
    expect(useDawStore.getState().tracksRight).toBe(false);
  });

  it("toggles the show-grid switch", () => {
    useDawStore.setState({ settingsOpen: true, showGrid: true });
    render(<Settings />);

    const gridRow = rowFor("Show grid");
    const sw = within(gridRow).getByRole("switch");
    expect(sw).toHaveAttribute("aria-checked", "true");

    fireEvent.click(sw);
    expect(useDawStore.getState().showGrid).toBe(false);
    expect(within(gridRow).getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("toggles the vibrant-clips switch", () => {
    useDawStore.setState({ settingsOpen: true, vibrantClips: false });
    render(<Settings />);

    const sw = within(rowFor("Spectrum clips")).getByRole("switch");
    fireEvent.click(sw);
    expect(useDawStore.getState().vibrantClips).toBe(true);
  });

  it("toggles a switch via keyboard (Enter)", () => {
    useDawStore.setState({ settingsOpen: true, metronome: false });
    render(<Settings />);

    const sw = within(rowFor("Metronome")).getByRole("switch");
    fireEvent.keyDown(sw, { key: "Enter" });
    expect(useDawStore.getState().metronome).toBe(true);
  });

  it("toggles a switch via keyboard (Space)", () => {
    useDawStore.setState({ settingsOpen: true, autoSave: false });
    render(<Settings />);

    const sw = within(rowFor("Auto-save")).getByRole("switch");
    fireEvent.keyDown(sw, { key: " " });
    expect(useDawStore.getState().autoSave).toBe(true);
  });

  it("toggles MIDI thru", () => {
    useDawStore.setState({ settingsOpen: true, midiThru: true });
    render(<Settings />);

    const sw = within(rowFor("MIDI thru")).getByRole("switch");
    fireEvent.click(sw);
    expect(useDawStore.getState().midiThru).toBe(false);
  });

  it("falls back to seed output devices and lets the user pick one", () => {
    useDawStore.setState({
      settingsOpen: true,
      availableOutputs: [],
      outputDevice: OUTPUT_DEVICES[0],
    });
    render(<Settings />);

    const select = screen.getByDisplayValue(OUTPUT_DEVICES[0]) as HTMLSelectElement;
    // Seed devices populate the dropdown.
    for (const d of OUTPUT_DEVICES) {
      expect(within(select).getByRole("option", { name: d })).toBeInTheDocument();
    }

    fireEvent.change(select, { target: { value: OUTPUT_DEVICES[1] } });
    expect(useDawStore.getState().outputDevice).toBe(OUTPUT_DEVICES[1]);
  });

  it("prefers the engine-provided output device list when available", () => {
    useDawStore.setState({
      settingsOpen: true,
      availableOutputs: ["Engine Card A", "Engine Card B"],
      outputDevice: "Engine Card A",
    });
    render(<Settings />);

    const select = screen.getByDisplayValue("Engine Card A");
    expect(within(select).getByRole("option", { name: "Engine Card B" })).toBeInTheDocument();
    // Seed-only device should not appear.
    expect(within(select).queryByRole("option", { name: OUTPUT_DEVICES[1] })).toBeNull();
  });

  it("renders the MIDI input dropdown from seed inputs and picks one", () => {
    useDawStore.setState({ settingsOpen: true, midiInput: MIDI_INPUTS[0] });
    render(<Settings />);

    const select = screen.getByDisplayValue(MIDI_INPUTS[0]);
    fireEvent.change(select, { target: { value: MIDI_INPUTS[1] } });
    expect(useDawStore.getState().midiInput).toBe(MIDI_INPUTS[1]);
  });

  it("uses fallback sample-rate and buffer-size options and applies a pick", () => {
    useDawStore.setState({
      settingsOpen: true,
      availableSampleRates: [],
      availableBufferSizes: [],
      sampleRate: 48,
      bufferSize: 256,
    });
    render(<Settings />);

    // Fallback rate option 96 kHz exists.
    fireEvent.click(screen.getByRole("button", { name: "96" }));
    expect(useDawStore.getState().sampleRate).toBe(96);

    // Fallback buffer option 64 exists.
    fireEvent.click(screen.getByRole("button", { name: "64" }));
    expect(useDawStore.getState().bufferSize).toBe(64);
  });

  it("renders engine-provided sample-rate and buffer-size options when present", () => {
    useDawStore.setState({
      settingsOpen: true,
      availableSampleRates: [44.1, 88.2],
      availableBufferSizes: [32, 1024],
      sampleRate: 44.1,
      bufferSize: 1024,
    });
    render(<Settings />);

    expect(screen.getByRole("button", { name: "88.2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "32" }));
    expect(useDawStore.getState().bufferSize).toBe(32);
  });

  it("changes the count-in via the segmented control", () => {
    useDawStore.setState({ settingsOpen: true, countIn: 1 });
    render(<Settings />);

    fireEvent.click(screen.getByRole("button", { name: "2 BARS" }));
    expect(useDawStore.getState().countIn).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "OFF" }));
    expect(useDawStore.getState().countIn).toBe(0);
  });

  it("closes via the ✕ button", () => {
    openSettings();
    render(<Settings />);

    fireEvent.click(screen.getByTitle("Close"));
    expect(useDawStore.getState().settingsOpen).toBe(false);
  });

  it("closes when the backdrop is clicked", () => {
    openSettings();
    const { container } = render(<Settings />);

    // The outermost div is the backdrop overlay.
    const backdrop = container.firstElementChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(useDawStore.getState().settingsOpen).toBe(false);
  });

  it("does not close when an inner panel area is clicked", () => {
    openSettings();
    render(<Settings />);

    // Clicking a label inside the dialog should not bubble a close.
    fireEvent.click(screen.getByText("Settings"));
    expect(useDawStore.getState().settingsOpen).toBe(true);
  });

  it("closes on Escape key", () => {
    openSettings();
    const { container } = render(<Settings />);

    const backdrop = container.firstElementChild as HTMLElement;
    fireEvent.keyDown(backdrop, { key: "Escape" });
    expect(useDawStore.getState().settingsOpen).toBe(false);
  });
});

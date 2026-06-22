// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MasterBar } from "./MasterBar";
import { useDawStore } from "../../store/useDawStore";

// Snapshot the slice of store state this component reads / mutates so tests
// stay order-independent.
type MasterSnapshot = {
  master: number;
  playing: boolean;
  masterVolume: number;
  masterPan: number;
  returnGains: number[];
  returnLevels: number[];
  selTrack: string;
  rackOpen: boolean;
};

let snapshot: MasterSnapshot;

beforeEach(() => {
  const s = useDawStore.getState();
  snapshot = {
    master: s.master,
    playing: s.playing,
    masterVolume: s.masterVolume,
    masterPan: s.masterPan,
    returnGains: [...s.returnGains],
    returnLevels: [...s.returnLevels],
    selTrack: s.selTrack,
    rackOpen: s.rackOpen,
  };
});

afterEach(() => {
  useDawStore.setState(snapshot);
});

/** Find the interactive Slider rail (the ew-resize cursor div). */
function getSliderRail(container: HTMLElement): HTMLElement {
  const rail = Array.from(container.querySelectorAll("div")).find(
    (el) => el.style.cursor === "ew-resize",
  );
  if (!rail) throw new Error("slider rail not found");
  return rail;
}

/** Find all interactive Dial hit-areas (ns-resize cursor divs). */
function getDialHitAreas(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll("div")).filter(
    (el) => el.style.cursor === "ns-resize",
  );
}

describe("MasterBar", () => {
  it("renders the MASTER label, CHAIN button and the static master chips", () => {
    render(<MasterBar tracksRight={false} />);

    expect(screen.getByText("MASTER")).toBeInTheDocument();
    expect(screen.getByText("CHAIN ▸")).toBeInTheDocument();
    expect(screen.getByText("DIM")).toBeInTheDocument();
    expect(screen.getByText("MONO")).toBeInTheDocument();
    expect(screen.getByText("−14 LUFS")).toBeInTheDocument();
    expect(screen.getByText("EQ")).toBeInTheDocument();
    expect(screen.getByText("LIMITER")).toBeInTheDocument();
  });

  it("renders the master section labels and aux return controls", () => {
    render(<MasterBar tracksRight={false} />);

    expect(screen.getByText("MASTER OUT")).toBeInTheDocument();
    expect(screen.getByText("VOLUME")).toBeInTheDocument();
    expect(screen.getByText("PAN")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RET A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RET B" })).toBeInTheDocument();
  });

  it("shows -∞ for the master-out readout while stopped and a dB value while playing", () => {
    useDawStore.setState({ playing: false, master: 0.5 });
    const { rerender } = render(<MasterBar tracksRight={false} />);
    expect(screen.getByText("-∞")).toBeInTheDocument();

    // While playing, masterDb = (-(1 - master) * 18).toFixed(1) + " dB"
    // master 0.5 -> -(0.5)*18 = -9.0 dB
    useDawStore.setState({ playing: true, master: 0.5 });
    rerender(<MasterBar tracksRight={false} />);
    expect(screen.getByText("-9.0 dB")).toBeInTheDocument();
  });

  it("formats the master volume readout in dB (log scale) and -∞ at silence", () => {
    // masterVolume 1 -> 20*log10(1) = 0.0 dB
    useDawStore.setState({ masterVolume: 1 });
    const { rerender } = render(<MasterBar tracksRight={false} />);
    expect(screen.getByText("0.0 dB")).toBeInTheDocument();

    // masterVolume <= 0.001 -> -∞
    useDawStore.setState({ masterVolume: 0 });
    rerender(<MasterBar tracksRight={false} />);
    // Both MASTER OUT (stopped) and VOLUME can show -∞; assert at least one.
    expect(screen.getAllByText("-∞").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the pan readout as C when centered and L/R when offset", () => {
    useDawStore.setState({ masterPan: 0.5 });
    const { rerender } = render(<MasterBar tracksRight={false} />);
    expect(screen.getByText("C")).toBeInTheDocument();

    // 0.25 < 0.5 -> L{round((0.5-0.25)*200)} = L50
    useDawStore.setState({ masterPan: 0.25 });
    rerender(<MasterBar tracksRight={false} />);
    expect(screen.getByText("L50")).toBeInTheDocument();

    // 0.75 > 0.5 -> R{round((0.75-0.5)*200)} = R50
    useDawStore.setState({ masterPan: 0.75 });
    rerender(<MasterBar tracksRight={false} />);
    expect(screen.getByText("R50")).toBeInTheDocument();
  });

  it("dragging the volume fader writes masterVolume to the store", () => {
    useDawStore.setState({ masterVolume: 1 });
    const { container } = render(<MasterBar tracksRight={false} />);
    const rail = getSliderRail(container);
    rail.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, right: 200, bottom: 0, height: 18, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    // clientX 50 of width 200 -> 0.25
    fireEvent.pointerDown(rail, { clientX: 50 });
    expect(useDawStore.getState().masterVolume).toBeCloseTo(0.25, 5);
  });

  it("double-clicking the pan dial recenters masterPan to 0.5", () => {
    useDawStore.setState({ masterPan: 0.2 });
    render(<MasterBar tracksRight={false} />);

    // The PAN dial wrapper carries the centering title.
    const panWrap = screen.getByTitle("Master pan (double-click to center)");
    fireEvent.doubleClick(panWrap);
    expect(useDawStore.getState().masterPan).toBe(0.5);
  });

  it("double-clicking a return-level wrapper resets that return gain to 1", () => {
    useDawStore.setState({ returnGains: [0.3, 0.4] });
    render(<MasterBar tracksRight={false} />);

    const retALevel = screen.getByTitle("Return A level");
    fireEvent.doubleClick(retALevel);
    const gains = useDawStore.getState().returnGains;
    expect(gains[0]).toBe(1);
    // The other return is untouched.
    expect(gains[1]).toBeCloseTo(0.4, 5);
  });

  it("clicking RET A / RET B opens that return's chain and selects it", () => {
    useDawStore.setState({ selTrack: "lead", rackOpen: false });
    render(<MasterBar tracksRight={false} />);

    fireEvent.click(screen.getByRole("button", { name: "RET A" }));
    expect(useDawStore.getState().selTrack).toBe("return-0");
    expect(useDawStore.getState().rackOpen).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "RET B" }));
    expect(useDawStore.getState().selTrack).toBe("return-1");
  });

  it("clicking the master header opens the master chain", () => {
    useDawStore.setState({ selTrack: "lead", rackOpen: false });
    render(<MasterBar tracksRight={false} />);

    fireEvent.click(screen.getByTitle("Open master chain"));
    expect(useDawStore.getState().selTrack).toBe("master");
    expect(useDawStore.getState().rackOpen).toBe(true);
  });

  it("highlights the selected return button when selTrack matches", () => {
    useDawStore.setState({ selTrack: "return-1" });
    render(<MasterBar tracksRight={false} />);

    const retB = screen.getByRole("button", { name: "RET B" });
    // Selected return uses the accent color; unselected uses the label color.
    expect(retB.style.color).toBe("var(--accent)");

    const retA = screen.getByRole("button", { name: "RET A" });
    expect(retA.style.color).toBe("var(--text-label)");
  });

  it("lays out row-reverse when tracksRight is true and row otherwise", () => {
    const { container: a } = render(<MasterBar tracksRight={true} />);
    expect((a.firstChild as HTMLElement).style.flexDirection).toBe("row-reverse");

    const { container: b } = render(<MasterBar tracksRight={false} />);
    expect((b.firstChild as HTMLElement).style.flexDirection).toBe("row");
  });

  it("renders interactive dials for pan and both returns (ns-resize hit areas)", () => {
    const { container } = render(<MasterBar tracksRight={false} />);
    // One master-pan dial + two return dials = 3 interactive dials.
    expect(getDialHitAreas(container).length).toBe(3);
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  AutomationLane,
  AutomationChips,
  TRACK_AUTO_PARAMS,
  GROUP_AUTO_PARAMS,
} from "./AutomationLane";
import { useDawStore } from "../../store/useDawStore";
import { getAutoPts } from "../../lib/automation";

// The lane reads autoParam / autoData and dispatches add/move/delete actions;
// snapshot those slices so each test is order-independent.
type AutoSnapshot = {
  autoParam: Record<string, string>;
  autoData: Record<string, unknown>;
  playhead: number;
};

let snapshot: AutoSnapshot;

beforeEach(() => {
  const s = useDawStore.getState();
  snapshot = {
    autoParam: { ...s.autoParam },
    autoData: { ...s.autoData },
    playhead: s.playhead,
  };
});

afterEach(() => {
  useDawStore.setState({
    autoParam: snapshot.autoParam,
    autoData: snapshot.autoData as never,
    playhead: snapshot.playhead,
  });
});

describe("TRACK_AUTO_PARAMS / GROUP_AUTO_PARAMS", () => {
  it("exposes the four automatable track params with labels", () => {
    expect(TRACK_AUTO_PARAMS).toEqual([
      ["vol", "VOL"],
      ["pan", "PAN"],
      ["sendA", "SEND A"],
      ["sendB", "SEND B"],
    ]);
  });

  it("exposes only vol/pan for groups", () => {
    expect(GROUP_AUTO_PARAMS).toEqual([
      ["vol", "VOL"],
      ["pan", "PAN"],
    ]);
    expect(GROUP_AUTO_PARAMS.map(([v]) => v)).not.toContain("sendA");
  });
});

describe("AutomationChips", () => {
  it("renders the AUTO label and one chip per param", () => {
    render(<AutomationChips nodeId="kick" color="#34d8ff" params={TRACK_AUTO_PARAMS} />);
    expect(screen.getByText("AUTO")).toBeInTheDocument();
    for (const [, label] of TRACK_AUTO_PARAMS) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("renders the group param subset when passed GROUP_AUTO_PARAMS", () => {
    render(<AutomationChips nodeId="g-bass" color="#8b7bff" params={GROUP_AUTO_PARAMS} />);
    expect(screen.getByRole("button", { name: "VOL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PAN" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SEND A" })).not.toBeInTheDocument();
  });

  it("clicking a chip sets that node's autoParam in the store", () => {
    useDawStore.setState({ autoParam: {} });
    render(<AutomationChips nodeId="kick" color="#34d8ff" params={TRACK_AUTO_PARAMS} />);

    fireEvent.click(screen.getByRole("button", { name: "PAN" }));
    expect(useDawStore.getState().autoParam.kick).toBe("pan");

    fireEvent.click(screen.getByRole("button", { name: "SEND B" }));
    expect(useDawStore.getState().autoParam.kick).toBe("sendB");
  });

  it("shows the live readout value formatted for the active param", () => {
    // vol formats as a percentage; pan as L/C/R.
    useDawStore.setState({ autoParam: { kick: "pan" }, playhead: 0 });
    render(<AutomationChips nodeId="kick" color="#34d8ff" params={TRACK_AUTO_PARAMS} />);
    // The readout renders fmtAuto(param, valAt(...)). For pan it is L#/C/R#.
    const readout = screen.getByText(/^(L\d+|C|R\d+)$/);
    expect(readout).toBeInTheDocument();
  });

  it("defaults the readout/active chip to vol when no param chosen", () => {
    useDawStore.setState({ autoParam: {} });
    render(<AutomationChips nodeId="reese" color="#8b7bff" params={TRACK_AUTO_PARAMS} />);
    // vol readout is a percentage string.
    expect(screen.getByText(/^\d+%$/)).toBeInTheDocument();
  });
});

describe("AutomationLane", () => {
  it("renders a lane with a polyline and one handle per breakpoint", () => {
    useDawStore.setState({ autoParam: { kick: "vol" } });
    const { container } = render(<AutomationLane nodeId="kick" color="#34d8ff" />);

    const lane = container.querySelector("[title^='Click to add a point']");
    expect(lane).not.toBeNull();

    const poly = container.querySelector("polyline");
    expect(poly).not.toBeNull();
    // Default envelope has 5 points → 5 coordinate pairs in the polyline.
    expect(poly!.getAttribute("points")!.trim().split(/\s+/)).toHaveLength(5);

    // One draggable handle per point (tabIndex=0 divs).
    const handles = container.querySelectorAll("div[tabindex='0']");
    expect(handles.length).toBe(5);
  });

  it("pointer-down on the empty lane adds a breakpoint", () => {
    useDawStore.setState({ autoParam: { kick: "vol" }, autoData: {} });
    const before = getAutoPts(useDawStore.getState().autoData, "kick", "vol").length;

    const { container } = render(<AutomationLane nodeId="kick" color="#34d8ff" />);
    const lane = container.querySelector("[title^='Click to add a point']") as HTMLElement;
    fireEvent.pointerDown(lane, { button: 0, clientX: 40, clientY: 20 });

    const after = getAutoPts(useDawStore.getState().autoData, "kick", "vol").length;
    expect(after).toBe(before + 1);
  });

  it("non-primary button does not add a point", () => {
    useDawStore.setState({ autoParam: { kick: "vol" }, autoData: {} });
    const { container } = render(<AutomationLane nodeId="kick" color="#34d8ff" />);
    const lane = container.querySelector("[title^='Click to add a point']") as HTMLElement;

    fireEvent.pointerDown(lane, { button: 2, clientX: 40, clientY: 20 });
    // No edited envelope stored for kick:vol.
    expect(useDawStore.getState().autoData["kick:vol"]).toBeUndefined();
  });

  it("alt+pointer-down on a handle deletes that breakpoint", () => {
    useDawStore.setState({ autoParam: { kick: "vol" }, autoData: {} });
    const { container } = render(<AutomationLane nodeId="kick" color="#34d8ff" />);

    const before = getAutoPts(useDawStore.getState().autoData, "kick", "vol").length;
    const handle = container.querySelector("div[tabindex='0']") as HTMLElement;
    fireEvent.pointerDown(handle, { button: 0, altKey: true, clientX: 10, clientY: 10 });

    const after = getAutoPts(useDawStore.getState().autoData, "kick", "vol").length;
    expect(after).toBe(before - 1);
  });

  it("right-click (contextmenu) on a handle deletes that breakpoint", () => {
    useDawStore.setState({ autoParam: { kick: "vol" }, autoData: {} });
    const { container } = render(<AutomationLane nodeId="kick" color="#34d8ff" />);

    const before = getAutoPts(useDawStore.getState().autoData, "kick", "vol").length;
    const handle = container.querySelector("div[tabindex='0']") as HTMLElement;
    fireEvent.contextMenu(handle);

    const after = getAutoPts(useDawStore.getState().autoData, "kick", "vol").length;
    expect(after).toBe(before - 1);
  });

  it("Delete key on a focused handle removes the breakpoint", () => {
    useDawStore.setState({ autoParam: { kick: "vol" }, autoData: {} });
    const { container } = render(<AutomationLane nodeId="kick" color="#34d8ff" />);

    const before = getAutoPts(useDawStore.getState().autoData, "kick", "vol").length;
    const handle = container.querySelector("div[tabindex='0']") as HTMLElement;
    fireEvent.keyDown(handle, { key: "Delete" });

    const after = getAutoPts(useDawStore.getState().autoData, "kick", "vol").length;
    expect(after).toBe(before - 1);
  });

  it("dragging a handle (pointermove on window) moves the breakpoint", () => {
    useDawStore.setState({ autoParam: { kick: "vol" }, autoData: {} });
    const { container } = render(<AutomationLane nodeId="kick" color="#34d8ff" />);

    // Pick a middle handle so its time is clamped between neighbors (not endpoint).
    const handles = container.querySelectorAll("div[tabindex='0']");
    const mid = handles[2] as HTMLElement;
    fireEvent.pointerDown(mid, { button: 0, clientX: 50, clientY: 30 });
    // global pointermove handler is attached; fire one move + up.
    fireEvent.pointerMove(window, { clientX: 55, clientY: 10 });
    fireEvent.pointerUp(window);

    const pts = getAutoPts(useDawStore.getState().autoData, "kick", "vol");
    // After a move, an edited envelope is stored for kick:vol.
    expect(useDawStore.getState().autoData["kick:vol"]).toBeDefined();
    expect(pts.length).toBe(5);
  });
});

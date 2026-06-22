// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { GroupHeader, GroupLane } from "./GroupHeader";
import { useDawStore } from "../../store/useDawStore";
import type { Group } from "../../types";

// Snapshot the per-group slices this component reads/mutates so tests stay
// order-independent (every test restores these in afterEach).
type GroupSnapshot = {
  groupCollapsed: Record<string, boolean>;
  groupMutes: Record<string, boolean>;
  groupSolos: Record<string, boolean>;
  groupVolumes: Record<string, number>;
  groupPans: Record<string, number>;
  groupLevels: Record<string, number>;
  autoLanes: Record<string, boolean>;
  autoParam: ReturnType<typeof useDawStore.getState>["autoParam"];
  selTrack: string;
  rackOpen: boolean;
};

let snapshot: GroupSnapshot;

/** The first seeded group (g-drums / DRUMS). */
function firstGroup(): Group {
  return useDawStore.getState().groups[0];
}

beforeEach(() => {
  const s = useDawStore.getState();
  snapshot = {
    groupCollapsed: { ...s.groupCollapsed },
    groupMutes: { ...s.groupMutes },
    groupSolos: { ...s.groupSolos },
    groupVolumes: { ...s.groupVolumes },
    groupPans: { ...s.groupPans },
    groupLevels: { ...s.groupLevels },
    autoLanes: { ...s.autoLanes },
    autoParam: { ...s.autoParam },
    selTrack: s.selTrack,
    rackOpen: s.rackOpen,
  };
});

afterEach(() => {
  useDawStore.setState({
    groupCollapsed: snapshot.groupCollapsed,
    groupMutes: snapshot.groupMutes,
    groupSolos: snapshot.groupSolos,
    groupVolumes: snapshot.groupVolumes,
    groupPans: snapshot.groupPans,
    groupLevels: snapshot.groupLevels,
    autoLanes: snapshot.autoLanes,
    autoParam: snapshot.autoParam,
    selTrack: snapshot.selTrack,
    rackOpen: snapshot.rackOpen,
  });
});

describe("GroupHeader", () => {
  it("renders the group name and the M / S / A controls", () => {
    const g = firstGroup();
    render(<GroupHeader g={g} />);
    expect(screen.getByText(g.name)).toBeInTheDocument();
    expect(screen.getByTitle("Mute group bus")).toHaveTextContent("M");
    expect(screen.getByTitle("Solo group bus")).toHaveTextContent("S");
    expect(screen.getByTitle("Automation lane")).toHaveTextContent("A");
  });

  it("shows the collapse arrow that matches the collapsed flag", () => {
    const g = firstGroup();
    // expanded by default
    const { unmount } = render(<GroupHeader g={g} />);
    expect(screen.getByTitle("Collapse group")).toHaveTextContent("▾");
    unmount();

    useDawStore.setState((s) => ({ groupCollapsed: { ...s.groupCollapsed, [g.id]: true } }));
    render(<GroupHeader g={g} />);
    expect(screen.getByTitle("Expand group")).toHaveTextContent("▸");
  });

  it("clicking the collapse button toggles groupCollapsed and does not open the chain", () => {
    const g = firstGroup();
    useDawStore.setState({ selTrack: "lead", rackOpen: false });
    render(<GroupHeader g={g} />);

    expect(!!useDawStore.getState().groupCollapsed[g.id]).toBe(false);
    fireEvent.click(screen.getByTitle("Collapse group"));
    expect(useDawStore.getState().groupCollapsed[g.id]).toBe(true);

    // stopPropagation: the row's openGroupChain (which selects the group) must NOT have fired
    expect(useDawStore.getState().selTrack).toBe("lead");
    expect(useDawStore.getState().rackOpen).toBe(false);
  });

  it("clicking M toggles the group mute and reflects it in the button state", () => {
    const g = firstGroup();
    useDawStore.setState((s) => ({ groupMutes: { ...s.groupMutes, [g.id]: false } }));
    const { rerender } = render(<GroupHeader g={g} />);

    // initially idle: layer-2 background.
    expect(screen.getByTitle("Mute group bus").style.background).toBe("var(--layer-2)");

    fireEvent.click(screen.getByTitle("Mute group bus"));
    expect(useDawStore.getState().groupMutes[g.id]).toBe(true);

    // The muted button picks up the danger gradient background.
    rerender(<GroupHeader g={g} />);
    expect(screen.getByTitle("Mute group bus").style.background).toBe("var(--danger-grad)");
  });

  it("clicking S toggles the group solo", () => {
    const g = firstGroup();
    useDawStore.setState((s) => ({ groupSolos: { ...s.groupSolos, [g.id]: false } }));
    render(<GroupHeader g={g} />);

    fireEvent.click(screen.getByTitle("Solo group bus"));
    expect(useDawStore.getState().groupSolos[g.id]).toBe(true);

    fireEvent.click(screen.getByTitle("Solo group bus"));
    expect(useDawStore.getState().groupSolos[g.id]).toBe(false);
  });

  it("clicking A toggles the automation lane and renders the AUTO chips row when open", () => {
    const g = firstGroup();
    useDawStore.setState((s) => ({ autoLanes: { ...s.autoLanes, [g.id]: false } }));
    const { rerender } = render(<GroupHeader g={g} />);

    // closed: no AUTO chips header yet
    expect(screen.queryByText("AUTO")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Automation lane"));
    expect(useDawStore.getState().autoLanes[g.id]).toBe(true);

    rerender(<GroupHeader g={g} />);
    // open: the AutomationChips header (label "AUTO" + group params VOL / PAN) appears
    expect(screen.getByText("AUTO")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "VOL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PAN" })).toBeInTheDocument();
  });

  it("clicking the header row opens the group chain (selects the group, opens the rack)", () => {
    const g = firstGroup();
    useDawStore.setState({ selTrack: "lead", rackOpen: false });
    const { container } = render(<GroupHeader g={g} />);

    // The outer row carries the "Open group chain" title.
    const row = container.querySelector('[title="Open group chain"]') as HTMLElement;
    expect(row).toBeTruthy();
    fireEvent.click(row);

    expect(useDawStore.getState().selTrack).toBe(g.id);
    expect(useDawStore.getState().rackOpen).toBe(true);
  });

  it("renders the dB readout from the stored group volume", () => {
    const g = firstGroup();
    // 0.5 -> 20*log10(0.5) = -6.0 dB
    useDawStore.setState((s) => ({ groupVolumes: { ...s.groupVolumes, [g.id]: 0.5 } }));
    render(<GroupHeader g={g} />);
    expect(screen.getByText("-6.0")).toBeInTheDocument();
  });

  it("shows -∞ in the dB readout when the group volume is (near) zero", () => {
    const g = firstGroup();
    useDawStore.setState((s) => ({ groupVolumes: { ...s.groupVolumes, [g.id]: 0 } }));
    render(<GroupHeader g={g} />);
    expect(screen.getByText("-∞")).toBeInTheDocument();
  });

  it("labels the pan dial Center / Left / Right via its title", () => {
    const g = firstGroup();

    useDawStore.setState((s) => ({ groupPans: { ...s.groupPans, [g.id]: 0.5 } }));
    const { unmount: u1 } = render(<GroupHeader g={g} />);
    expect(screen.getByTitle("Group pan: C (double-click to center)")).toBeInTheDocument();
    u1();

    useDawStore.setState((s) => ({ groupPans: { ...s.groupPans, [g.id]: 0 } }));
    const { unmount: u2 } = render(<GroupHeader g={g} />);
    expect(screen.getByTitle("Group pan: L100 (double-click to center)")).toBeInTheDocument();
    u2();

    useDawStore.setState((s) => ({ groupPans: { ...s.groupPans, [g.id]: 1 } }));
    render(<GroupHeader g={g} />);
    expect(screen.getByTitle("Group pan: R100 (double-click to center)")).toBeInTheDocument();
  });

  it("double-clicking the pan wrapper recenters the group pan to 0.5", () => {
    const g = firstGroup();
    useDawStore.setState((s) => ({ groupPans: { ...s.groupPans, [g.id]: 0 } }));
    render(<GroupHeader g={g} />);

    const panWrap = screen.getByTitle("Group pan: L100 (double-click to center)");
    fireEvent.doubleClick(panWrap);
    expect(useDawStore.getState().groupPans[g.id]).toBe(0.5);
  });

  it("dragging the BUS slider sets the group volume through the store", () => {
    const g = firstGroup();
    useDawStore.setState((s) => ({ groupVolumes: { ...s.groupVolumes, [g.id]: 1 } }));
    const { container } = render(<GroupHeader g={g} />);

    // The slider rail is the ew-resize interactive div.
    const rail = Array.from(container.querySelectorAll("div")).find(
      (el) => el.style.cursor === "ew-resize",
    ) as HTMLElement;
    expect(rail).toBeTruthy();
    rail.getBoundingClientRect = () =>
      ({ left: 0, width: 100, top: 0, right: 100, bottom: 0, height: 18, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    fireEvent.pointerDown(rail, { clientX: 25 });
    expect(useDawStore.getState().groupVolumes[g.id]).toBeCloseTo(0.25, 5);
  });

  it("clicking a param chip in the open automation lane updates autoParam", () => {
    const g = firstGroup();
    useDawStore.setState((s) => ({
      autoLanes: { ...s.autoLanes, [g.id]: true },
      autoParam: { ...s.autoParam, [g.id]: "vol" },
    }));
    render(<GroupHeader g={g} />);

    fireEvent.click(screen.getByRole("button", { name: "PAN" }));
    expect(useDawStore.getState().autoParam[g.id]).toBe("pan");
  });
});

describe("GroupLane", () => {
  it("renders a fixed-height tinted bar and no automation lane when closed", () => {
    const g = firstGroup();
    useDawStore.setState((s) => ({ autoLanes: { ...s.autoLanes, [g.id]: false } }));
    const { container } = render(<GroupLane g={g} />);

    const bars = Array.from(container.querySelectorAll("div")).filter(
      (el) => el.style.height === "56px",
    );
    expect(bars).toHaveLength(1);
    // No crosshair-cursor automation lane while closed.
    expect(container.querySelector('[style*="crosshair"]')).toBeNull();
  });

  it("renders the automation envelope lane when the group's lane is open", () => {
    const g = firstGroup();
    useDawStore.setState((s) => ({ autoLanes: { ...s.autoLanes, [g.id]: true } }));
    const { container } = render(<GroupLane g={g} />);

    // The AutomationLane carries this descriptive title + a polyline.
    expect(
      within(container).getByTitle(
        "Click to add a point · drag to move · alt/right-click to delete",
      ),
    ).toBeInTheDocument();
    expect(container.querySelector("polyline")).toBeTruthy();
  });
});

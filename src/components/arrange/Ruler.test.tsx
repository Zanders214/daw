// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Ruler } from "./Ruler";
import { useDawStore } from "../../store/useDawStore";
import { TOTAL_BARS, TOTAL_BEATS } from "../../lib/constants";

type Snap = {
  tracksRight: boolean;
  playhead: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
};
let snap: Snap;

beforeEach(() => {
  const s = useDawStore.getState();
  snap = {
    tracksRight: s.tracksRight,
    playhead: s.playhead,
    loop: s.loop,
    loopStart: s.loopStart,
    loopEnd: s.loopEnd,
  };
});

afterEach(() => {
  useDawStore.setState(snap);
});

describe("Ruler", () => {
  it("renders the TRACKS label and the side-toggle button", () => {
    render(<Ruler tracksRight={false} />);
    expect(screen.getByText("TRACKS")).toBeInTheDocument();
    expect(screen.getByTitle("Move track list to other side")).toBeInTheDocument();
  });

  it("renders only the major-bar numbers (every 4th bar) as text", () => {
    render(<Ruler tracksRight={false} />);
    // Bars 1, 5, 9, ... are major (i % 4 === 0 -> label i+1).
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    // The last major bar within TOTAL_BARS (32): i=28 -> "29".
    expect(screen.getByText("29")).toBeInTheDocument();
    // A non-major bar number (2) is not rendered as visible text.
    expect(screen.queryByText("2")).toBeNull();
  });

  it("renders one cell per bar in the timeline", () => {
    const { container } = render(<Ruler tracksRight={false} />);
    // The bar-area is the element carrying touchAction: none.
    const barArea = Array.from(container.querySelectorAll("div")).find(
      (el) => el.style.touchAction === "none",
    )!;
    expect(barArea).toBeTruthy();
    // Each bar cell carries the mono font; the LoopBracket / PlayheadMarker do not.
    const cells = Array.from(barArea.children).filter((el) =>
      (el as HTMLElement).style.fontFamily.includes("--font-mono"),
    );
    expect(cells).toHaveLength(TOTAL_BARS);
  });

  it("toggling the side button flips tracksRight in the store", () => {
    useDawStore.setState({ tracksRight: false });
    render(<Ruler tracksRight={false} />);
    fireEvent.click(screen.getByTitle("Move track list to other side"));
    expect(useDawStore.getState().tracksRight).toBe(true);
  });

  it("lays out row when tracksRight is false and row-reverse when true", () => {
    const { container: a } = render(<Ruler tracksRight={false} />);
    expect((a.firstChild as HTMLElement).style.flexDirection).toBe("row");

    const { container: b } = render(<Ruler tracksRight={true} />);
    expect((b.firstChild as HTMLElement).style.flexDirection).toBe("row-reverse");
  });

  it("clicking the bar-area seeks the playhead via beatsAt", () => {
    useDawStore.setState({ playhead: 0 });
    const { container } = render(<Ruler tracksRight={false} />);
    const barArea = Array.from(container.querySelectorAll("div")).find(
      (el) => el.style.touchAction === "none",
    )!;
    barArea.getBoundingClientRect = () =>
      ({ left: 0, width: 128, top: 0, right: 128, bottom: 34, height: 34, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    // clientX 64 of width 128 -> 50% -> TOTAL_BEATS/2 = 64 beats.
    fireEvent.pointerDown(barArea, { button: 0, clientX: 64 });
    expect(useDawStore.getState().playhead).toBe(TOTAL_BEATS / 2);
    globalThis.dispatchEvent(new Event("pointerup"));
  });

  it("ignores a non-primary button press on the bar-area", () => {
    useDawStore.setState({ playhead: 0 });
    const { container } = render(<Ruler tracksRight={false} />);
    const barArea = Array.from(container.querySelectorAll("div")).find(
      (el) => el.style.touchAction === "none",
    )!;
    barArea.getBoundingClientRect = () =>
      ({ left: 0, width: 128, top: 0, right: 128, bottom: 34, height: 34, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
    fireEvent.pointerDown(barArea, { button: 2, clientX: 64 });
    expect(useDawStore.getState().playhead).toBe(0);
  });

  it("renders the PlayheadMarker child reflecting the current playhead", () => {
    useDawStore.setState({ playhead: 0, loop: false });
    const { container } = render(<Ruler tracksRight={false} />);
    // The marker is the only triangle (borderTop white) inside the bar-area.
    const marker = Array.from(container.querySelectorAll("div")).find(
      (el) => el.style.borderTop.includes("#fff") && el.style.left === "0%",
    );
    expect(marker).toBeTruthy();
  });

  it("renders the LoopBracket child only while looping", () => {
    useDawStore.setState({ loop: false });
    const { container, rerender } = render(<Ruler tracksRight={false} />);
    const bracketTitle = "Drag to move the loop · edges to resize";
    expect(container.querySelector(`[title='${bracketTitle}']`)).toBeNull();

    useDawStore.setState({ loop: true });
    rerender(<Ruler tracksRight={false} />);
    expect(container.querySelector(`[title='${bracketTitle}']`)).toBeTruthy();
  });
});

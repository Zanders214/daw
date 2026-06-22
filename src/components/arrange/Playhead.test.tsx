// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { PlayheadLine, PlayheadMarker, LoopRegion, LoopBracket } from "./Playhead";
import { useDawStore } from "../../store/useDawStore";
import { TOTAL_BEATS, BEATS_PER_BAR } from "../../lib/constants";

// Snapshot the slice these components read / mutate so tests stay order-independent.
type Snap = {
  playhead: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
};
let snap: Snap;

beforeEach(() => {
  const s = useDawStore.getState();
  snap = { playhead: s.playhead, loop: s.loop, loopStart: s.loopStart, loopEnd: s.loopEnd };
});

afterEach(() => {
  useDawStore.setState(snap);
});

/** The single absolutely-positioned div a marker/line renders as. */
function onlyDiv(container: HTMLElement): HTMLElement {
  const el = container.firstElementChild as HTMLElement;
  if (!el) throw new Error("expected a rendered element");
  return el;
}

describe("PlayheadLine", () => {
  it("renders a vertical line positioned at the playhead's percentage of the timeline", () => {
    useDawStore.setState({ playhead: TOTAL_BEATS / 2 }); // 50%
    const { container } = render(<PlayheadLine />);
    const line = onlyDiv(container);
    expect(line.style.left).toBe("50%");
    expect(line.style.position).toBe("absolute");
    // Non-interactive overlay.
    expect(line.style.pointerEvents).toBe("none");
  });

  it("sits at 0% when the playhead is at the very start", () => {
    useDawStore.setState({ playhead: 0 });
    const { container } = render(<PlayheadLine />);
    expect(onlyDiv(container).style.left).toBe("0%");
  });

  it("reflects an updated playhead after a re-render", () => {
    useDawStore.setState({ playhead: 0 });
    const { container, rerender } = render(<PlayheadLine />);
    expect(onlyDiv(container).style.left).toBe("0%");
    useDawStore.setState({ playhead: TOTAL_BEATS }); // 100%
    rerender(<PlayheadLine />);
    expect(onlyDiv(container).style.left).toBe("100%");
  });
});

describe("PlayheadMarker", () => {
  it("renders the triangle marker at the playhead percentage", () => {
    useDawStore.setState({ playhead: TOTAL_BEATS / 4 }); // 25%
    const { container } = render(<PlayheadMarker />);
    const marker = onlyDiv(container);
    expect(marker.style.left).toBe("25%");
    expect(marker.style.borderTop).toContain("#fff");
    expect(marker.style.pointerEvents).toBe("none");
  });
});

describe("LoopRegion", () => {
  it("renders nothing when loop is disengaged", () => {
    useDawStore.setState({ loop: false });
    const { container } = render(<LoopRegion />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a tint spanning loopStart..loopEnd as percentages when looping", () => {
    useDawStore.setState({ loop: true, loopStart: 0, loopEnd: TOTAL_BEATS / 2 });
    const { container } = render(<LoopRegion />);
    const region = onlyDiv(container);
    expect(region.style.left).toBe("0%");
    // (loopEnd - loopStart) / TOTAL_BEATS = 50%
    expect(region.style.width).toBe("50%");
    expect(region.style.pointerEvents).toBe("none");
  });

  it("offsets the tint when loopStart is non-zero", () => {
    useDawStore.setState({ loop: true, loopStart: TOTAL_BEATS / 4, loopEnd: (TOTAL_BEATS * 3) / 4 });
    const { container } = render(<LoopRegion />);
    const region = onlyDiv(container);
    expect(region.style.left).toBe("25%");
    expect(region.style.width).toBe("50%");
  });
});

describe("LoopBracket", () => {
  it("renders nothing when loop is disengaged", () => {
    useDawStore.setState({ loop: false });
    const { container } = render(<LoopBracket />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a draggable body with start/end edge handles when looping", () => {
    useDawStore.setState({ loop: true, loopStart: 0, loopEnd: TOTAL_BEATS / 2 });
    const { container } = render(<LoopBracket />);
    const body = onlyDiv(container);
    expect(body.style.left).toBe("0%");
    expect(body.style.width).toBe("50%");
    expect(body.title).toContain("Drag to move the loop");
    // Two edge handles (ew-resize) live inside the body.
    const edges = Array.from(body.querySelectorAll("div")).filter(
      (el) => el.style.cursor === "ew-resize",
    );
    expect(edges.length).toBe(2);
  });

  it("dragging the start edge sets loopStart from the pointer position", () => {
    useDawStore.setState({ loop: true, loopStart: 0, loopEnd: TOTAL_BEATS });
    const { container } = render(<LoopBracket />);
    const body = onlyDiv(container);
    // Provide a parent rect so beatsAt maps clientX -> beats.
    const parent = body.parentElement as HTMLElement;
    parent.getBoundingClientRect = () =>
      ({ left: 0, width: 128, top: 0, right: 128, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    const startEdge = Array.from(body.querySelectorAll("div")).find(
      (el) => el.style.cursor === "ew-resize",
    )!;
    // pointerDown installs the global drag listener; clientX 16 -> 16 beats,
    // snapped to BEATS_PER_BAR = 16.
    fireEvent.pointerDown(startEdge, { button: 0, clientX: 16 });
    globalThis.dispatchEvent(
      Object.assign(new Event("pointermove"), { clientX: 16, altKey: false }),
    );
    expect(useDawStore.getState().loopStart).toBe(BEATS_PER_BAR * 4); // 16 beats
    globalThis.dispatchEvent(new Event("pointerup"));
  });

  it("ignores a non-primary (right) button press on an edge", () => {
    useDawStore.setState({ loop: true, loopStart: 0, loopEnd: TOTAL_BEATS });
    const { container } = render(<LoopBracket />);
    const body = onlyDiv(container);
    const startEdge = Array.from(body.querySelectorAll("div")).find(
      (el) => el.style.cursor === "ew-resize",
    )!;
    fireEvent.pointerDown(startEdge, { button: 2, clientX: 40 });
    // No global move was registered; a move does not change loopStart.
    globalThis.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 40, altKey: false }));
    expect(useDawStore.getState().loopStart).toBe(0);
  });

  it("dragging the body moves the whole region, keeping its length", () => {
    useDawStore.setState({ loop: true, loopStart: 0, loopEnd: TOTAL_BEATS / 2 }); // length 64
    const { container } = render(<LoopBracket />);
    const body = onlyDiv(container);
    const parent = body.parentElement as HTMLElement;
    parent.getBoundingClientRect = () =>
      ({ left: 0, width: 128, top: 0, right: 128, bottom: 10, height: 10, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    // grab at clientX 0 (beat 0, offset 0 from loopStart). Move to clientX 16 (beat 16).
    fireEvent.pointerDown(body, { button: 0, clientX: 0 });
    globalThis.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 16, altKey: false }));
    const s = useDawStore.getState();
    expect(s.loopStart).toBe(16);
    expect(s.loopEnd - s.loopStart).toBe(TOTAL_BEATS / 2); // length preserved
    globalThis.dispatchEvent(new Event("pointerup"));
  });
});

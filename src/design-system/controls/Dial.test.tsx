// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Dial } from "./Dial";

/**
 * Dispatch a real PointerEvent on globalThis. happy-dom may not implement
 * PointerEvent, so fall back to a MouseEvent carrying the same clientY (the
 * component only reads clientY off the event).
 */
function dispatchGlobalPointer(type: "pointermove" | "pointerup", clientY: number) {
  const Ctor = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  const ev = new Ctor(type, { clientY, bubbles: true });
  globalThis.dispatchEvent(ev);
}

describe("Dial", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the default label and formatted value", () => {
    render(<Dial value={0.5} />);
    // default label is MAIN, default format rounds 0.5 -> 50%
    expect(screen.getByText("MAIN")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("renders a custom label and custom format output", () => {
    render(<Dial value={0.25} label="GAIN" format={(v) => `${(v * 4).toFixed(1)}x`} />);
    expect(screen.getByText("GAIN")).toBeInTheDocument();
    expect(screen.getByText("1.0x")).toBeInTheDocument();
  });

  it("omits the label block entirely when label is empty", () => {
    const { container } = render(<Dial value={0.5} label="" />);
    // With no label, no value readout is rendered either.
    expect(screen.queryByText("50%")).not.toBeInTheDocument();
    // Only the drag surface (with the svg) remains, no text node block.
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("rounds the value to a percentage for several inputs", () => {
    const { rerender } = render(<Dial value={0} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
    rerender(<Dial value={1} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    rerender(<Dial value={0.333} />);
    expect(screen.getByText("33%")).toBeInTheDocument();
  });

  it("scales the arc dash and core radius with the value", () => {
    const { container, rerender } = render(<Dial value={0} />);
    const getCore = (root: HTMLElement) =>
      root.querySelectorAll("circle")[2] as SVGCircleElement;
    // r = 4 + value*5 => 4 at value 0
    expect(getCore(container).getAttribute("r")).toBe("4");
    rerender(<Dial value={1} />);
    // r = 4 + 1*5 => 9 at value 1
    expect(getCore(container).getAttribute("r")).toBe("9");
  });

  it("sets a ns-resize cursor only when onChange is provided", () => {
    const { container, rerender } = render(<Dial value={0.5} />);
    const drag = container.querySelector("svg")!.parentElement as HTMLElement;
    expect(drag.style.cursor).toBe("default");
    rerender(<Dial value={0.5} onChange={() => {}} />);
    expect(drag.style.cursor).toBe("ns-resize");
  });

  it("calls onChange while dragging up (increasing the value)", () => {
    const onChange = vi.fn();
    const { container } = render(<Dial value={0.5} onChange={onChange} sensitivity={200} />);
    const drag = container.querySelector("svg")!.parentElement as HTMLElement;

    fireEvent.pointerDown(drag, { clientY: 100 });
    // Drag up 5px: delta = (100 - 95) * (1/200) * 40 = 1.0 -> clamp(0.5 + 1.0) = 1
    dispatchGlobalPointer("pointermove", 95);

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0];
    expect(last).toBeGreaterThan(0.5);
    expect(last).toBeLessThanOrEqual(1);

    dispatchGlobalPointer("pointerup", 95);
    // After pointerup the listeners are removed: no further calls.
    const callCount = onChange.mock.calls.length;
    dispatchGlobalPointer("pointermove", 0);
    expect(onChange.mock.calls).toHaveLength(callCount);
  });

  it("decreases the value when dragging down and clamps at 0", () => {
    const onChange = vi.fn();
    const { container } = render(<Dial value={0.5} onChange={onChange} sensitivity={200} />);
    const drag = container.querySelector("svg")!.parentElement as HTMLElement;

    fireEvent.pointerDown(drag, { clientY: 100 });
    // Drag far down: clamp keeps it at 0.
    dispatchGlobalPointer("pointermove", 1000);
    expect(onChange).toHaveBeenLastCalledWith(0);
    dispatchGlobalPointer("pointerup", 1000);
  });

  it("does not register drag listeners when onChange is absent", () => {
    const addSpy = vi.spyOn(globalThis, "addEventListener");
    const { container } = render(<Dial value={0.5} />);
    const drag = container.querySelector("svg")!.parentElement as HTMLElement;
    fireEvent.pointerDown(drag);
    expect(addSpy).not.toHaveBeenCalledWith("pointermove", expect.any(Function));
  });
});

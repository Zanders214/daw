// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Knob } from "./Knob";

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

describe("Knob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the default label, readout, and unit", () => {
    render(<Knob value={0.5} />);
    expect(screen.getByText("AMOUNT")).toBeInTheDocument();
    // default format rounds 0.5 -> 50
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("%")).toBeInTheDocument();
  });

  it("renders a custom label, format, and unit", () => {
    render(
      <Knob value={0.5} label="FREQ" unit="Hz" format={(v) => Math.round(v * 1000)} />,
    );
    expect(screen.getByText("FREQ")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("Hz")).toBeInTheDocument();
  });

  it("rounds the readout to a percentage for several inputs", () => {
    const { rerender } = render(<Knob value={0} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    rerender(<Knob value={1} />);
    expect(screen.getByText("100")).toBeInTheDocument();
    rerender(<Knob value={0.756} />);
    expect(screen.getByText("76")).toBeInTheDocument();
  });

  it("omits the label when label is empty but keeps the readout", () => {
    render(<Knob value={0.5} label="" />);
    expect(screen.queryByText("AMOUNT")).not.toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("rotates the indicator from -135deg at 0 to +135deg at 1", () => {
    const { container, rerender } = render(<Knob value={0} />);
    const findRotated = (root: HTMLElement) =>
      Array.from(root.querySelectorAll<HTMLElement>("div")).find((d) =>
        d.style.transform.startsWith("rotate("),
      );
    // knobDeg = -135 + value*270 => -135.0deg at value 0
    expect(findRotated(container)!.style.transform).toBe("rotate(-135.0deg)");
    rerender(<Knob value={1} />);
    // => 135.0deg at value 1
    expect(findRotated(container)!.style.transform).toBe("rotate(135.0deg)");
  });

  it("scales geometry with the size prop", () => {
    const { container } = render(<Knob value={0.5} size={86} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.width).toBe("86px");
    expect(root.style.height).toBe("86px");
  });

  it("sets a ns-resize cursor only when onChange is provided", () => {
    const { container, rerender } = render(<Knob value={0.5} />);
    const root = () => container.firstElementChild as HTMLElement;
    expect(root().style.cursor).toBe("default");
    rerender(<Knob value={0.5} onChange={() => {}} />);
    expect(root().style.cursor).toBe("ns-resize");
  });

  it("calls onChange while dragging up (increasing the value)", () => {
    const onChange = vi.fn();
    const { container } = render(<Knob value={0.5} onChange={onChange} sensitivity={220} />);
    const root = container.firstElementChild as HTMLElement;

    fireEvent.pointerDown(root, { clientY: 100 });
    // Drag up 22px: delta = (100 - 78) / 220 = 0.1 -> 0.6
    dispatchGlobalPointer("pointermove", 78);
    expect(onChange).toHaveBeenLastCalledWith(0.6);

    dispatchGlobalPointer("pointerup", 78);
    // Listeners removed after pointerup: no further calls.
    const callCount = onChange.mock.calls.length;
    dispatchGlobalPointer("pointermove", 0);
    expect(onChange.mock.calls.length).toBe(callCount);
  });

  it("decreases the value when dragging down and clamps at 0", () => {
    const onChange = vi.fn();
    const { container } = render(<Knob value={0.5} onChange={onChange} sensitivity={220} />);
    const root = container.firstElementChild as HTMLElement;

    fireEvent.pointerDown(root, { clientY: 100 });
    // Drag far down -> clamp keeps it at 0.
    dispatchGlobalPointer("pointermove", 5000);
    expect(onChange).toHaveBeenLastCalledWith(0);
    dispatchGlobalPointer("pointerup", 5000);
  });

  it("clamps above 1 when dragging up past the maximum", () => {
    const onChange = vi.fn();
    const { container } = render(<Knob value={0.9} onChange={onChange} sensitivity={220} />);
    const root = container.firstElementChild as HTMLElement;

    fireEvent.pointerDown(root, { clientY: 100 });
    dispatchGlobalPointer("pointermove", -5000);
    expect(onChange).toHaveBeenLastCalledWith(1);
    dispatchGlobalPointer("pointerup", -5000);
  });

  it("does not register drag listeners when onChange is absent", () => {
    const addSpy = vi.spyOn(globalThis, "addEventListener");
    const { container } = render(<Knob value={0.5} />);
    const root = container.firstElementChild as HTMLElement;
    fireEvent.pointerDown(root);
    expect(addSpy).not.toHaveBeenCalledWith("pointermove", expect.any(Function));
  });
});

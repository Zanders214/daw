// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Slider } from "./Slider";

/** Pull the gradient "fill" element out of a rendered Slider container. */
function getFill(container: HTMLElement): HTMLElement {
  // The fill is the absolutely-positioned div whose width carries the value pct.
  const fill = Array.from(container.querySelectorAll("div")).find(
    (el) => el.style.width && el.style.width.endsWith("%"),
  );
  if (!fill) throw new Error("fill element not found");
  return fill as HTMLElement;
}

/** Pull the round handle (left positioned by pct, has border-radius 50%). */
function getHandle(container: HTMLElement): HTMLElement {
  const handle = Array.from(container.querySelectorAll("div")).find(
    (el) => el.style.borderRadius === "50%",
  );
  if (!handle) throw new Error("handle element not found");
  return handle as HTMLElement;
}

describe("Slider", () => {
  it("renders label and valueLabel text", () => {
    render(<Slider label="VOLUME" valueLabel="-6 dB" value={0.5} />);
    expect(screen.getByText("VOLUME")).toBeInTheDocument();
    expect(screen.getByText("-6 dB")).toBeInTheDocument();
  });

  it("omits the label row when neither label nor valueLabel is given", () => {
    const { container } = render(<Slider value={0.5} />);
    // The label row uses justify-content space-between; with no label there is no such row.
    const rows = Array.from(container.querySelectorAll("div")).filter(
      (el) => el.style.justifyContent === "space-between",
    );
    expect(rows).toHaveLength(0);
  });

  it("reflects the value in the fill width and handle position", () => {
    const { container } = render(<Slider value={0.25} />);
    expect(getFill(container).style.width).toBe("25.0%");
    expect(getHandle(container).style.left).toBe("25.0%");
  });

  it("defaults to a value of 0.5 when none is supplied", () => {
    const { container } = render(<Slider />);
    expect(getFill(container).style.width).toBe("50.0%");
  });

  it("applies a custom gradient to the fill", () => {
    const { container } = render(<Slider value={0.5} gradient="red" />);
    expect(getFill(container).style.background).toBe("red");
  });

  it("uses ew-resize cursor when interactive and default cursor otherwise", () => {
    const { container: a } = render(<Slider value={0.5} onChange={() => {}} />);
    const interactive = Array.from(a.querySelectorAll("div")).find(
      (el) => el.style.cursor === "ew-resize",
    );
    expect(interactive).toBeTruthy();

    const { container: b } = render(<Slider value={0.5} />);
    const readOnly = Array.from(b.querySelectorAll("div")).find(
      (el) => el.style.cursor === "default",
    );
    expect(readOnly).toBeTruthy();
  });

  it("invokes onChange with the clamped position on pointer down", () => {
    const onChange = vi.fn();
    const { container } = render(<Slider value={0.5} onChange={onChange} />);
    const rail = Array.from(container.querySelectorAll("div")).find(
      (el) => el.style.cursor === "ew-resize",
    )!;
    rail.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, right: 200, bottom: 0, height: 18, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    fireEvent.pointerDown(rail, { clientX: 100 });
    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  it("clamps onChange output to the 0..1 range", () => {
    const onChange = vi.fn();
    const { container } = render(<Slider value={0.5} onChange={onChange} />);
    const rail = Array.from(container.querySelectorAll("div")).find(
      (el) => el.style.cursor === "ew-resize",
    )!;
    rail.getBoundingClientRect = () =>
      ({ left: 0, width: 200, top: 0, right: 200, bottom: 0, height: 18, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    // clientX beyond the right edge -> clamped to 1
    fireEvent.pointerDown(rail, { clientX: 400 });
    expect(onChange).toHaveBeenLastCalledWith(1);

    // clientX before the left edge -> clamped to 0
    fireEvent.pointerDown(rail, { clientX: -50 });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("tracks pointer move after pointer down and stops after pointer up", () => {
    const onChange = vi.fn();
    const { container } = render(<Slider value={0.5} onChange={onChange} />);
    const rail = Array.from(container.querySelectorAll("div")).find(
      (el) => el.style.cursor === "ew-resize",
    )!;
    rail.getBoundingClientRect = () =>
      ({ left: 0, width: 100, top: 0, right: 100, bottom: 0, height: 18, x: 0, y: 0, toJSON: () => {} }) as DOMRect;

    fireEvent.pointerDown(rail, { clientX: 10 });
    expect(onChange).toHaveBeenLastCalledWith(0.1);

    // A window-level pointermove should be tracked while dragging.
    fireEvent(globalThis as unknown as Window, new (globalThis as any).PointerEvent("pointermove", { clientX: 60 }));
    expect(onChange).toHaveBeenLastCalledWith(0.6);

    // After pointer up, further moves are ignored.
    fireEvent(globalThis as unknown as Window, new (globalThis as any).PointerEvent("pointerup", {}));
    const callsBefore = onChange.mock.calls.length;
    fireEvent(globalThis as unknown as Window, new (globalThis as any).PointerEvent("pointermove", { clientX: 90 }));
    expect(onChange.mock.calls.length).toBe(callsBefore);
  });

  it("does not call onChange (and is harmless) when read-only", () => {
    const { container } = render(<Slider value={0.5} />);
    const rail = Array.from(container.querySelectorAll("div")).find(
      (el) => el.style.cursor === "default",
    )!;
    // No onChange handler; pointerDown must not throw.
    expect(() => fireEvent.pointerDown(rail, { clientX: 100 })).not.toThrow();
  });

  it("forwards extra props onto the root element", () => {
    const { container } = render(<Slider value={0.5} data-testid="my-slider" />);
    expect(container.querySelector('[data-testid="my-slider"]')).toBeTruthy();
  });
});

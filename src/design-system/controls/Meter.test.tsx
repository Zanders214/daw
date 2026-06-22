// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Meter } from "./Meter";

/** The inner fill div is the one carrying the percentage width. */
function getFill(container: HTMLElement): HTMLElement {
  const fill = Array.from(container.querySelectorAll("div")).find(
    (el) => el.style.width && el.style.width.endsWith("%"),
  );
  if (!fill) throw new Error("fill element not found");
  return fill as HTMLElement;
}

describe("Meter", () => {
  it("reflects the value as the fill width", () => {
    const { container } = render(<Meter value={0.3} />);
    expect(getFill(container).style.width).toBe("30.0%");
  });

  it("defaults to 50% when no value is supplied", () => {
    const { container } = render(<Meter />);
    expect(getFill(container).style.width).toBe("50.0%");
  });

  it("clamps values above 1 to 100%", () => {
    const { container } = render(<Meter value={2} />);
    expect(getFill(container).style.width).toBe("100.0%");
  });

  it("clamps negative values to 0%", () => {
    const { container } = render(<Meter value={-1} />);
    expect(getFill(container).style.width).toBe("0.0%");
  });

  it("uses the height prop for the bar height and its border radius", () => {
    const { container } = render(<Meter value={0.5} height={10} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.height).toBe("10px");
    expect(root.style.borderRadius).toBe("5px");
  });

  it("applies a custom gradient to the fill", () => {
    const { container } = render(<Meter value={0.5} gradient="blue" />);
    expect(getFill(container).style.background).toBe("blue");
  });

  it("renders the glow box-shadow by default", () => {
    const { container } = render(<Meter value={0.5} />);
    expect(getFill(container).style.boxShadow).toBe("var(--glow-meter)");
  });

  it("disables the glow when glow is false", () => {
    const { container } = render(<Meter value={0.5} glow={false} />);
    expect(getFill(container).style.boxShadow).toBe("none");
  });

  it("merges caller style onto the root and forwards extra props", () => {
    const { container } = render(
      <Meter value={0.5} style={{ marginTop: 4 }} data-testid="lvl" />,
    );
    const root = container.querySelector('[data-testid="lvl"]') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.style.marginTop).toBe("4px");
  });
});

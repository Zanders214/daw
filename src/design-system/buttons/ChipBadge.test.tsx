// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Chip } from "./Chip";
import { Badge } from "./Badge";

describe("Chip", () => {
  it("renders its label and value", () => {
    render(<Chip label="WIDTH" value="42%" />);
    expect(screen.getByText("WIDTH")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("renders ReactNode label/value children, not just strings", () => {
    render(<Chip label={<em>DEPTH</em>} value={<strong>9</strong>} />);
    expect(screen.getByText("DEPTH").tagName).toBe("EM");
    expect(screen.getByText("9").tagName).toBe("STRONG");
  });

  it("fires onClick when clicked", () => {
    const onClick = vi.fn();
    render(
      <Chip label="GAIN" value="0dB" onClick={onClick} data-testid="chip" />,
    );
    fireEvent.click(screen.getByTestId("chip"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is fully opaque when active (the default)", () => {
    render(<Chip label="A" value="1" data-testid="chip" />);
    expect(screen.getByTestId("chip")).toHaveStyle({ opacity: "1" });
  });

  it("dims to 0.4 opacity when inactive", () => {
    render(<Chip label="A" value="1" active={false} data-testid="chip" />);
    expect(screen.getByTestId("chip")).toHaveStyle({ opacity: "0.4" });
  });

  it("applies the provided color to the glow dot via boxShadow", () => {
    const { container } = render(
      <Chip label="A" value="1" color="rgb(255, 0, 0)" />,
    );
    const dot = container.querySelector("span") as HTMLElement;
    expect(dot).toBeTruthy();
    expect(dot.style.background).toBe("rgb(255, 0, 0)");
    expect(dot.style.boxShadow).toContain("rgb(255, 0, 0)");
  });

  it("applies the glow opacity to the dot", () => {
    const { container } = render(
      <Chip label="A" value="1" glow={0.3} data-testid="chip" />,
    );
    const dot = container.querySelector("span") as HTMLElement;
    expect(dot.style.opacity).toBe("0.3");
  });

  it("merges caller-supplied style overrides onto the root", () => {
    render(
      <Chip
        label="A"
        value="1"
        style={{ marginTop: "12px" }}
        data-testid="chip"
      />,
    );
    expect(screen.getByTestId("chip")).toHaveStyle({ marginTop: "12px" });
  });

  it("spreads arbitrary HTML attributes onto the root div", () => {
    render(
      <Chip label="A" value="1" title="hello" data-testid="chip" />,
    );
    expect(screen.getByTestId("chip")).toHaveAttribute("title", "hello");
  });
});

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>VST3</Badge>);
    expect(screen.getByText("VST3")).toBeInTheDocument();
  });

  it("renders inside a span element", () => {
    const { container } = render(<Badge>BUILD-UP</Badge>);
    const span = container.querySelector("span") as HTMLElement;
    expect(span).toBeTruthy();
    expect(span).toHaveTextContent("BUILD-UP");
  });

  it("renders with no children without crashing", () => {
    const { container } = render(<Badge data-testid="badge" />);
    expect(screen.getByTestId("badge")).toBeInTheDocument();
    expect(container.querySelector("span")).toBeTruthy();
  });

  it("merges caller-supplied style overrides", () => {
    render(
      <Badge style={{ opacity: "0.5" }} data-testid="badge">
        WIND-DOWN
      </Badge>,
    );
    expect(screen.getByTestId("badge")).toHaveStyle({ opacity: "0.5" });
  });

  it("spreads arbitrary HTML attributes onto the span", () => {
    render(
      <Badge title="mode" data-testid="badge">
        X
      </Badge>,
    );
    expect(screen.getByTestId("badge")).toHaveAttribute("title", "mode");
  });

  it("forwards onClick events", () => {
    const onClick = vi.fn();
    render(
      <Badge onClick={onClick} data-testid="badge">
        CLICK
      </Badge>,
    );
    fireEvent.click(screen.getByTestId("badge"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

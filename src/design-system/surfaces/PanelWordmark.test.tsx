// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Panel } from "./Panel";
import { Wordmark } from "./Wordmark";

describe("Panel", () => {
  it("renders its children", () => {
    render(
      <Panel>
        <span>panel content</span>
      </Panel>,
    );
    expect(screen.getByText("panel content")).toBeInTheDocument();
  });

  it("renders with no children without crashing", () => {
    const { container } = render(<Panel data-testid="empty-panel" />);
    const el = container.querySelector('[data-testid="empty-panel"]');
    expect(el).toBeInTheDocument();
    expect(el).toBeEmptyDOMElement();
  });

  it("applies the default pad and radius styles", () => {
    const { container } = render(<Panel data-testid="p" />);
    const el = container.querySelector('[data-testid="p"]') as HTMLElement;
    // defaults: pad = 26, radius = 16
    expect(el.style.padding).toBe("26px");
    expect(el.style.borderRadius).toBe("16px");
    expect(el.style.boxSizing).toBe("border-box");
  });

  it("honors explicit pad, radius and numeric width props", () => {
    const { container } = render(<Panel data-testid="p" pad={8} radius={4} width={320} />);
    const el = container.querySelector('[data-testid="p"]') as HTMLElement;
    expect(el.style.padding).toBe("8px");
    expect(el.style.borderRadius).toBe("4px");
    expect(el.style.width).toBe("320px");
  });

  it("accepts a string width", () => {
    const { container } = render(<Panel data-testid="p" width="50%" />);
    const el = container.querySelector('[data-testid="p"]') as HTMLElement;
    expect(el.style.width).toBe("50%");
  });

  it("merges a caller-supplied style override on top of defaults", () => {
    const { container } = render(
      <Panel data-testid="p" pad={10} style={{ padding: 99, opacity: 0.5 }} />,
    );
    const el = container.querySelector('[data-testid="p"]') as HTMLElement;
    // style prop is spread last, so it wins over the pad-derived padding
    expect(el.style.padding).toBe("99px");
    expect(el.style.opacity).toBe("0.5");
  });

  it("forwards arbitrary HTML attributes via rest props", () => {
    const { container } = render(
      <Panel data-testid="p" id="my-panel" title="hello" aria-label="region" />,
    );
    const el = container.querySelector('[data-testid="p"]') as HTMLElement;
    expect(el.id).toBe("my-panel");
    expect(el.getAttribute("title")).toBe("hello");
    expect(el.getAttribute("aria-label")).toBe("region");
  });

  it("renders multiple/nested children", () => {
    render(
      <Panel>
        <h1>title</h1>
        <p>body text</p>
      </Panel>,
    );
    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByText("body text")).toBeInTheDocument();
  });
});

describe("Wordmark", () => {
  it("renders the house brand with the default product name", () => {
    const { container } = render(<Wordmark />);
    // 'Zanders' and the default product 'PreDrop' concatenate with no space
    expect(container.textContent).toBe("ZandersPreDrop");
    expect(screen.getByText("PreDrop")).toBeInTheDocument();
  });

  it("renders a custom product name", () => {
    const { container } = render(<Wordmark product="Studio" />);
    expect(container.textContent).toBe("ZandersStudio");
    expect(screen.getByText("Studio")).toBeInTheDocument();
  });

  it("renders a ReactNode product", () => {
    render(<Wordmark product={<em>DAW</em>} />);
    const em = screen.getByText("DAW");
    expect(em.tagName).toBe("EM");
  });

  it("puts the product name in a span tinted by the color prop", () => {
    render(<Wordmark product="Pink" color="rgb(255, 0, 128)" />);
    const span = screen.getByText("Pink");
    expect(span.tagName).toBe("SPAN");
    expect(span.style.color).toBe("rgb(255, 0, 128)");
  });

  it("uses the default accent color when none is supplied", () => {
    render(<Wordmark product="Accent" />);
    const span = screen.getByText("Accent");
    // default is a CSS var token
    expect(span.style.color).toBe("var(--spectrum-pink)");
  });

  it("applies the default font size of 17", () => {
    const { container } = render(<Wordmark />);
    const root = container.firstChild as HTMLElement;
    expect(root.style.fontSize).toBe("17px");
    expect(root.style.fontWeight).toBe("600");
  });

  it("honors a custom size prop", () => {
    const { container } = render(<Wordmark size={42} />);
    const root = container.firstChild as HTMLElement;
    expect(root.style.fontSize).toBe("42px");
  });

  it("merges a caller-supplied style override on the root", () => {
    const { container } = render(<Wordmark size={10} style={{ fontSize: 88, margin: 4 }} />);
    const root = container.firstChild as HTMLElement;
    // style is spread last, so it overrides the size-derived fontSize
    expect(root.style.fontSize).toBe("88px");
    expect(root.style.margin).toBe("4px");
  });

  it("forwards arbitrary HTML attributes via rest props", () => {
    const { container } = render(<Wordmark id="brand" title="Zanders brand" />);
    const root = container.firstChild as HTMLElement;
    expect(root.id).toBe("brand");
    expect(root.getAttribute("title")).toBe("Zanders brand");
  });
});

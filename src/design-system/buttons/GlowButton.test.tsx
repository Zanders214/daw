// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { GlowButton } from "./GlowButton";

describe("GlowButton", () => {
  it("renders its children as a button", () => {
    render(<GlowButton>PLAY</GlowButton>);
    expect(screen.getByRole("button", { name: "PLAY" })).toBeInTheDocument();
  });

  it("shows idleLabel when idle and children when engaged", () => {
    const { rerender } = render(
      <GlowButton idleLabel="OFF" engaged={false}>
        ON
      </GlowButton>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("OFF");
    rerender(
      <GlowButton idleLabel="OFF" engaged>
        ON
      </GlowButton>,
    );
    expect(screen.getByRole("button")).toHaveTextContent("ON");
  });

  it("forwards clicks", async () => {
    const onClick = vi.fn();
    render(<GlowButton onClick={onClick}>HIT</GlowButton>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders the danger variant", () => {
    render(<GlowButton variant="danger">STOP</GlowButton>);
    expect(screen.getByRole("button", { name: "STOP" })).toBeInTheDocument();
  });
});

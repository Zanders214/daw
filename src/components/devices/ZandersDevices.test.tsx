// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ZandersEQ } from "./ZandersEQ";
import { ZandersPreDrop } from "./ZandersPreDrop";
import { ZandersTapeStop } from "./ZandersTapeStop";
import { useDawStore, type DawState } from "../../store/useDawStore";

/**
 * Smoke + control-presence coverage for the three reserved Zanders device UIs.
 * Each mounts inside the shared DeviceModule frame (wordmark + VST3 badge +
 * bypass button + display well + mono caption).
 */

let snapshot: { preAmount: number; devices: DawState["devices"]; reel: number };

beforeAll(() => {
  const s = useDawStore.getState();
  snapshot = { preAmount: s.preAmount, devices: { ...s.devices }, reel: s.reel };
});

afterEach(() => {
  useDawStore.setState({
    preAmount: snapshot.preAmount,
    devices: { ...snapshot.devices },
    reel: snapshot.reel,
  });
});

describe("ZandersEQ", () => {
  it("renders the shared device frame: wordmark, VST3 badge, bypass, caption, tag", () => {
    const { container } = render(<ZandersEQ />);

    // Wordmark splits "Zanders" + product into the same element textContent.
    const product = screen.getByText("EQ");
    expect(product).toBeInTheDocument();
    expect(product.parentElement).toHaveTextContent("ZandersEQ");

    expect(screen.getByText("VST3")).toBeInTheDocument();

    // Bypass power button.
    const bypass = screen.getByRole("button", { name: "Bypass" });
    expect(bypass).toBeInTheDocument();

    // Mono caption + tag.
    expect(screen.getByText("ZandersEQ.vst3")).toBeInTheDocument();
    expect(screen.getByText("4 BANDS")).toBeInTheDocument();

    // The frequency-response SVG (path + node markers) lives in the well.
    expect(container.querySelector("path")).not.toBeNull();
    expect(container.querySelectorAll("circle").length).toBeGreaterThanOrEqual(2);
  });

  it("eq device defaults to enabled, so the bypass toggle reflects on-state", () => {
    render(<ZandersEQ />);
    expect(useDawStore.getState().devices.eq).toBe(true);
    expect(screen.getByRole("button", { name: "Bypass" })).toBeInTheDocument();
  });
});

describe("ZandersTapeStop", () => {
  it("renders wordmark, badge, caption, wind-down tag and two reels", () => {
    const { container } = render(<ZandersTapeStop />);

    const product = screen.getByText("TapeStop");
    expect(product).toBeInTheDocument();
    expect(product.parentElement).toHaveTextContent("ZandersTapeStop");
    expect(screen.getByText("VST3")).toBeInTheDocument();
    expect(screen.getByText("ZandersTapeStop.vst3")).toBeInTheDocument();
    expect(screen.getByText("WIND-DOWN")).toBeInTheDocument();

    // Two Reel components, each a 64x64 relative box; the spin overlay reads
    // the live reel angle from the store.
    const reels = container.querySelectorAll('div[style*="width: 64px"]');
    expect(reels.length).toBe(2);
  });

  it("reel overlay reflects the store reel angle in its transform", () => {
    useDawStore.setState({ reel: 90 });
    const { container } = render(<ZandersTapeStop />);
    const spinning = Array.from(container.querySelectorAll("div")).filter((el) =>
      (el.getAttribute("style") ?? "").includes("rotate(90deg)"),
    );
    expect(spinning.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ZandersPreDrop", () => {
  it("renders the AMOUNT dial and all four build-up chips", () => {
    render(<ZandersPreDrop />);

    const product = screen.getByText("PreDrop");
    expect(product).toBeInTheDocument();
    expect(product.parentElement).toHaveTextContent("ZandersPreDrop");
    expect(screen.getByText("VST3")).toBeInTheDocument();
    expect(screen.getByText("ZandersPreDrop.vst3")).toBeInTheDocument();
    expect(screen.getByText("BUILD-UP")).toBeInTheDocument();

    // Dial label.
    expect(screen.getByText("AMOUNT")).toBeInTheDocument();

    // The four chain chips.
    for (const label of ["HPF", "REV", "DLY", "RIS"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("dial value displays the store preAmount formatted as a percentage", () => {
    useDawStore.setState({ preAmount: 0.5 });
    render(<ZandersPreDrop />);
    // Dial default format: round(v*100) + "%"  -> "50%"
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("chip values track the AMOUNT dial: REV active above 0.2", () => {
    // a = 0.5 -> REV win(0.2,1) rounds to 37%, DLY win(0.4,1) rounds to 17%.
    useDawStore.setState({ preAmount: 0.5 });
    render(<ZandersPreDrop />);
    expect(screen.getByText("37%")).toBeInTheDocument();
    expect(screen.getByText("17%")).toBeInTheDocument();
  });

  it("at amount 0 only HPF is on; REV/DLY/RIS read 0% and are dimmed", () => {
    useDawStore.setState({ preAmount: 0 });
    const { container } = render(<ZandersPreDrop />);

    // win(...) clamps to 0 below the floor, so REV/DLY/RIS show 0% — plus the
    // dial value also formats preAmount=0 as "0%", giving 4 occurrences.
    const zeros = screen.getAllByText("0%");
    expect(zeros.length).toBe(4);

    // HPF base frequency at a=0: round(20 * 40^(0^1.5)) = round(20*1) = 20 Hz.
    expect(screen.getByText("20 Hz")).toBeInTheDocument();

    // Inactive chip dots are rendered at reduced opacity (0.3).
    const dimmed = Array.from(container.querySelectorAll("span")).filter((el) =>
      (el.getAttribute("style") ?? "").includes("opacity: 0.3"),
    );
    expect(dimmed.length).toBe(3);
  });

  it("at amount 1 every chip is fully on (HPF reaches 800 Hz, others 100%)", () => {
    useDawStore.setState({ preAmount: 1 });
    render(<ZandersPreDrop />);

    // HPF at a=1: round(20 * 40^(1^1.5)) = 20*40 = 800 Hz.
    expect(screen.getByText("800 Hz")).toBeInTheDocument();

    // REV/DLY/RIS all reach 100% at full amount.
    const fulls = screen.getAllByText("100%");
    expect(fulls.length).toBeGreaterThanOrEqual(3);
  });
});

describe("device frame interaction", () => {
  it("each device's bypass button is scoped to its own header", () => {
    const { container } = render(<ZandersEQ />);
    const button = within(container).getByRole("button", { name: "Bypass" });
    const before = useDawStore.getState().devices.eq;
    button.click();
    expect(useDawStore.getState().devices.eq).toBe(!before);
  });
});

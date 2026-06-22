// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";
import { useDawStore, type DawState } from "./store/useDawStore";

// App mounts a handful of hooks (transport loop, mixer graph, engine bridge,
// session persistence). Under happy-dom there is no AudioContext and no
// window.__JUCE__ bridge, so those hooks no-op — this is a pure chrome smoke
// test of the top-level layout.

// Snapshot the slice of store state the rendered chrome reads/toggles so tests
// stay order-independent.
type ChromeSnapshot = {
  theme: DawState["theme"];
  browserOpen: boolean;
  settingsOpen: boolean;
  sessionsOpen: boolean;
  editorOpen: boolean;
  tracksRight: boolean;
};

let snapshot: ChromeSnapshot;

beforeEach(() => {
  const s = useDawStore.getState();
  snapshot = {
    theme: s.theme,
    browserOpen: s.browserOpen,
    settingsOpen: s.settingsOpen,
    sessionsOpen: s.sessionsOpen,
    editorOpen: s.editorOpen,
    tracksRight: s.tracksRight,
  };
});

afterEach(() => {
  useDawStore.setState(snapshot);
});

describe("App", () => {
  it("renders the scaled stage shell with the active theme attribute", () => {
    useDawStore.setState({ theme: "midnight" });
    const { container } = render(<App />);

    const stage = container.querySelector(".zd-stage") as HTMLElement;
    expect(stage).toBeInTheDocument();
    expect(stage.getAttribute("data-theme")).toBe("midnight");
    // The fixed 1920×1080 stage is scaled uniformly to the (jsdom default)
    // window via a CSS transform.
    expect(stage.style.transform).toMatch(/^scale\(/);
  });

  it("renders the transport bar wordmark and primary transport controls", () => {
    render(<App />);

    // Wordmark: "Zanders" + product "Studio".
    expect(screen.getByText("Zanders")).toBeInTheDocument();
    expect(screen.getByText("Studio")).toBeInTheDocument();

    // GlowButton idle captions for the transport cluster.
    expect(screen.getByRole("button", { name: "PLAY" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "REC" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "LOOP" })).toBeInTheDocument();

    // Tempo / signature readouts confirm the transport bar mounted fully.
    expect(screen.getByText("TEMPO")).toBeInTheDocument();
    expect(screen.getByText("BPM")).toBeInTheDocument();
  });

  it("renders the arrange surface (ADD TRACK affordance present)", () => {
    render(<App />);
    // The header column's add-track button lives in the Arrange surface.
    expect(screen.getByText("＋ ADD TRACK")).toBeInTheDocument();
  });

  it("renders the browser panel when browserOpen is true (the default)", () => {
    useDawStore.setState({ browserOpen: true });
    render(<App />);
    // The browser exposes its tab strip + a search field when open.
    expect(screen.getByRole("button", { name: "ALL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "INST" })).toBeInTheDocument();
  });

  it("keeps the closed modals (settings / sessions / piano-roll) out of the tree", () => {
    useDawStore.setState({ settingsOpen: false, sessionsOpen: false, editorOpen: false });
    render(<App />);

    // Settings panel renders null while settingsOpen is false (its "AUDIO
    // ENGINE" section heading is absent).
    expect(screen.queryByText("AUDIO ENGINE")).not.toBeInTheDocument();
    // Sessions panel renders null while sessionsOpen is false (its session-name
    // input placeholder is absent).
    expect(screen.queryByPlaceholderText("Session name…")).not.toBeInTheDocument();
  });

  it("mounts the settings overlay when settingsOpen is set, alongside the chrome", () => {
    useDawStore.setState({ settingsOpen: true });
    render(<App />);
    // The Settings overlay reveals its AUDIO ENGINE section once open, proving
    // it mounted into the same tree as the transport chrome.
    expect(screen.getByText("AUDIO ENGINE")).toBeInTheDocument();
    // …and the underlying transport chrome is still present beneath it.
    expect(screen.getByRole("button", { name: "PLAY" })).toBeInTheDocument();
  });

  it("renders without throwing when the engine bridge / AudioContext are absent", () => {
    // No window.__JUCE__, no AudioContext under happy-dom: the audio/engine
    // hooks must no-op rather than crash on mount.
    expect((globalThis as { AudioContext?: unknown }).AudioContext).toBeUndefined();
    expect((globalThis as { window?: { __JUCE__?: unknown } }).window?.__JUCE__).toBeUndefined();
    expect(() => render(<App />)).not.toThrow();
  });
});

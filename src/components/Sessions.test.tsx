// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sessions } from "./Sessions";
import { useDawStore } from "../store/useDawStore";

// The WAV bounce is exercised end-to-end in bounce.test.ts; here we only verify
// the button wires render → download, so mock both.
vi.mock("../lib/bounce", () => ({
  bounceToWav: vi.fn(async () => new Blob(["x"], { type: "audio/wav" })),
}));
vi.mock("../lib/download", () => ({ downloadBlob: vi.fn() }));
import { bounceToWav } from "../lib/bounce";
import { downloadBlob } from "../lib/download";

// Sessions persists via sessionBackend. Under happy-dom with no window.__JUCE__,
// that resolves to the localStorage browser backend, so save/list/open/delete go
// through localStorage with keys "zdaw:session:<name>".
const SKEY = (name: string) => `zdaw:session:${name}`;

type Snapshot = {
  sessionsOpen: boolean;
  currentSessionName: string | null;
  bpm: number;
};

let snapshot: Snapshot;

beforeEach(() => {
  const s = useDawStore.getState();
  snapshot = {
    sessionsOpen: s.sessionsOpen,
    currentSessionName: s.currentSessionName,
    bpm: s.bpm,
  };
  localStorage.clear();
});

afterEach(() => {
  useDawStore.setState(snapshot);
  localStorage.clear();
});

describe("Sessions", () => {
  it("renders nothing while the modal is closed", () => {
    useDawStore.setState({ sessionsOpen: false });
    const { container } = render(<Sessions />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Sessions")).not.toBeInTheDocument();
  });

  it("renders the modal header and SAVE / SAVED-SESSIONS sections when open", async () => {
    useDawStore.setState({ sessionsOpen: true, currentSessionName: null });
    render(<Sessions />);

    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("SAVE")).toBeInTheDocument();
    expect(screen.getByText("SAVED SESSIONS")).toBeInTheDocument();
    // No current session => the subtitle reads "Untitled session".
    expect(screen.getByText("Untitled session")).toBeInTheDocument();
    // Empty store => empty-list placeholder.
    await waitFor(() =>
      expect(screen.getByText("No saved sessions yet.")).toBeInTheDocument(),
    );
  });

  it("bounces to WAV and downloads it when the bounce button is clicked", async () => {
    useDawStore.setState({ sessionsOpen: true, currentSessionName: "My Jam" });
    render(<Sessions />);

    const btn = screen.getByRole("button", { name: /BOUNCE TO WAV/i });
    fireEvent.click(btn);

    await waitFor(() => expect(bounceToWav).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    const downloadMock = downloadBlob as unknown as { mock: { calls: unknown[][] } };
    expect(downloadMock.mock.calls[0][1]).toBe("My Jam.wav");
    await waitFor(() => expect(screen.getByText(/Bounced/)).toBeInTheDocument());
  });

  it("shows the current session name in the subtitle and as the SAVE caption", () => {
    useDawStore.setState({ sessionsOpen: true, currentSessionName: "My Jam" });
    render(<Sessions />);

    expect(screen.getByText("Current · My Jam")).toBeInTheDocument();
    // With a current session and an empty name field the primary button says SAVE.
    expect(screen.getByRole("button", { name: "SAVE" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SAVE AS" })).not.toBeInTheDocument();
  });

  it("switches the primary caption to SAVE AS once the name field has text", async () => {
    useDawStore.setState({ sessionsOpen: true, currentSessionName: "My Jam" });
    render(<Sessions />);

    const input = screen.getByPlaceholderText("My Jam") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Fresh Take" } });

    expect(screen.getByRole("button", { name: "SAVE AS" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SAVE" })).not.toBeInTheDocument();
  });

  it("uses the placeholder 'Session name…' when there is no current session", () => {
    useDawStore.setState({ sessionsOpen: true, currentSessionName: null });
    render(<Sessions />);
    expect(screen.getByPlaceholderText("Session name…")).toBeInTheDocument();
    // No current session + empty name => caption is SAVE AS.
    expect(screen.getByRole("button", { name: "SAVE AS" })).toBeInTheDocument();
  });

  it("closing via the ✕ header button sets sessionsOpen false in the store", () => {
    useDawStore.setState({ sessionsOpen: true });
    render(<Sessions />);

    fireEvent.click(screen.getByTitle("Close"));
    expect(useDawStore.getState().sessionsOpen).toBe(false);
  });

  it("clicking the dimmed backdrop closes the modal, but clicking inside does not", () => {
    useDawStore.setState({ sessionsOpen: true });
    const { container } = render(<Sessions />);

    // Clicking on the inner panel (header text) must NOT close.
    fireEvent.click(screen.getByText("Sessions"));
    expect(useDawStore.getState().sessionsOpen).toBe(true);

    // The outermost element is the backdrop; clicking it (target === currentTarget) closes.
    const backdrop = container.firstElementChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(useDawStore.getState().sessionsOpen).toBe(false);
  });

  it("pressing Escape on the modal closes it", () => {
    useDawStore.setState({ sessionsOpen: true });
    const { container } = render(<Sessions />);

    const backdrop = container.firstElementChild as HTMLElement;
    fireEvent.keyDown(backdrop, { key: "Escape" });
    expect(useDawStore.getState().sessionsOpen).toBe(false);
  });

  // Regression: outside-click dismissal must live on the backdrop, NOT a
  // document-level click listener — such a listener catches the very click that
  // opened the panel (the toolbar button is outside it) and closes it instantly.
  it("registers no document-level click listener while open", () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    useDawStore.setState({ sessionsOpen: true });
    render(<Sessions />);
    expect(addSpy.mock.calls.filter(([type]) => type === "click")).toHaveLength(0);
    addSpy.mockRestore();
  });

  it("hides the native Export/Import buttons in the browser backend (canUseFiles false)", () => {
    useDawStore.setState({ sessionsOpen: true });
    render(<Sessions />);
    expect(screen.queryByText("⤓ EXPORT .zdaw")).not.toBeInTheDocument();
    expect(screen.queryByText("⤒ IMPORT .zdaw")).not.toBeInTheDocument();
  });

  it("SAVE AS with a trimmed name persists the session, sets it current and shows a status", async () => {
    useDawStore.setState({ sessionsOpen: true, currentSessionName: null });
    render(<Sessions />);

    const input = screen.getByPlaceholderText("Session name…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Beat One  " } });
    fireEvent.click(screen.getByRole("button", { name: "SAVE AS" }));

    // Stored under the trimmed name.
    await waitFor(() => expect(localStorage.getItem(SKEY("Beat One"))).toBeTruthy());

    // Current session updated and a quoted status appears.
    expect(useDawStore.getState().currentSessionName).toBe("Beat One");
    await waitFor(() =>
      expect(screen.getByText(/Saved .*Beat One/)).toBeInTheDocument(),
    );
    // The name field is cleared after saving.
    expect(input.value).toBe("");
    // The freshly saved session now shows in the list.
    expect(await screen.findByText("Beat One")).toBeInTheDocument();
  });

  it("an empty/whitespace name is rejected with a 'Enter a name to save' status", async () => {
    useDawStore.setState({ sessionsOpen: true, currentSessionName: null });
    render(<Sessions />);

    const input = screen.getByPlaceholderText("Session name…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "   " } });
    // No current session and a blank name => save() reports the prompt.
    fireEvent.click(screen.getByRole("button", { name: "SAVE AS" }));

    await waitFor(() =>
      expect(screen.getByText("Enter a name to save")).toBeInTheDocument(),
    );
    // Nothing was written.
    expect(localStorage).toHaveLength(0);
  });

  it("pressing Enter in the name field saves-as that name", async () => {
    useDawStore.setState({ sessionsOpen: true, currentSessionName: null });
    render(<Sessions />);

    const input = screen.getByPlaceholderText("Session name…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Enter Jam" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(localStorage.getItem(SKEY("Enter Jam"))).toBeTruthy());
    expect(useDawStore.getState().currentSessionName).toBe("Enter Jam");
  });

  it("SAVE (no name) re-saves the current session", async () => {
    // Seed a stored session and make it current.
    localStorage.setItem(
      SKEY("Live Set"),
      JSON.stringify({ version: 3, name: "Live Set", savedAt: "2024-01-01T00:00:00.000Z", ui: {} }),
    );
    useDawStore.setState({ sessionsOpen: true, currentSessionName: "Live Set" });
    render(<Sessions />);

    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));

    await waitFor(() =>
      expect(screen.getByText(/Saved .*Live Set/)).toBeInTheDocument(),
    );
    // savedAt was rewritten (overwrite happened).
    const stored = JSON.parse(localStorage.getItem(SKEY("Live Set")) ?? "{}");
    expect(stored.savedAt).not.toBe("2024-01-01T00:00:00.000Z");
    expect(useDawStore.getState().currentSessionName).toBe("Live Set");
  });

  it("clicking NEW resets to a fresh session and shows 'New session'", async () => {
    useDawStore.setState({ sessionsOpen: true, currentSessionName: "Old", bpm: 90 });
    render(<Sessions />);

    fireEvent.click(screen.getByRole("button", { name: "NEW" }));

    expect(useDawStore.getState().currentSessionName).toBeNull();
    expect(useDawStore.getState().bpm).toBe(124); // newSession defaults
    await waitFor(() => expect(screen.getByText("New session")).toBeInTheDocument());
  });

  it("lists saved sessions on open, sorted nothing-special, and renders each name + date", async () => {
    localStorage.setItem(
      SKEY("Alpha"),
      JSON.stringify({ version: 3, name: "Alpha", savedAt: "2024-03-04T10:00:00.000Z", ui: {} }),
    );
    localStorage.setItem(
      SKEY("Beta"),
      JSON.stringify({ version: 3, name: "Beta", ui: {} }), // no savedAt => "—"
    );
    // Reserved (underscore-prefixed) entries must be hidden from the list.
    localStorage.setItem(
      SKEY("__autosave__"),
      JSON.stringify({ version: 3, name: "__autosave__", ui: {} }),
    );

    useDawStore.setState({ sessionsOpen: true });
    render(<Sessions />);

    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    // Reserved entry is filtered out.
    expect(screen.queryByText("__autosave__")).not.toBeInTheDocument();
    // Beta has no savedAt => em-dash placeholder.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("opening a saved session via OPEN applies it, sets current and closes the modal", async () => {
    localStorage.setItem(
      SKEY("Loadable"),
      JSON.stringify({
        version: 3,
        name: "Loadable",
        savedAt: "2024-05-01T00:00:00.000Z",
        ui: { bpm: 77 },
      }),
    );
    useDawStore.setState({ sessionsOpen: true, currentSessionName: null });
    render(<Sessions />);

    // name text div → its parent is the title="Open" button → grandparent is the row.
    const row = (await screen.findByText("Loadable")).closest("button")!
      .parentElement as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "OPEN" }));

    await waitFor(() => expect(useDawStore.getState().sessionsOpen).toBe(false));
    expect(useDawStore.getState().currentSessionName).toBe("Loadable");
    // applySession hydrated the bpm from the loaded ui.
    expect(useDawStore.getState().bpm).toBe(77);
  });

  it("clicking the session-name button (not the OPEN button) also opens it", async () => {
    localStorage.setItem(
      SKEY("ClickName"),
      JSON.stringify({ version: 3, name: "ClickName", ui: { bpm: 101 } }),
    );
    useDawStore.setState({ sessionsOpen: true, currentSessionName: null });
    render(<Sessions />);

    fireEvent.click(await screen.findByText("ClickName"));

    await waitFor(() => expect(useDawStore.getState().currentSessionName).toBe("ClickName"));
    expect(useDawStore.getState().bpm).toBe(101);
    expect(useDawStore.getState().sessionsOpen).toBe(false);
  });

  it("opening a name that has no stored data shows a 'Could not open' status and stays open", async () => {
    // List entry present but its data removed afterwards to force load() === null.
    localStorage.setItem(
      SKEY("Phantom"),
      JSON.stringify({ version: 3, name: "Phantom", ui: {} }),
    );
    useDawStore.setState({ sessionsOpen: true, currentSessionName: null });
    render(<Sessions />);

    await screen.findByText("Phantom");
    // Now delete the underlying data so load() returns null.
    localStorage.removeItem(SKEY("Phantom"));

    fireEvent.click(screen.getByRole("button", { name: "OPEN" }));

    await waitFor(() =>
      expect(screen.getByText(/Could not open .*Phantom/)).toBeInTheDocument(),
    );
    // Modal stays open; current unchanged.
    expect(useDawStore.getState().sessionsOpen).toBe(true);
    expect(useDawStore.getState().currentSessionName).toBeNull();
  });

  it("deleting a session removes it from storage, shows a status and clears current if it was current", async () => {
    localStorage.setItem(
      SKEY("Trash Me"),
      JSON.stringify({ version: 3, name: "Trash Me", ui: {} }),
    );
    useDawStore.setState({ sessionsOpen: true, currentSessionName: "Trash Me" });
    render(<Sessions />);

    const row = (await screen.findByText("Trash Me")).closest("button")!
      .parentElement as HTMLElement;
    // The delete button is the trailing ✕ inside the row.
    const delBtn = within(row).getByTitle("Delete");
    fireEvent.click(delBtn);

    await waitFor(() => expect(localStorage.getItem(SKEY("Trash Me"))).toBeNull());
    expect(useDawStore.getState().currentSessionName).toBeNull();
    await waitFor(() =>
      expect(screen.getByText(/Deleted .*Trash Me/)).toBeInTheDocument(),
    );
    // Row is gone; back to empty placeholder.
    expect(screen.getByText("No saved sessions yet.")).toBeInTheDocument();
  });

  it("deleting a non-current session leaves currentSessionName intact", async () => {
    localStorage.setItem(SKEY("Keeper"), JSON.stringify({ version: 3, name: "Keeper", ui: {} }));
    localStorage.setItem(SKEY("Goner"), JSON.stringify({ version: 3, name: "Goner", ui: {} }));
    useDawStore.setState({ sessionsOpen: true, currentSessionName: "Keeper" });
    render(<Sessions />);

    const row = (await screen.findByText("Goner")).closest("button")!
      .parentElement as HTMLElement;
    fireEvent.click(within(row).getByTitle("Delete"));

    await waitFor(() => expect(localStorage.getItem(SKEY("Goner"))).toBeNull());
    // Keeper is still current and still listed.
    expect(useDawStore.getState().currentSessionName).toBe("Keeper");
    expect(screen.getByText("Keeper")).toBeInTheDocument();
  });

  it("re-opening the modal clears any prior status and name input", async () => {
    useDawStore.setState({ sessionsOpen: true, currentSessionName: null });
    const { rerender } = render(<Sessions />);

    const input = screen.getByPlaceholderText("Session name…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Temp" } });
    fireEvent.click(screen.getByRole("button", { name: "SAVE AS" }));
    await waitFor(() => expect(screen.getByText(/Saved .*Temp/)).toBeInTheDocument());

    // Close then re-open; the open-effect resets name + status.
    useDawStore.setState({ sessionsOpen: false });
    rerender(<Sessions />);
    useDawStore.setState({ sessionsOpen: true });
    rerender(<Sessions />);

    await waitFor(() =>
      expect(screen.queryByText(/Saved .*Temp/)).not.toBeInTheDocument(),
    );
    // SAVE AS made "Temp" the current session, so the input placeholder is now "Temp"
    // and (crucially) the open-effect reset the field value back to empty.
    const reopened = screen.getByRole("textbox") as HTMLInputElement;
    expect(reopened.value).toBe("");
    expect(reopened).toHaveAttribute("placeholder", "Temp");
  });

  it("typing into the name field with userEvent updates the controlled value", async () => {
    const user = userEvent.setup();
    useDawStore.setState({ sessionsOpen: true, currentSessionName: null });
    render(<Sessions />);

    const input = screen.getByPlaceholderText("Session name…") as HTMLInputElement;
    await user.type(input, "Groove");
    expect(input).toHaveValue("Groove");
    expect(screen.getByRole("button", { name: "SAVE AS" })).toBeInTheDocument();
  });
});

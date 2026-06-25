// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

// Mock the history module so we assert wiring, not undo/redo internals.
vi.mock("../lib/history", () => ({ undo: vi.fn(), redo: vi.fn() }));

import { useGlobalKeys } from "./useGlobalKeys";
import { undo, redo } from "../lib/history";
import { useDawStore } from "../store/useDawStore";

function Harness() {
  useGlobalKeys();
  return null;
}

beforeEach(() => {
  useDawStore.setState({ playing: false });
  render(<Harness />);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useDawStore.setState({ playing: false });
});

const key = (init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));

describe("useGlobalKeys", () => {
  it("Cmd/Ctrl+Z triggers undo", () => {
    key({ key: "z", ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).not.toHaveBeenCalled();
  });

  it("Cmd/Ctrl+Shift+Z triggers redo", () => {
    key({ key: "z", metaKey: true, shiftKey: true });
    expect(redo).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
  });

  it("Ctrl+Y triggers redo (Windows idiom)", () => {
    key({ key: "y", ctrlKey: true });
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it("ignores a bare Z (no modifier)", () => {
    key({ key: "z" });
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it("does not hijack undo while typing in an input", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    expect(undo).not.toHaveBeenCalled();
    input.remove();
  });

  it("Space toggles play/pause when nothing interactive is focused", () => {
    expect(useDawStore.getState().playing).toBe(false);
    key({ key: " " });
    expect(useDawStore.getState().playing).toBe(true);
    key({ key: " " });
    expect(useDawStore.getState().playing).toBe(false);
  });

  it("Space is ignored while typing in a text field", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(useDawStore.getState().playing).toBe(false);
    input.remove();
  });

  it("Space activates a focused button instead of toggling transport", () => {
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    btn.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(useDawStore.getState().playing).toBe(false);
    btn.remove();
  });

  it("modified Space (e.g. Ctrl+Space) does not toggle transport", () => {
    key({ key: " ", ctrlKey: true });
    expect(useDawStore.getState().playing).toBe(false);
  });
});

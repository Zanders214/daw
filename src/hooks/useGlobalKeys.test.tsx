// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

// Mock the history module so we assert wiring, not undo/redo internals.
vi.mock("../lib/history", () => ({ undo: vi.fn(), redo: vi.fn() }));

import { useGlobalKeys } from "./useGlobalKeys";
import { undo, redo } from "../lib/history";

function Harness() {
  useGlobalKeys();
  return null;
}

beforeEach(() => {
  render(<Harness />);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
});

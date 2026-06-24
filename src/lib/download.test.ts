// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "./download";

let created: string[];
let revoked: string[];
let clicked: HTMLAnchorElement[];

beforeEach(() => {
  created = [];
  revoked = [];
  clicked = [];
  vi.useFakeTimers();
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => {
    const u = `blob:fake-${created.length}`;
    created.push(u);
    return u;
  };
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = (u) => {
    revoked.push(u);
  };
  // Capture programmatic anchor clicks (happy-dom would otherwise try to navigate).
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("downloadBlob", () => {
  it("creates an object URL, clicks a download anchor, and cleans up", () => {
    const blob = new Blob(["x"], { type: "audio/wav" });
    downloadBlob(blob, "Song.wav");

    expect(created).toHaveLength(1);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("Song.wav");
    expect(clicked[0].href).toContain("blob:fake-0");
    // Anchor is removed from the DOM after the click.
    expect(document.querySelector("a[download]")).toBeNull();

    // URL is revoked on the next tick.
    expect(revoked).toHaveLength(0);
    vi.runAllTimers();
    expect(revoked).toEqual(["blob:fake-0"]);
  });
});

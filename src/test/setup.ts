/**
 * Shared Vitest setup. Registers @testing-library/jest-dom matchers, unmounts any
 * rendered React tree after each test (so component tests stay isolated), and
 * stubs the handful of browser APIs happy-dom doesn't implement that our
 * components touch on mount (ResizeObserver, matchMedia, canvas 2d context).
 *
 * Harmless for node-environment unit tests: cleanup is a no-op when nothing was
 * rendered, and the stubs only install when the global/prototype is missing.
 * Component/DOM test files opt into a DOM via a `// @vitest-environment happy-dom`
 * docblock.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// --- minimal browser-API stubs (only when running in a DOM that lacks them) ---
const g = globalThis as unknown as Record<string, unknown>;

if (typeof g.ResizeObserver === "undefined") {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof g.IntersectionObserver === "undefined") {
  g.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
}

if (typeof g.window !== "undefined" && typeof (g.window as Window).matchMedia !== "function") {
  (g.window as unknown as Record<string, unknown>).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  });
}

// A permissive no-op CanvasRenderingContext2D so Ruler/Playhead/meters render.
type CanvasProto = { getContext?: (id: string) => unknown };
const canvasProto: CanvasProto | undefined = (g.HTMLCanvasElement as { prototype?: CanvasProto })
  ?.prototype;
if (canvasProto && typeof canvasProto.getContext !== "function") {
  const ctx2d = new Proxy(
    { measureText: () => ({ width: 0 }), canvas: {} },
    {
      get(target: Record<string, unknown>, prop: string) {
        if (prop in target) return target[prop];
        // any drawing call → no-op; any unknown property → 0
        return typeof prop === "string" ? () => undefined : 0;
      },
    },
  );
  canvasProto.getContext = (id: string) => (id === "2d" ? ctx2d : null);
}

/**
 * Engine client — the seam between the React UI and the native host.
 *
 * When the app runs inside the JUCE host, `window.__JUCE__` is injected by
 * `WebBrowserComponent` with native integration enabled. We talk to the C++
 * engine through it: `getNativeFunction(name)(...)` for JS→C++ commands and
 * `addEventListener(id, cb)` for C++→JS state events.
 *
 * When the app runs in a plain browser (or Tauri), `window.__JUCE__` is absent
 * and every command becomes a no-op — the UI falls back to its built-in
 * simulation (see `useTransportLoop`). This keeps one React build working in
 * both shells.
 *
 * Command/event names are flat tokens (no dots/slashes) so they're valid
 * `juce::Identifier`s on the C++ side. Targets the JUCE 8 `window.__JUCE__`
 * backend API; can be swapped for the official `juce-framework-frontend`
 * package without changing callers.
 */
import type { DeviceKey } from "../types";

interface JuceBackend {
  getNativeFunction: (name: string) => (...args: unknown[]) => Promise<unknown>;
  emitEvent: (id: string, payload: unknown) => void;
  addEventListener: (id: string, cb: (payload: unknown) => void) => unknown;
  removeEventListener?: (token: unknown) => void;
}

declare global {
  interface Window {
    __JUCE__?: { backend?: JuceBackend };
  }
}

function backend(): JuceBackend | undefined {
  return typeof window !== "undefined" ? window.__JUCE__?.backend : undefined;
}

/** True when running inside the JUCE host (native engine available). */
export function engineActive(): boolean {
  return !!backend();
}

const fnCache = new Map<string, (...a: unknown[]) => Promise<unknown>>();

function call(name: string, ...args: unknown[]): Promise<unknown> {
  const b = backend();
  if (!b) return Promise.resolve(undefined);
  let f = fnCache.get(name);
  if (!f) {
    f = b.getNativeFunction(name);
    fnCache.set(name, f);
  }
  return f(...args);
}

// ---- C++ -> JS state shapes ----
export interface EngineState {
  playhead?: number;
  playing?: boolean;
  master?: number;
  reel?: number;
  levels?: Record<string, number>;
}
export interface EngineParam {
  id: string;
  name: string;
  value: number;
  text: string;
}
export interface PluginStatus {
  loaded: boolean;
  name?: string;
  path?: string;
}
export type PluginStatuses = Partial<Record<DeviceKey, PluginStatus>>;

// ---- JS -> C++ commands (names match native functions registered in WebUI.cpp) ----
export const engine = {
  transport: {
    setPlaying: (v: boolean) => call("transportSetPlaying", v),
    stop: () => call("transportStop"),
    setPosition: (beats: number) => call("transportSetPosition", beats),
    setLooping: (v: boolean) => call("transportSetLooping", v),
    setRecording: (v: boolean) => call("transportSetRecording", v),
    setTempo: (bpm: number) => call("transportSetTempo", bpm),
  },
  mixer: {
    setTrackVolume: (id: string, v: number) => call("mixerSetTrackVolume", id, v),
    setTrackMute: (id: string, v: boolean) => call("mixerSetTrackMute", id, v),
    setTrackSolo: (id: string, v: boolean) => call("mixerSetTrackSolo", id, v),
    setTrackArm: (id: string, v: boolean) => call("mixerSetTrackArm", id, v),
  },
  device: {
    setBypass: (key: DeviceKey, bypassed: boolean) => call("deviceSetBypass", key, bypassed),
    setParam: (key: DeviceKey, paramId: string, v: number) => call("deviceSetParam", key, paramId, v),
    openEditor: (key: DeviceKey) => call("deviceOpenEditor", key),
    closeEditor: (key: DeviceKey) => call("deviceCloseEditor", key),
    listParams: (key: DeviceKey) => call("deviceListParams", key),
  },
  plugins: {
    scan: () => call("pluginsScan"),
    assign: (key: DeviceKey, path: string) => call("pluginsAssign", key, path),
    pickFile: (key: DeviceKey) => call("pluginsPickFile", key),
  },
  audio: {
    getDevices: () => call("audioGetDevices"),
    setSettings: (opts: Record<string, unknown>) => call("audioSetSettings", opts),
  },
  source: {
    pickFile: () => call("sourcePickFile"),
    setInputMode: (mode: "file" | "input") => call("sourceSetInputMode", mode),
  },
};

export interface EngineHandlers {
  onState?: (s: EngineState) => void;
  onParams?: (p: { key: DeviceKey; params: EngineParam[] }) => void;
  onPlugins?: (p: PluginStatuses) => void;
  onReady?: (info: unknown) => void;
}

/** Subscribe to engine events. Returns an unsubscribe fn (no-op if inactive). */
export function subscribeEngine(h: EngineHandlers): () => void {
  const b = backend();
  if (!b) return () => {};
  const tokens: unknown[] = [];
  const add = (id: string, cb: (p: unknown) => void) => tokens.push(b.addEventListener(id, cb));
  if (h.onState) add("engineState", (p) => h.onState!(p as EngineState));
  if (h.onParams) add("engineParams", (p) => h.onParams!(p as { key: DeviceKey; params: EngineParam[] }));
  if (h.onPlugins) add("enginePlugins", (p) => h.onPlugins!(p as PluginStatuses));
  if (h.onReady) add("engineReady", (p) => h.onReady!(p));
  return () => {
    if (b.removeEventListener) tokens.forEach((t) => b.removeEventListener!(t));
  };
}

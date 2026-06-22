/**
 * Engine client — the seam between the React UI and the native host.
 *
 * When the app runs inside the JUCE host, `window.__JUCE__` is injected by
 * `WebBrowserComponent` with native integration enabled. We talk to the C++
 * engine through it: `emitEvent("__juce__invoke", …)` for JS→C++ commands
 * (each resolved by a matching `__juce__complete` event) and
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
import type { DeviceKey, DeviceDescriptor, DeviceKind, TrackType } from "../types";

interface JuceBackend {
  // JUCE 8's `window.__JUCE__.backend` exposes exactly these primitives.
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
  return globalThis.window === undefined ? undefined : globalThis.window.__JUCE__?.backend;
}

/** True when running inside the JUCE host (native engine available). */
export function engineActive(): boolean {
  return !!backend();
}

// JS -> C++ calls use JUCE's built-in invoke protocol: emit `__juce__invoke`
// with a unique resultId, then resolve when the matching `__juce__complete`
// event returns. (`getNativeFunction` is NOT a method on `backend` — it's a
// top-level export of JUCE's frontend module. Calling it as `backend.
// getNativeFunction(...)` threw and unmounted the whole UI, i.e. the black
// screen seen right after the page first painted.)
let nextResultId = 1;
const pending = new Map<number, (result: unknown) => void>();
let completeWired = false;

function ensureCompleteListener(b: JuceBackend): void {
  if (completeWired) return;
  completeWired = true;
  b.addEventListener("__juce__complete", (payload) => {
    const { promiseId, result } = (payload ?? {}) as { promiseId: number; result: unknown };
    const resolve = pending.get(promiseId);
    if (resolve) {
      pending.delete(promiseId);
      resolve(result);
    }
  });
}

function call(name: string, ...args: unknown[]): Promise<unknown> {
  const b = backend();
  if (!b) return Promise.resolve(undefined);
  ensureCompleteListener(b);
  const resultId = nextResultId++;
  const result = new Promise<unknown>((resolve) => pending.set(resultId, resolve));
  b.emitEvent("__juce__invoke", { name, params: args, resultId });
  return result;
}

// ---- C++ -> JS state shapes ----
export interface EngineState {
  playhead?: number;
  playing?: boolean;
  master?: number;
  reel?: number;
  levels?: Record<string, number>;
  groupLevels?: Record<string, number>;
  returnLevels?: number[];
  loopStart?: number;
  loopEnd?: number;
  tempo?: number;
  masterVolume?: number;
}
export interface TrackInfo {
  loaded: boolean;
  name?: string;
  path?: string;
}
export type TrackInfos = Record<string, TrackInfo>;
export interface DeviceInfo {
  outputDevice?: string;
  inputDevice?: string;
  sampleRate?: number; // Hz
  bufferSize?: number;
  sampleRates?: number[]; // Hz
  bufferSizes?: number[];
  outputs?: string[];
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

/** One device instance in a node's insert rack. */
export interface NodeDevice {
  /** Stable per-instance id (frontend-generated so the optimistic store and the
   *  engine agree on identity). */
  id: string;
  /** Built-in key (`eq`/`tape`/`pre`), `"vst3"`, or another built-in fx token. */
  kind: DeviceKind;
  name: string;
  bypassed?: boolean;
  /** VST3/AU file path for external plugins (`kind: "vst3"`). */
  path?: string;
  /** True when a saved external plugin could not be located at load. */
  missing?: boolean;
}
/** { nodeId: [devices...] } for every node with a non-empty insert rack. */
export type NodeRacks = Record<string, NodeDevice[]>;

// ---- JS -> C++ commands (names match native functions registered in WebUI.cpp) ----
export const engine = {
  transport: {
    setPlaying: (v: boolean) => call("transportSetPlaying", v),
    stop: () => call("transportStop"),
    setPosition: (beats: number) => call("transportSetPosition", beats),
    setLooping: (v: boolean) => call("transportSetLooping", v),
    setRecording: (v: boolean) => call("transportSetRecording", v),
    setTempo: (bpm: number) => call("transportSetTempo", bpm),
    setLoopStart: (beats: number) => call("transportSetLoopStart", beats),
    setLoopEnd: (beats: number) => call("transportSetLoopEnd", beats),
  },
  mixer: {
    setTrackVolume: (id: string, v: number) => call("mixerSetTrackVolume", id, v),
    setTrackPan: (id: string, v: number) => call("mixerSetTrackPan", id, v),
    setTrackMute: (id: string, v: boolean) => call("mixerSetTrackMute", id, v),
    setTrackSolo: (id: string, v: boolean) => call("mixerSetTrackSolo", id, v),
    setTrackArm: (id: string, v: boolean) => call("mixerSetTrackArm", id, v),
    setTrackGroup: (id: string, groupId: string) => call("mixerSetTrackGroup", id, groupId),
    setTrackSend: (id: string, idx: number, v: number) => call("mixerSetTrackSend", id, idx, v),
    setMasterVolume: (v: number) => call("mixerSetMasterVolume", v),
    setMasterPan: (v: number) => call("mixerSetMasterPan", v),
  },
  group: {
    setGain: (id: string, v: number) => call("groupSetGain", id, v),
    setPan: (id: string, v: number) => call("groupSetPan", id, v),
    setMute: (id: string, v: boolean) => call("groupSetMute", id, v),
    setSolo: (id: string, v: boolean) => call("groupSetSolo", id, v),
  },
  returns: {
    setGain: (idx: number, v: number) => call("returnSetGain", idx, v),
  },
  automation: {
    // Replace one node+param breakpoint envelope (points = AutoPoint[] {t,v}).
    // Only enabled lanes are pushed; the engine evaluates them per audio block.
    set: (nodeId: string, paramId: string, points: { t: number; v: number }[]) =>
      call("automationSet", nodeId, paramId, points),
    clear: (nodeId: string, paramId: string) => call("automationClear", nodeId, paramId),
    clearAll: () => call("automationClearAll"),
  },
  node: {
    // Per-node insert FX (nodeId = track id | group id | "return-N"). Devices are
    // addressed by a frontend-generated instance id; `add` takes a full descriptor.
    add: (nodeId: string, instanceId: string, d: DeviceDescriptor) =>
      call("nodeDeviceAdd", nodeId, { id: instanceId, kind: d.kind, path: d.path ?? "" }),
    remove: (nodeId: string, instanceId: string) => call("nodeDeviceRemove", nodeId, instanceId),
    setBypass: (nodeId: string, instanceId: string, b: boolean) =>
      call("nodeDeviceSetBypass", nodeId, instanceId, b),
    openEditor: (nodeId: string, instanceId: string) => call("nodeDeviceOpenEditor", nodeId, instanceId),
    closeEditor: (nodeId: string, instanceId: string) => call("nodeDeviceCloseEditor", nodeId, instanceId),
    // Open a native file chooser to add an arbitrary external VST3 to a node rack.
    pickFile: (nodeId: string, instanceId: string) => call("nodeDevicePickFile", nodeId, instanceId),
    // Params of one node device, each with a ready-to-use automation id ("dev:<instanceId>:i").
    listParams: (nodeId: string, instanceId: string) =>
      call("nodeDeviceListParams", nodeId, instanceId) as Promise<{ id: string; name: string }[] | undefined>,
  },
  track: {
    create: (id: string, name: string, type: TrackType, color: string, group: string) =>
      call("trackCreate", id, name, type, color, group),
    delete: (id: string) => call("trackDelete", id),
    assignFile: (id: string, path: string) => call("trackAssignFile", id, path),
    pickFile: (id: string) => call("trackPickFile", id),
    clearFile: (id: string) => call("trackClearFile", id),
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
    // Every plugin discovered in the default scan locations (for the browser list).
    list: () => call("pluginsList") as Promise<{ name: string; path: string; format: string }[] | undefined>,
  },
  audio: {
    getDevices: () => call("audioGetDevices") as Promise<DeviceInfo | undefined>,
    setSettings: (opts: Record<string, unknown>) =>
      call("audioSetSettings", opts) as Promise<DeviceInfo | undefined>,
  },
  source: {
    pickFile: () => call("sourcePickFile"),
    setInputMode: (mode: "file" | "input") => call("sourceSetInputMode", mode),
  },
  session: {
    // The web sends only the `ui` payload; C++ wraps it and captures plugin state.
    save: (name: string, ui: unknown) => call("sessionSave", name, ui),
    load: (name: string) => call("sessionLoad", name), // resolves to the ui object, or empty if absent
    list: () => call("sessionList"),
    remove: (name: string) => call("sessionDelete", name),
    export: (name: string, ui: unknown) => call("sessionExport", name, ui),
    import: () => call("sessionImport"), // result arrives via the engineSessionImported event
    savePrefs: (prefs: unknown) => call("prefsSave", prefs),
    loadPrefs: () => call("prefsLoad"),
  },
};

/** Payload of the engineSessionImported event (native Import dialog result). */
export interface ImportedSession {
  name?: string;
  ui: unknown;
}

export interface EngineHandlers {
  onState?: (s: EngineState) => void;
  onParams?: (p: { key: DeviceKey; params: EngineParam[] }) => void;
  onPlugins?: (p: PluginStatuses) => void;
  onTracks?: (t: TrackInfos) => void;
  onNodeRacks?: (r: NodeRacks) => void;
  onSessionImported?: (p: ImportedSession) => void;
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
  if (h.onTracks) add("engineTracks", (p) => h.onTracks!(p as TrackInfos));
  if (h.onNodeRacks) add("engineNodeRacks", (p) => h.onNodeRacks!(p as NodeRacks));
  if (h.onSessionImported) add("engineSessionImported", (p) => h.onSessionImported!(p as ImportedSession));
  if (h.onReady) add("engineReady", (p) => h.onReady!(p));
  return () => {
    if (b.removeEventListener) tokens.forEach((t) => b.removeEventListener!(t));
  };
}

/**
 * Persistent Web Audio mixer graph for the offline shell. Built once on the shared
 * AudioContext and reconciled from the Zustand store (driven by useMixerGraph), so
 * triggered note voices route through live track gain/pan → group bus → master, with
 * post-fader aux sends → return buses, and per-node insert-FX *approximations*.
 *
 * No real plugins run here — `kind`-based stand-ins only (the real VST3s run in the
 * JUCE host). Disabled entirely when hosted (useMixerGraph guards on engineActive).
 *
 * The pure helpers at the top take a store snapshot and contain no Web Audio, so they
 * unit-test in jsdom; everything below needs an AudioContext and no-ops without one.
 */
import type { DawState } from "../store/useDawStore";
import { DEFAULT_VOLUME } from "./constants";
import { whiteNoise } from "./noise";
import { ensureAudio } from "./audio";

const NUM_RETURNS = 2;

// ---- pure helpers (no Web Audio) ----

/** The group id a track belongs to, or null when ungrouped. */
export function groupOfTrack(s: DawState, trackId: string): string | null {
  for (const g of s.groups) if (g.tracks.includes(trackId)) return g.id;
  return null;
}

/** A track's effective linear gain after mute/solo (0 = silent). */
export function effectiveTrackGain(s: DawState, trackId: string): number {
  if (s.mutes[trackId]) return 0;
  const anySolo = Object.values(s.solos).some(Boolean);
  if (anySolo && !s.solos[trackId]) return 0;
  return s.volumes[trackId] ?? DEFAULT_VOLUME;
}

/** A group bus's effective linear gain after group mute/solo. */
export function effectiveGroupGain(s: DawState, groupId: string): number {
  if (s.groupMutes[groupId]) return 0;
  const anySolo = Object.values(s.groupSolos).some(Boolean);
  if (anySolo && !s.groupSolos[groupId]) return 0;
  return s.groupVolumes[groupId] ?? 1;
}

/** UI pan (0=L, 0.5=C, 1=R) → StereoPanner range (-1..1). */
export const panToStereo = (pan: number): number => pan * 2 - 1;

/** PreDrop master HPF cutoff in Hz from its amount (matches the device UI's chip). */
export const preHpfHz = (amount: number): number => 20 * 40 ** (amount ** 1.5);

/** Insert-rack signature for one node (rebuild the FX chain only when this changes). */
function rackSig(s: DawState, nodeId: string): string {
  return (s.nodeRacks[nodeId] ?? []).map((d) => `${d.kind}:${d.bypassed ? 0 : 1}`).join(",");
}

/** Compact signature of all mix-relevant state, for cheap change detection so we
 *  reconcile only on real mix changes (not the per-frame playhead/levels). */
export function mixSignature(s: DawState): string {
  const racks: Record<string, string> = {};
  for (const k of Object.keys(s.nodeRacks)) racks[k] = rackSig(s, k);
  return JSON.stringify({
    t: s.tracks.map((t) => t.id),
    g: s.groups.map((g) => [g.id, g.tracks] as const),
    vol: s.volumes, pan: s.pans, mute: s.mutes, solo: s.solos,
    gv: s.groupVolumes, gp: s.groupPans, gm: s.groupMutes, gs: s.groupSolos,
    snd: s.sends, ret: s.returnGains, mv: s.masterVolume, mp: s.masterPan,
    dev: s.devices, pre: s.preAmount, racks,
  });
}

// ---- the graph (needs an AudioContext) ----

interface FxChain { input: AudioNode; output: AudioNode; nodes: AudioNode[] }

interface NodeStrip {
  /** Head: voices (tracks) or summed children connect here; also the FX-chain input. */
  input: GainNode;
  gain: GainNode; // fader (after FX)
  pan: StereoPannerNode;
  meter: AnalyserNode; // post-pan level tap
  fx: FxChain | null;
  fxSig: string;
}
interface TrackStrip extends NodeStrip {
  sends: GainNode[]; // post-fader taps → return inputs
  destId: string | null; // current routing target group id, or null = master
}
interface ReturnStrip { input: GainNode; gain: GainNode; meter: AnalyserNode }
interface MasterStrip extends NodeStrip {}

let master: MasterStrip | null = null;
let returns: ReturnStrip[] = [];
const tracks = new Map<string, TrackStrip>();
const groups = new Map<string, NodeStrip>();

const num = (v: number, d: number) => (Number.isFinite(v) ? v : d);

/** Build one device approximation as an {input,output} pair. */
function buildDevice(c: AudioContext, kind: string, preAmount?: number): FxChain {
  if (kind === "eq") {
    const low = c.createBiquadFilter();
    low.type = "lowshelf"; low.frequency.value = 120; low.gain.value = 3;
    const high = c.createBiquadFilter();
    high.type = "highshelf"; high.frequency.value = 6000; high.gain.value = 2;
    low.connect(high);
    return { input: low, output: high, nodes: [low, high] };
  }
  if (kind === "pre") {
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = preAmount === undefined ? 30 : preHpfHz(preAmount);
    return { input: hp, output: hp, nodes: [hp] };
  }
  if (kind === "tape") {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 7000;
    return { input: lp, output: lp, nodes: [lp] };
  }
  // vst3 / unknown: can't run a real plugin offline → transparent pass-through.
  const g = c.createGain();
  return { input: g, output: g, nodes: [g] };
}

/** Series-connect a list of device kinds into one FX chain (pass-through if empty). */
function buildChain(c: AudioContext, kinds: { kind: string; preAmount?: number }[]): FxChain {
  if (kinds.length === 0) {
    const g = c.createGain();
    return { input: g, output: g, nodes: [g] };
  }
  const parts = kinds.map((k) => buildDevice(c, k.kind, k.preAmount));
  for (let i = 1; i < parts.length; i++) parts[i - 1].output.connect(parts[i].input);
  return { input: parts[0].input, output: parts[parts.length - 1].output, nodes: parts.flatMap((p) => p.nodes) };
}

/** Re-wire a strip's FX chain (input → [fx] → gain) when its devices change. */
function setStripFx(c: AudioContext, strip: NodeStrip, kinds: { kind: string; preAmount?: number }[]) {
  try { strip.input.disconnect(); } catch { /* not connected */ }
  if (strip.fx) for (const n of strip.fx.nodes) { try { n.disconnect(); } catch { /* idem */ } }
  const fx = buildChain(c, kinds);
  strip.input.connect(fx.input);
  fx.output.connect(strip.gain);
  strip.fx = fx;
}

function makeMeter(c: AudioContext): AnalyserNode {
  const a = c.createAnalyser();
  a.fftSize = 256;
  return a;
}

function makeStrip(c: AudioContext): NodeStrip {
  const input = c.createGain();
  const gain = c.createGain();
  const pan = c.createStereoPanner();
  const meter = makeMeter(c);
  gain.connect(pan);
  pan.connect(meter); // side tap for metering (no onward connection needed)
  return { input, gain, pan, meter, fx: null, fxSig: "" };
}

function ensureGraph(c: AudioContext) {
  if (master) return;
  const m = makeStrip(c) as MasterStrip;
  m.pan.connect(c.destination);
  master = m;
  returns = Array.from({ length: NUM_RETURNS }, () => {
    const r: ReturnStrip = { input: c.createGain(), gain: c.createGain(), meter: makeMeter(c) };
    r.gain.connect(r.meter); // level tap
    return r;
  });
  // Built-in return FX: 0 = reverb (convolver), 1 = feedback delay.
  const reverb = c.createConvolver();
  reverb.buffer = makeImpulse(c, 1.6);
  returns[0].input.connect(reverb); reverb.connect(returns[0].gain);
  const delay = c.createDelay(1);
  delay.delayTime.value = 0.33;
  const fb = c.createGain(); fb.gain.value = 0.38;
  returns[1].input.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(returns[1].gain);
  for (const r of returns) r.gain.connect(m.input);
}

function makeImpulse(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds));
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const noise = whiteNoise(len);
    for (let i = 0; i < len; i++) data[i] = noise[i] * (1 - i / len) ** 2.2;
  }
  return buf;
}

/** Track input node a voice should connect to (creates the strip on demand). */
export function getTrackInput(trackId: string): AudioNode | null {
  const c = ensureAudio();
  if (!c) return null;
  ensureGraph(c);
  let st = tracks.get(trackId);
  if (!st) {
    st = makeStrip(c) as TrackStrip;
    st.sends = returns.map(() => c.createGain());
    st.destId = null;
    st.pan.connect(master!.input);
    st.sends.forEach((sg, i) => { st!.pan.connect(sg); sg.connect(returns[i].input); });
    tracks.set(trackId, st);
  }
  return st.input;
}

function ensureGroup(c: AudioContext, groupId: string): NodeStrip {
  let g = groups.get(groupId);
  if (!g) {
    g = makeStrip(c);
    g.pan.connect(master!.input);
    groups.set(groupId, g);
  }
  return g;
}

/** Enabled, non-bypassed device kinds for a node's insert rack. */
function activeRackKinds(s: DawState, nodeId: string): { kind: string }[] {
  return (s.nodeRacks[nodeId] ?? []).filter((d) => !d.bypassed).map((d) => ({ kind: d.kind }));
}

/** Master fader/pan + FX from the enabled house devices (+ live pre amount). */
function syncMaster(c: AudioContext, s: DawState, M: MasterStrip): void {
  M.gain.gain.value = num(s.masterVolume, 1);
  M.pan.pan.value = panToStereo(num(s.masterPan, 0.5));
  const masterKinds: { kind: string; preAmount?: number }[] = [];
  if (s.devices.eq) masterKinds.push({ kind: "eq" });
  if (s.devices.tape) masterKinds.push({ kind: "tape" });
  if (s.devices.pre) masterKinds.push({ kind: "pre", preAmount: s.preAmount });
  const masterSig = `${s.devices.eq ? 1 : 0}${s.devices.tape ? 1 : 0}${s.devices.pre ? 1 : 0}`;
  if (masterSig !== M.fxSig) { setStripFx(c, M, masterKinds); M.fxSig = masterSig; }
  else if (s.devices.pre && M.fx) {
    // Pre enabled and unchanged: just track the live HPF cutoff.
    for (const n of M.fx.nodes) if (n instanceof BiquadFilterNode && n.type === "highpass") n.frequency.value = preHpfHz(s.preAmount);
  }
}

/** Groups: create missing, set gain/pan/FX; remove stale. */
function syncGroups(c: AudioContext, s: DawState): void {
  const wantGroups = new Set(s.groups.map((g) => g.id));
  for (const g of s.groups) {
    const gs = ensureGroup(c, g.id);
    gs.gain.gain.value = effectiveGroupGain(s, g.id);
    gs.pan.pan.value = panToStereo(num(s.groupPans[g.id] ?? 0.5, 0.5));
    const sig = rackSig(s, g.id);
    if (sig !== gs.fxSig) {
      setStripFx(c, gs, activeRackKinds(s, g.id));
      gs.fxSig = sig;
    }
  }
  for (const [id, gs] of groups) if (!wantGroups.has(id)) { disconnectStrip(gs); groups.delete(id); }
}

/** Re-point a track's pan to its destination (group or master) and re-tap sends. */
function routeTrack(c: AudioContext, st: TrackStrip, destId: string | null, M: MasterStrip): void {
  try { st.pan.disconnect(); } catch { /* idem */ }
  const dest = destId ? ensureGroup(c, destId).input : M.input;
  st.pan.connect(dest);
  st.sends.forEach((sg, i) => { st.pan.connect(sg); sg.connect(returns[i].input); });
  st.destId = destId;
}

/** One track strip: gain/pan/sends/route/FX. */
function syncTrack(c: AudioContext, s: DawState, t: { id: string }, M: MasterStrip): void {
  getTrackInput(t.id); // ensure strip exists
  const st = tracks.get(t.id)!;
  st.gain.gain.value = effectiveTrackGain(s, t.id);
  st.pan.pan.value = panToStereo(num(s.pans[t.id] ?? 0.5, 0.5));
  const snd = s.sends[t.id] ?? [];
  st.sends.forEach((sg, i) => { sg.gain.value = num(snd[i] ?? 0, 0); });

  const destId = groupOfTrack(s, t.id);
  if (destId !== st.destId) routeTrack(c, st, destId, M);
  const sig = rackSig(s, t.id);
  if (sig !== st.fxSig) {
    setStripFx(c, st, activeRackKinds(s, t.id));
    st.fxSig = sig;
  }
}

/** Tracks: create missing, set gain/pan/sends/route/FX; remove stale. */
function syncTracks(c: AudioContext, s: DawState, M: MasterStrip): void {
  const wantTracks = new Set(s.tracks.map((t) => t.id));
  for (const t of s.tracks) syncTrack(c, s, t, M);
  for (const [id, st] of tracks) if (!wantTracks.has(id)) { disconnectStrip(st); tracks.delete(id); }
}

/** Reconcile the whole graph to a store snapshot. No-op without an AudioContext. */
export function syncGraph(s: DawState): void {
  const c = ensureAudio();
  if (!c) return;
  ensureGraph(c);
  const M = master!;

  syncMaster(c, s, M);
  returns.forEach((r, i) => { r.gain.gain.value = num(s.returnGains?.[i] ?? 1, 1); });
  syncGroups(c, s);
  syncTracks(c, s, M);
}

function disconnectStrip(strip: NodeStrip) {
  for (const n of [strip.input, strip.gain, strip.pan, strip.meter, ...(strip.fx?.nodes ?? [])]) {
    try { n.disconnect(); } catch { /* idem */ }
  }
}

/** Peak amplitude (0..1) of an analyser's current time-domain frame. */
function peak(a: AnalyserNode): number {
  const buf = new Float32Array(a.fftSize);
  a.getFloatTimeDomainData(buf);
  let m = 0;
  for (const v of buf) m = Math.max(m, Math.abs(v));
  return Math.min(1, m);
}

/** Current real output levels tapped from the graph, or null if it isn't built
 *  (no AudioContext — tests/SSR). Consumed each frame by useTransportLoop. */
export function readLevels():
  | { tracks: Record<string, number>; groups: Record<string, number>; returns: number[]; master: number }
  | null {
  if (!master) return null;
  const tr: Record<string, number> = {};
  for (const [id, st] of tracks) tr[id] = peak(st.meter);
  const gr: Record<string, number> = {};
  for (const [id, gs] of groups) gr[id] = peak(gs.meter);
  return { tracks: tr, groups: gr, returns: returns.map((r) => peak(r.meter)), master: peak(master.meter) };
}

/** Tear the graph down (unmount). */
export function teardown(): void {
  for (const st of tracks.values()) disconnectStrip(st);
  for (const gs of groups.values()) disconnectStrip(gs);
  tracks.clear();
  groups.clear();
  if (master) disconnectStrip(master);
  master = null;
  returns = [];
}

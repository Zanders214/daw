/**
 * Offline "bounce to WAV": render the arrangement (or loop region) to an audio
 * buffer by rebuilding the mixer topology against an OfflineAudioContext and
 * scheduling every MIDI note + audio clip across the timeline at once.
 *
 * The live mixer graph (mixerGraph.ts) is bound to one shared AudioContext, so
 * it can't be reused offline — but its sound-defining atoms (buildChain/
 * buildDevice/makeImpulse) and the synth voice (scheduleVoice) ARE reused, so
 * the bounce matches playback by construction. Like browser playback, this is
 * the *static* mix (no automation — playback applies none yet).
 */
import type { DawState } from "../store/useDawStore";
import { buildSchedule } from "./playback";
import { buildAudioSchedule } from "./audioPlayback";
import { getAsset } from "./assetStore";
import { scheduleVoice } from "./audio";
import {
  buildChain,
  makeImpulse,
  effectiveTrackGain,
  effectiveGroupGain,
  groupOfTrack,
  panToStereo,
} from "./mixerGraph";
import { encodeWav } from "./wav";

const TAIL_SEC = 2; // let reverb/delay tails ring out past the last event
const DEFAULT_SR = 44100;
const NUM_RETURNS = 2;

export interface BounceOpts {
  sampleRate?: number;
}

const num = (v: number, d: number): number => (Number.isFinite(v) ? v : d);

/** Enabled, non-bypassed insert-rack device kinds for a node. */
function activeRackKinds(s: DawState, nodeId: string): { kind: string }[] {
  return (s.nodeRacks[nodeId] ?? []).filter((d) => !d.bypassed).map((d) => ({ kind: d.kind }));
}

/** Master FX from the enabled house devices (eq/tape/pre + live pre amount). */
function masterKinds(s: DawState): { kind: string; preAmount?: number }[] {
  const out: { kind: string; preAmount?: number }[] = [];
  if (s.devices.eq) out.push({ kind: "eq" });
  if (s.devices.tape) out.push({ kind: "tape" });
  if (s.devices.pre) out.push({ kind: "pre", preAmount: s.preAmount });
  return out;
}

/** Build the static mixer graph against `ctx`; returns each track's input node. */
function buildOfflineGraph(ctx: BaseAudioContext, s: DawState): Map<string, AudioNode> {
  // Master: input → FX → gain → pan → destination
  const masterIn = ctx.createGain();
  const masterFx = buildChain(ctx, masterKinds(s));
  const masterGain = ctx.createGain();
  masterGain.gain.value = num(s.masterVolume, 1);
  const masterPan = ctx.createStereoPanner();
  masterPan.pan.value = panToStereo(num(s.masterPan, 0.5));
  masterIn.connect(masterFx.input);
  masterFx.output.connect(masterGain);
  masterGain.connect(masterPan);
  masterPan.connect(ctx.destination);

  // Returns: 0 = reverb, 1 = feedback delay; both sum into master.
  const returns = Array.from({ length: NUM_RETURNS }, (_, i) => {
    const input = ctx.createGain();
    const gain = ctx.createGain();
    gain.gain.value = num(s.returnGains?.[i] ?? 1, 1);
    return { input, gain };
  });
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 1.6);
  returns[0].input.connect(reverb);
  reverb.connect(returns[0].gain);
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.33;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  returns[1].input.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(returns[1].gain);
  for (const r of returns) r.gain.connect(masterIn);

  // Groups: input → FX → gain → pan → master
  const groups = new Map<string, AudioNode>();
  for (const g of s.groups) {
    const gin = ctx.createGain();
    const gfx = buildChain(ctx, activeRackKinds(s, g.id));
    const ggain = ctx.createGain();
    ggain.gain.value = effectiveGroupGain(s, g.id);
    const gpan = ctx.createStereoPanner();
    gpan.pan.value = panToStereo(num(s.groupPans[g.id] ?? 0.5, 0.5));
    gin.connect(gfx.input);
    gfx.output.connect(ggain);
    ggain.connect(gpan);
    gpan.connect(masterIn);
    groups.set(g.id, gin);
  }

  // Tracks: input → FX → gain → pan → (group|master), post-fader sends → returns
  const trackInputs = new Map<string, AudioNode>();
  for (const t of s.tracks) {
    const tin = ctx.createGain();
    const tfx = buildChain(ctx, activeRackKinds(s, t.id));
    const tgain = ctx.createGain();
    tgain.gain.value = effectiveTrackGain(s, t.id);
    const tpan = ctx.createStereoPanner();
    tpan.pan.value = panToStereo(num(s.pans[t.id] ?? 0.5, 0.5));
    tin.connect(tfx.input);
    tfx.output.connect(tgain);
    tgain.connect(tpan);
    const gid = groupOfTrack(s, t.id);
    tpan.connect(gid ? (groups.get(gid) ?? masterIn) : masterIn);
    const snd = s.sends[t.id] ?? [];
    returns.forEach((r, i) => {
      const sg = ctx.createGain();
      sg.gain.value = num(snd[i] ?? 0, 0);
      tpan.connect(sg);
      sg.connect(r.input);
    });
    trackInputs.set(t.id, tin);
  }

  return trackInputs;
}

/** Beat at which all content ends (max note/clip end), or 0 when empty. */
function contentEndBeats(s: DawState): number {
  let end = 0;
  for (const n of buildSchedule(s.tracks)) end = Math.max(end, n.absBeat + n.durBeat);
  for (const a of buildAudioSchedule(s.tracks)) end = Math.max(end, a.endBeat);
  return end;
}

/** The [startBeat, endBeat] range a bounce covers: the loop region when looping
 *  is enabled, else the whole song (0 → last event). */
export function bounceRange(s: DawState): { startBeat: number; endBeat: number } {
  if (s.loop && s.loopEnd > s.loopStart) return { startBeat: s.loopStart, endBeat: s.loopEnd };
  return { startBeat: 0, endBeat: Math.max(contentEndBeats(s), 0) };
}

/** Render the arrangement to an AudioBuffer via OfflineAudioContext. */
export async function renderToBuffer(s: DawState, opts: BounceOpts = {}): Promise<AudioBuffer> {
  const sr = opts.sampleRate ?? DEFAULT_SR;
  const { startBeat, endBeat } = bounceRange(s);
  const spb = 60 / s.bpm; // seconds per beat
  const bodySec = Math.max(0, (endBeat - startBeat) * spb);
  const length = Math.max(1, Math.ceil((bodySec + TAIL_SEC) * sr));

  const Ctor =
    globalThis.OfflineAudioContext ||
    (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;
  if (!Ctor) throw new Error("OfflineAudioContext is not available in this environment");
  const ctx = new Ctor(2, length, sr);

  const trackInputs = buildOfflineGraph(ctx, s);

  // MIDI notes
  for (const n of buildSchedule(s.tracks)) {
    if (n.absBeat < startBeat || n.absBeat >= endBeat) continue;
    const dest = trackInputs.get(n.trackId);
    if (!dest) continue;
    scheduleVoice(
      ctx,
      dest,
      { pitch: n.pitch, durationSec: n.durBeat * spb, gain: n.velocity, drum: n.type === "drum" },
      (n.absBeat - startBeat) * spb,
    );
  }

  // Audio clips
  for (const a of buildAudioSchedule(s.tracks)) {
    if (a.endBeat <= startBeat || a.startBeat >= endBeat) continue;
    const entry = getAsset(a.src);
    const dest = trackInputs.get(a.trackId);
    if (!entry || !dest) continue;
    const clipStartSec = (a.startBeat - startBeat) * spb;
    const when = Math.max(0, clipStartSec);
    const intoBuffer = a.offsetSec + Math.max(0, -clipStartSec); // skip in if clip starts before range
    const playSec = (Math.min(a.endBeat, endBeat) - Math.max(a.startBeat, startBeat)) * spb;
    const node = ctx.createBufferSource();
    node.buffer = entry.buffer;
    if (a.gain !== 1) {
      const g = ctx.createGain();
      g.gain.value = a.gain;
      node.connect(g);
      g.connect(dest);
    } else {
      node.connect(dest);
    }
    node.start(when, intoBuffer);
    node.stop(when + Math.max(0.01, playSec));
  }

  return ctx.startRendering();
}

/** Render the arrangement and encode it as a 16-bit WAV Blob. */
export async function bounceToWav(s: DawState, opts: BounceOpts = {}): Promise<Blob> {
  return encodeWav(await renderToBuffer(s, opts));
}

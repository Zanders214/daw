/**
 * A tiny in-memory fake of the Web Audio API, just rich enough to drive the real
 * graph-building code in src/lib/mixerGraph.ts and src/lib/audio.ts under Vitest's
 * node environment (where globalThis.AudioContext is undefined).
 *
 * It is deliberately not a faithful implementation — nodes record their wiring and
 * param values so tests can assert on observable effects (connections made, gains
 * changed, buffer sources created) without a real audio device.
 *
 * This file lives under src/test/** which the coverage config excludes, so the
 * fake itself never counts toward coverage.
 */

/** Minimal AudioParam: stores a value and accepts the scheduling calls the
 *  modules make, each returning `this` for chaining like the real API. */
export class FakeAudioParam {
  value: number;
  constructor(initial = 0) {
    this.value = initial;
  }
  setValueAtTime(v: number, _t: number): this {
    this.value = v;
    return this;
  }
  linearRampToValueAtTime(v: number, _t: number): this {
    this.value = v;
    return this;
  }
  exponentialRampToValueAtTime(v: number, _t: number): this {
    this.value = v;
    return this;
  }
  setTargetAtTime(v: number, _t: number, _c: number): this {
    this.value = v;
    return this;
  }
}

/** Base node: records the nodes/params it has been connected to and disconnected. */
export class FakeAudioNode {
  /** Targets this node has been connect()'d to (for wiring assertions). */
  readonly connectedTo: unknown[] = [];
  /** How many times disconnect() has been called on this node. */
  disconnectCount = 0;
  connect(target: unknown): unknown {
    this.connectedTo.push(target);
    return target;
  }
  disconnect(): void {
    this.disconnectCount++;
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam(1);
}

export class FakeStereoPannerNode extends FakeAudioNode {
  readonly pan = new FakeAudioParam(0);
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type = "lowpass";
  readonly frequency = new FakeAudioParam(350);
  readonly Q = new FakeAudioParam(1);
  readonly gain = new FakeAudioParam(0);
}

export class FakeDelayNode extends FakeAudioNode {
  readonly delayTime = new FakeAudioParam(0);
}

export class FakeConvolverNode extends FakeAudioNode {
  buffer: unknown = null;
}

export class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048;
  getByteFrequencyData(arr: Uint8Array): void {
    for (let i = 0; i < arr.length; i++) arr[i] = 0;
  }
  getFloatTimeDomainData(arr: Float32Array): void {
    // Fill with a small deterministic non-zero signal so peak() returns a finite
    // number in (0, 1] and metering assertions have something to chew on.
    for (let i = 0; i < arr.length; i++) arr[i] = 0.1;
  }
}

/** Scheduled source (oscillator / buffer source): tracks start/stop + onended. */
export class FakeAudioScheduledSourceNode extends FakeAudioNode {
  started = false;
  stopped = false;
  onended: (() => void) | null = null;
  start(_t?: number): void {
    this.started = true;
  }
  stop(_t?: number): void {
    this.stopped = true;
  }
}

export class FakeOscillatorNode extends FakeAudioScheduledSourceNode {
  type = "sine";
  readonly frequency = new FakeAudioParam(440);
}

export class FakeAudioBufferSourceNode extends FakeAudioScheduledSourceNode {
  buffer: unknown = null;
}

/** Buffer whose getChannelData returns a real Float32Array so the noise-fill
 *  loops in the modules actually run over real memory. */
export class FakeAudioBuffer {
  private readonly channels: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(ch: number): Float32Array {
    return this.channels[ch];
  }
}

export class FakeAudioContext {
  readonly sampleRate = 48000;
  currentTime = 0;
  state: AudioContextState = "suspended";
  readonly destination = new FakeAudioNode();

  async resume(): Promise<void> {
    this.state = "running";
  }
  async close(): Promise<void> {
    this.state = "closed";
  }

  createGain(): FakeGainNode {
    return new FakeGainNode();
  }
  createStereoPanner(): FakeStereoPannerNode {
    return new FakeStereoPannerNode();
  }
  createBiquadFilter(): FakeBiquadFilterNode {
    return new FakeBiquadFilterNode();
  }
  createDelay(_max?: number): FakeDelayNode {
    return new FakeDelayNode();
  }
  createConvolver(): FakeConvolverNode {
    return new FakeConvolverNode();
  }
  createAnalyser(): FakeAnalyserNode {
    return new FakeAnalyserNode();
  }
  createOscillator(): FakeOscillatorNode {
    return new FakeOscillatorNode();
  }
  createBufferSource(): FakeAudioBufferSourceNode {
    return new FakeAudioBufferSourceNode();
  }
  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(channels, length, sampleRate);
  }
}

/** The global names the modules touch via `instanceof` / `new`. */
const GLOBALS: Record<string, unknown> = {
  AudioContext: FakeAudioContext,
  BiquadFilterNode: FakeBiquadFilterNode,
  GainNode: FakeGainNode,
  StereoPannerNode: FakeStereoPannerNode,
  DelayNode: FakeDelayNode,
  ConvolverNode: FakeConvolverNode,
  AnalyserNode: FakeAnalyserNode,
  OscillatorNode: FakeOscillatorNode,
  AudioBufferSourceNode: FakeAudioBufferSourceNode,
};

/** Install the fake Web Audio globals. Returns an uninstaller that removes them
 *  again so the fake does not leak into other test files. */
export function installFakeAudio(): () => void {
  const g = globalThis as unknown as Record<string, unknown>;
  const prev: Record<string, unknown> = {};
  for (const [name, ctor] of Object.entries(GLOBALS)) {
    prev[name] = g[name];
    g[name] = ctor;
  }
  return () => {
    for (const name of Object.keys(GLOBALS)) {
      if (prev[name] === undefined) delete g[name];
      else g[name] = prev[name];
    }
  };
}

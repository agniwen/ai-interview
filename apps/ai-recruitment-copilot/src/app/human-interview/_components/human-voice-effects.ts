import type { AudioProcessorOptions, Track, TrackProcessor } from "livekit-client";

export type VoiceEffectId =
  | "none"
  | "warmLight"
  | "warmDeep"
  | "phoneClear"
  | "robotLight"
  | "cartoonHigh";
export type ProcessedVoiceEffectId = Exclude<VoiceEffectId, "none">;

const distortionCurvePointCount = 256;

interface EffectGraph {
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  toneNodes?: ToneDisposableNode[];
}

interface ToneDisposableNode {
  dispose: () => unknown;
  input?: unknown;
  output?: unknown;
}

interface TonePitchShiftModule {
  PitchShift: new (options: {
    feedback: number;
    pitch: number;
    wet: number;
    windowSize: number;
  }) => ToneDisposableNode;
  setContext: (context: AudioContext) => void;
}

let toneModulePromise: Promise<TonePitchShiftModule> | null = null;

interface FilterConfig {
  frequency: number;
  gain?: number;
  q?: number;
  type: BiquadFilterType;
}

interface CompressorConfig {
  attack: number;
  knee: number;
  ratio: number;
  release: number;
  threshold: number;
}

interface ModulationConfig {
  depthGain: number;
  initialGain: number;
  offsetGain?: number;
  type: OscillatorType;
  frequency: number;
}

interface VoiceEffectPreset {
  compressor?: CompressorConfig;
  distortionAmount?: number;
  filters?: FilterConfig[];
  gain?: number;
  modulation?: ModulationConfig;
  pitch?: number;
  toneWindowSize?: number;
}

const voiceEffectPresets = {
  cartoonHigh: {
    compressor: {
      attack: 0.004,
      knee: 16,
      ratio: 3,
      release: 0.16,
      threshold: -22,
    },
    filters: [
      { frequency: 90, type: "highpass" },
      { frequency: 3600, type: "lowpass" },
      { frequency: 2100, gain: 3, q: 1.5, type: "peaking" },
    ],
    pitch: 4,
    toneWindowSize: 0.05,
  },
  phoneClear: {
    distortionAmount: 8,
    filters: [
      { frequency: 650, type: "highpass" },
      { frequency: 3000, type: "lowpass" },
      { frequency: 1650, gain: 4, q: 1.5, type: "peaking" },
    ],
    gain: 1.12,
  },
  robotLight: {
    distortionAmount: 3,
    filters: [
      { frequency: 180, type: "highpass" },
      { frequency: 4600, type: "lowpass" },
      { frequency: 1200, gain: 3, q: 1.2, type: "peaking" },
    ],
    modulation: {
      depthGain: 0.16,
      frequency: 28,
      initialGain: 0.8,
      offsetGain: 0.84,
      type: "sine",
    },
    pitch: -2,
    toneWindowSize: 0.055,
  },
  warmDeep: {
    compressor: {
      attack: 0.005,
      knee: 18,
      ratio: 3.5,
      release: 0.22,
      threshold: -24,
    },
    distortionAmount: 3,
    filters: [
      { frequency: 70, type: "highpass" },
      { frequency: 220, gain: 7, type: "lowshelf" },
      { frequency: 3200, q: 0.7, type: "lowpass" },
    ],
    modulation: {
      depthGain: 0.05,
      frequency: 26,
      initialGain: 0.94,
      type: "sine",
    },
    pitch: -5,
    toneWindowSize: 0.07,
  },
  warmLight: {
    compressor: {
      attack: 0.004,
      knee: 18,
      ratio: 2.5,
      release: 0.18,
      threshold: -22,
    },
    filters: [
      { frequency: 80, type: "highpass" },
      { frequency: 180, gain: 3.5, type: "lowshelf" },
      { frequency: 3800, q: 0.7, type: "lowpass" },
    ],
    pitch: -3,
    toneWindowSize: 0.06,
  },
} satisfies Record<ProcessedVoiceEffectId, VoiceEffectPreset>;
const typedVoiceEffectPresets: Record<ProcessedVoiceEffectId, VoiceEffectPreset> =
  voiceEffectPresets;

function createDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(
    new ArrayBuffer(distortionCurvePointCount * Float32Array.BYTES_PER_ELEMENT),
  );
  for (let index = 0; index < distortionCurvePointCount; index += 1) {
    const x = (index * 2) / distortionCurvePointCount - 1;
    curve[index] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function disconnectNodes(nodes: AudioNode[]): void {
  for (const node of nodes) {
    try {
      node.disconnect();
    } catch {
      // A node may already be detached if LiveKit restarts or stops the track first.
    }
  }
}

function stopSources(sources: AudioScheduledSourceNode[]): void {
  for (const source of sources) {
    try {
      source.stop();
    } catch {
      // stop() can throw if the browser has already torn down the source node.
    }
    try {
      source.disconnect();
    } catch {
      // A detached source is fine during cleanup.
    }
  }
}

function disposeToneNodes(nodes: ToneDisposableNode[]): void {
  for (const node of nodes) {
    try {
      node.dispose();
    } catch {
      // Tone nodes may already have been detached by the Web Audio graph cleanup.
    }
  }
}

function isAudioNode(value: unknown): value is AudioNode {
  return value instanceof AudioNode;
}

function getNestedAudioNode(value: unknown, propertyName: "input" | "output"): AudioNode {
  if (isAudioNode(value)) {
    return value;
  }
  if (typeof value !== "object" || value === null || !(propertyName in value)) {
    throw new Error("声音变调初始化失败");
  }
  return getNestedAudioNode(
    (value as Record<"input" | "output", unknown>)[propertyName],
    propertyName,
  );
}

async function loadToneModule(): Promise<TonePitchShiftModule> {
  const toneModule = await import("tone");
  return toneModule as unknown as TonePitchShiftModule;
}

function getToneModule(): Promise<TonePitchShiftModule> {
  toneModulePromise ??= loadToneModule();
  return toneModulePromise;
}

async function createPitchShiftNode(
  context: AudioContext,
  pitch: number,
  windowSize: number,
): Promise<ToneDisposableNode> {
  const tone = await getToneModule();
  tone.setContext(context);
  return new tone.PitchShift({
    feedback: 0,
    pitch,
    wet: 1,
    windowSize,
  });
}

function createFilterNode(context: AudioContext, config: FilterConfig): BiquadFilterNode {
  const filter = context.createBiquadFilter();
  filter.type = config.type;
  filter.frequency.value = config.frequency;
  if (typeof config.gain === "number") {
    filter.gain.value = config.gain;
  }
  if (typeof config.q === "number") {
    filter.Q.value = config.q;
  }
  return filter;
}

function createCompressorNode(
  context: AudioContext,
  config: CompressorConfig,
): DynamicsCompressorNode {
  const compressor = context.createDynamicsCompressor();
  compressor.attack.value = config.attack;
  compressor.knee.value = config.knee;
  compressor.ratio.value = config.ratio;
  compressor.release.value = config.release;
  compressor.threshold.value = config.threshold;
  return compressor;
}

function connectNodesInSeries(nodes: AudioNode[]): void {
  for (let index = 0; index < nodes.length - 1; index += 1) {
    nodes[index].connect(nodes[index + 1]);
  }
}

async function connectPresetEffect(
  context: AudioContext,
  effect: ProcessedVoiceEffectId,
  source: AudioNode,
  output: AudioNode,
): Promise<EffectGraph> {
  const preset = typedVoiceEffectPresets[effect];
  const nodes: AudioNode[] = [source];
  const sources: AudioScheduledSourceNode[] = [];
  const toneNodes: ToneDisposableNode[] = [];
  let currentNode = source;

  if (typeof preset.pitch === "number") {
    const pitchShift = await createPitchShiftNode(
      context,
      preset.pitch,
      preset.toneWindowSize ?? 0.06,
    );
    source.connect(getNestedAudioNode(pitchShift.input, "input"));
    currentNode = getNestedAudioNode(pitchShift.output, "output");
    toneNodes.push(pitchShift);
  }

  const effectNodes: AudioNode[] =
    preset.filters?.map((filter) => createFilterNode(context, filter)) ?? [];
  if (typeof preset.distortionAmount === "number") {
    const distortion = context.createWaveShaper();
    distortion.curve = createDistortionCurve(preset.distortionAmount);
    distortion.oversample = "2x";
    effectNodes.push(distortion);
  }
  if (typeof preset.gain === "number") {
    const gain = context.createGain();
    gain.gain.value = preset.gain;
    effectNodes.push(gain);
  }
  if (preset.modulation) {
    const modulatedGain = context.createGain();
    modulatedGain.gain.value = preset.modulation.initialGain;

    const oscillator = context.createOscillator();
    oscillator.type = preset.modulation.type;
    oscillator.frequency.value = preset.modulation.frequency;

    const depth = context.createGain();
    depth.gain.value = preset.modulation.depthGain;
    oscillator.connect(depth).connect(modulatedGain.gain);
    oscillator.start();
    effectNodes.push(modulatedGain);
    sources.push(oscillator);

    if (typeof preset.modulation.offsetGain === "number") {
      const offset = context.createConstantSource();
      offset.offset.value = preset.modulation.offsetGain;
      offset.connect(modulatedGain.gain);
      offset.start();
      sources.push(offset);
      nodes.push(offset);
    }
    nodes.push(oscillator, depth);
  }
  if (preset.compressor) {
    effectNodes.push(createCompressorNode(context, preset.compressor));
  }

  connectNodesInSeries([currentNode, ...effectNodes, output]);
  nodes.push(...effectNodes, output);

  return {
    nodes,
    sources,
    toneNodes,
  };
}

class BrowserVoiceEffectProcessor implements TrackProcessor<
  Track.Kind.Audio,
  AudioProcessorOptions
> {
  name: string;
  processedTrack?: MediaStreamTrack;

  private readonly effect: ProcessedVoiceEffectId;
  private audioContext?: AudioContext;
  private nodes: AudioNode[] = [];
  private sources: AudioScheduledSourceNode[] = [];
  private toneNodes: ToneDisposableNode[] = [];

  constructor(effect: ProcessedVoiceEffectId) {
    this.effect = effect;
    this.name = `human-interview-${effect}`;
  }

  async init(options: AudioProcessorOptions): Promise<void> {
    await this.setup(options);
  }

  async restart(options: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    await this.setup(options);
  }

  destroy(): Promise<void> {
    stopSources(this.sources);
    disconnectNodes(this.nodes);
    disposeToneNodes(this.toneNodes);
    this.processedTrack?.stop();
    this.sources = [];
    this.nodes = [];
    this.toneNodes = [];
    this.processedTrack = undefined;
    return Promise.resolve();
  }

  private async setup(options: AudioProcessorOptions): Promise<void> {
    const audioContext = options.audioContext ?? this.audioContext;
    if (!audioContext || audioContext.state === "closed") {
      throw new Error("当前浏览器无法初始化声音效果");
    }
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    this.audioContext = audioContext;
    const input = audioContext.createMediaStreamSource(new MediaStream([options.track]));
    const output = audioContext.createMediaStreamDestination();
    const effectGraph = await connectPresetEffect(audioContext, this.effect, input, output);
    this.nodes = effectGraph.nodes;
    this.sources = effectGraph.sources;
    this.toneNodes = effectGraph.toneNodes ?? [];

    const [processedTrack] = output.stream.getAudioTracks();
    if (!processedTrack) {
      throw new Error("声音效果初始化失败");
    }
    processedTrack.contentHint = "speech";
    this.processedTrack = processedTrack;
  }
}

export function createVoiceEffectProcessor(
  effect: ProcessedVoiceEffectId,
): TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  return new BrowserVoiceEffectProcessor(effect);
}

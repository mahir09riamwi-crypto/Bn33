import type { EqState, FxState, Project, StemState } from "@/lib/stem/types";

let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

function limiterCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.35);
  }
  return curve;
}

const impulses = new WeakMap<BaseAudioContext, AudioBuffer>();

function impulse(ctx: BaseAudioContext): AudioBuffer {
  const cached = impulses.get(ctx);
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * 1.45);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.6;
    }
  }
  impulses.set(ctx, buffer);
  return buffer;
}

type Chain = {
  gain: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  reverb: GainNode;
  chorus: GainNode;
  flanger: GainNode;
  phaser: GainNode;
  analyser: AnalyserNode;
  sources: AudioNode[];
  oscs: OscillatorNode[];
};

function wireFx(ctx: BaseAudioContext, input: AudioNode, output: AudioNode): Omit<Chain, "gain" | "low" | "mid" | "high" | "analyser"> {
  const dry = ctx.createGain();
  dry.gain.value = 1;
  input.connect(dry);
  dry.connect(output);

  const reverbSend = ctx.createGain();
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0;
  input.connect(reverbSend);
  reverbSend.connect(reverb);
  reverb.connect(reverbGain);
  reverbGain.connect(output);

  const chorusDelay = ctx.createDelay(0.08);
  chorusDelay.delayTime.value = 0.016;
  const chorusLfo = ctx.createOscillator();
  const chorusDepth = ctx.createGain();
  chorusLfo.frequency.value = 0.35;
  chorusDepth.gain.value = 0.004;
  chorusLfo.connect(chorusDepth);
  chorusDepth.connect(chorusDelay.delayTime);
  const chorusGain = ctx.createGain();
  chorusGain.gain.value = 0;
  input.connect(chorusDelay);
  chorusDelay.connect(chorusGain);
  chorusGain.connect(output);

  const flangerDelay = ctx.createDelay(0.02);
  flangerDelay.delayTime.value = 0.003;
  const flangerLfo = ctx.createOscillator();
  const flangerDepth = ctx.createGain();
  flangerLfo.frequency.value = 0.22;
  flangerDepth.gain.value = 0.0016;
  flangerLfo.connect(flangerDepth);
  flangerDepth.connect(flangerDelay.delayTime);
  const flangerFb = ctx.createGain();
  flangerFb.gain.value = 0.28;
  flangerDelay.connect(flangerFb);
  flangerFb.connect(flangerDelay);
  const flangerGain = ctx.createGain();
  flangerGain.gain.value = 0;
  input.connect(flangerDelay);
  flangerDelay.connect(flangerGain);
  flangerGain.connect(output);

  const allpass = [0, 1, 2, 3].map(() => {
    const filter = ctx.createBiquadFilter();
    filter.type = "allpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    return filter;
  });
  const phaserLfo = ctx.createOscillator();
  const phaserDepth = ctx.createGain();
  phaserLfo.frequency.value = 0.28;
  phaserDepth.gain.value = 520;
  phaserLfo.connect(phaserDepth);
  for (const filter of allpass) phaserDepth.connect(filter.frequency);
  input.connect(allpass[0]);
  allpass[0].connect(allpass[1]);
  allpass[1].connect(allpass[2]);
  allpass[2].connect(allpass[3]);
  const phaserGain = ctx.createGain();
  phaserGain.gain.value = 0;
  allpass[3].connect(phaserGain);
  phaserGain.connect(output);

  const oscs = [chorusLfo, flangerLfo, phaserLfo];
  return { reverb: reverbGain, chorus: chorusGain, flanger: flangerGain, phaser: phaserGain, sources: [dry, reverb, ...allpass], oscs };
}

function applyEq(chain: { low: BiquadFilterNode; mid: BiquadFilterNode; high: BiquadFilterNode }, eq: EqState, when: number) {
  chain.low.gain.setTargetAtTime(eq.low, when, 0.03);
  chain.mid.gain.setTargetAtTime(eq.mid, when, 0.03);
  chain.mid.frequency.setTargetAtTime(eq.midFreq, when, 0.03);
  chain.high.gain.setTargetAtTime(eq.high, when, 0.03);
}

function applyFx(chain: { reverb: GainNode; chorus: GainNode; flanger: GainNode; phaser: GainNode }, fx: FxState, when: number) {
  chain.reverb.gain.setTargetAtTime(fx.reverb * 0.85, when, 0.03);
  chain.chorus.gain.setTargetAtTime(fx.chorus * 0.7, when, 0.03);
  chain.flanger.gain.setTargetAtTime(fx.flanger * 0.55, when, 0.03);
  chain.phaser.gain.setTargetAtTime(fx.phaser * 0.65, when, 0.03);
}

function audible(project: Project, stem: StemState): boolean {
  if (project.sourceListen || stem.muted) return false;
  const soloed = project.stems.some((item) => item.solo);
  return !soloed || stem.solo;
}

class MixEngine {
  project: Project | null = null;
  buffers = new Map<string, AudioBuffer>();
  source: AudioBuffer | null = null;
  chains = new Map<string, Chain & { src: AudioBufferSourceNode }>();
  master: GainNode | null = null;
  sourceGain: GainNode | null = null;
  playing = false;
  offset = 0;
  startedAt = 0;
  token = 0;

  private ensureMaster(ctx: AudioContext) {
    if (this.master) return;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const limiter = ctx.createWaveShaper();
    limiter.curve = limiterCurve();
    limiter.oversample = "2x";
    this.master.connect(limiter);
    limiter.connect(ctx.destination);
    this.sourceGain = ctx.createGain();
    this.sourceGain.gain.value = 0;
    this.sourceGain.connect(this.master);
  }

  private stopVoices() {
    this.token++;
    for (const chain of this.chains.values()) {
      try {
        chain.src.stop();
      } catch {
        /* already stopped */
      }
      for (const osc of chain.oscs) {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
      }
      chain.src.disconnect();
    }
    this.chains.clear();
  }

  currentTime(): number {
    const duration = this.project?.duration ?? 0;
    if (!this.playing || !audioCtx) return Math.min(duration, this.offset);
    return Math.min(duration, this.offset + (audioCtx.currentTime - this.startedAt));
  }

  private updateMix(when: number) {
    const project = this.project;
    if (!project || !this.master || !this.sourceGain) return;
    this.master.gain.setTargetAtTime(project.master, when, 0.02);
    this.sourceGain.gain.setTargetAtTime(project.sourceListen ? 1 : 0, when, 0.03);
    for (const stem of project.stems) {
      const chain = this.chains.get(stem.id);
      if (!chain) continue;
      const level = audible(project, stem) ? stem.volume : 0;
      chain.gain.gain.setTargetAtTime(level, when, 0.02);
      applyEq(chain, stem.eq, when);
      applyFx(chain, stem.fx, when);
    }
  }

  bind(project: Project, buffers: Map<string, AudioBuffer>, source: AudioBuffer | null) {
    this.project = project;
    this.buffers = buffers;
    this.source = source;
    if (this.playing) this.restart();
    else if (audioCtx && this.master) this.updateMix(audioCtx.currentTime);
  }

  play() {
    const ctx = getAudioContext();
    void ctx.resume();
    this.ensureMaster(ctx);
    if (!this.project) return;
    this.startVoices(ctx);
    this.playing = true;
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.currentTime();
    this.playing = false;
    this.stopVoices();
  }

  finish() {
    this.playing = false;
    this.offset = 0;
    this.stopVoices();
  }

  seek(time: number) {
    const duration = this.project?.duration ?? 0;
    this.offset = Math.max(0, Math.min(duration - 0.01, time));
    if (this.playing) this.restart();
  }

  restart() {
    const was = this.playing;
    const at = this.currentTime();
    this.playing = false;
    this.stopVoices();
    this.offset = at;
    if (was) this.play();
  }

  live(project: Project) {
    this.project = project;
    if (audioCtx && this.master) this.updateMix(audioCtx.currentTime);
  }

  meter(stemId: string): number {
    const chain = this.chains.get(stemId);
    if (!chain || !this.playing) return 0;
    const data = new Uint8Array(chain.analyser.fftSize);
    chain.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / data.length) * 3.4);
  }

  private startVoices(ctx: AudioContext) {
    const project = this.project;
    if (!project || !this.master || !this.sourceGain) return;
    this.stopVoices();
    const token = this.token;
    const when = ctx.currentTime + 0.02;
    this.startedAt = when;
    if (this.source) {
      const src = ctx.createBufferSource();
      src.buffer = this.source;
      src.connect(this.sourceGain);
      src.start(when, this.offset);
      src.onended = () => {
        if (token !== this.token) return;
      };
    }
    for (const stem of project.stems) {
      const buffer = this.buffers.get(stem.id);
      if (!buffer) continue;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf";
      low.frequency.value = 140;
      const mid = ctx.createBiquadFilter();
      mid.type = "peaking";
      mid.Q.value = 0.9;
      const high = ctx.createBiquadFilter();
      high.type = "highshelf";
      high.frequency.value = 6500;
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      src.connect(low);
      low.connect(mid);
      mid.connect(high);
      const fxIn = ctx.createGain();
      high.connect(fxIn);
      const fx = wireFx(ctx, fxIn, gain);
      gain.connect(analyser);
      analyser.connect(this.master);
      const offset = Math.min(this.offset, Math.max(0, buffer.duration - 0.01));
      src.start(when, offset);
      for (const osc of fx.oscs) osc.start(when);
      this.chains.set(stem.id, { src, gain, low, mid, high, analyser, ...fx });
    }
    this.updateMix(when);
  }
}

export const mixEngine = new MixEngine();

let previewNode: AudioBufferSourceNode | null = null;

export async function playPreview(buffer: AudioBuffer, onEnd?: () => void) {
  const ctx = getAudioContext();
  await ctx.resume();
  mixEngine.pause();
  stopPreview();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.onended = () => {
    if (previewNode === src) previewNode = null;
    onEnd?.();
  };
  src.start();
  previewNode = src;
}

export function stopPreview() {
  if (!previewNode) return;
  try {
    previewNode.stop();
  } catch {
    /* already stopped */
  }
  previewNode = null;
}

function connectOffline(
  ctx: OfflineAudioContext,
  buffer: AudioBuffer,
  stem: StemState,
  master: GainNode,
) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const low = ctx.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 140;
  low.gain.value = stem.eq.low;
  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = stem.eq.midFreq;
  mid.Q.value = 0.9;
  mid.gain.value = stem.eq.mid;
  const high = ctx.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 6500;
  high.gain.value = stem.eq.high;
  const gain = ctx.createGain();
  gain.gain.value = stem.volume;
  src.connect(low);
  low.connect(mid);
  mid.connect(high);
  const fxIn = ctx.createGain();
  high.connect(fxIn);
  const fx = wireFx(ctx, fxIn, gain);
  applyFx(fx, stem.fx, 0);
  gain.connect(master);
  src.start(0);
  for (const osc of fx.oscs) osc.start(0);
}

export async function renderMix(project: Project, buffers: Map<string, AudioBuffer>): Promise<AudioBuffer> {
  const rate = 44100;
  const length = Math.max(1, Math.ceil(project.duration * rate));
  const ctx = new OfflineAudioContext(2, length, rate);
  const master = ctx.createGain();
  master.gain.value = project.master;
  const shaper = ctx.createWaveShaper();
  shaper.curve = limiterCurve();
  master.connect(shaper);
  shaper.connect(ctx.destination);
  const soloed = project.stems.some((stem) => stem.solo);
  for (const stem of project.stems) {
    if (stem.muted || (soloed && !stem.solo)) continue;
    const buffer = buffers.get(stem.id);
    if (!buffer) continue;
    connectOffline(ctx, buffer, stem, master);
  }
  return ctx.startRendering();
}

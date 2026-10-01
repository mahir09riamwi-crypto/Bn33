import { extensionOf, getInstrument } from "@/lib/stem/catalog";
import { denoise, pitchShift } from "@/lib/stem/dsp";
import { getAudioContext } from "@/lib/stem/engine";
import {
  createDemoSong,
  renderInstrument,
  type DemoSong,
  type Hit,
  type Note,
  type RenderedStem,
  type StemScore,
} from "@/lib/stem/synth";

export type Job = {
  id: string;
  name: string;
  format: string;
  size: number;
  kind: "file" | "demo";
};

type Pcm = { samples: Float32Array; sampleRate: number };

type StemMem = {
  separated: Float32Array;
  sampleRate: number;
  score: StemScore | null;
  sourceInstrumentId: string;
  dry: Float32Array;
  width: number;
  processed: AudioBuffer | null;
  key: string;
};

const jobs = new Map<string, Job>();
const files = new Map<string, File>();
const pcm = new Map<string, Pcm>();
const demos = new Map<string, RenderedStem[]>();
const stemMem = new Map<string, StemMem>();
const sources = new Map<string, Pcm & { cache: AudioBuffer | null; cacheKey: string }>();

export function rememberFile(id: string, file: File) {
  const format = extensionOf(file.name);
  jobs.set(id, { id, name: file.name.replace(/\.[^.]+$/, ""), format, size: file.size, kind: "file" });
  files.set(id, file);
}

export function rememberDemo(id: string, song = createDemoSong()) {
  jobs.set(id, { id, name: "Night Market", format: "wav", size: song.mix.length * 4, kind: "demo" });
  pcm.set(id, { samples: song.mix, sampleRate: song.sampleRate });
  demos.set(id, song.stems);
  return song;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function forgetJob(id: string) {
  jobs.delete(id);
  files.delete(id);
  pcm.delete(id);
  demos.delete(id);
}

export async function ensurePcm(id: string): Promise<Pcm> {
  const cached = pcm.get(id);
  if (cached) return cached;
  const file = files.get(id);
  if (!file) throw new Error("That file is no longer in this session.");
  const ctx = getAudioContext();
  const raw = await file.arrayBuffer();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(raw.slice(0));
  } catch {
    throw new Error("Couldn't decode this file. Try WAV, MP3, FLAC, or M4A.");
  }
  const mixed = new Float32Array(decoded.length);
  const channels = decoded.numberOfChannels;
  for (let c = 0; c < channels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < data.length; i++) mixed[i] += data[i] / channels;
  }
  const stored = { samples: mixed, sampleRate: decoded.sampleRate };
  pcm.set(id, stored);
  return stored;
}

export function demoStems(id: string): RenderedStem[] | undefined {
  return demos.get(id);
}

export function stashSource(projectId: string, samples: Float32Array, sampleRate: number) {
  sources.set(projectId, { samples, sampleRate, cache: null, cacheKey: "" });
}

export function takeStem(
  stemId: string,
  instrumentId: string,
  samples: Float32Array,
  sampleRate: number,
  score: StemScore | null,
) {
  stemMem.set(stemId, {
    separated: samples,
    sampleRate,
    score,
    sourceInstrumentId: instrumentId,
    dry: samples,
    width: getInstrument(instrumentId)?.width ?? (instrumentId === "rest" ? 0 : 0.01),
    processed: null,
    key: "",
  });
}

export function hasStem(stemId: string): boolean {
  return stemMem.has(stemId);
}

export function releaseProject(projectId: string, stemIds: string[]) {
  sources.delete(projectId);
  for (const id of stemIds) stemMem.delete(id);
}

export function samplesToBuffer(
  ctx: BaseAudioContext,
  samples: Float32Array,
  sampleRate: number,
  delaySec: number,
): AudioBuffer {
  const delay = Math.max(0, Math.round(delaySec * sampleRate));
  const right = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) right[i] = samples[Math.max(0, i - delay)] ?? 0;
  const buffer = ctx.createBuffer(2, samples.length, sampleRate);
  buffer.copyToChannel(new Float32Array(samples), 0);
  buffer.copyToChannel(right, 1);
  return buffer;
}

export async function playableStem(
  stemId: string,
  noise: boolean,
  semitones: number,
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
  const mem = stemMem.get(stemId);
  if (!mem) return null;
  const key = `${mem.dry === mem.separated ? "sep" : "alt"}:${noise ? 1 : 0}:${semitones}`;
  if (mem.processed && mem.key === key) return mem.processed;
  let audio = mem.dry;
  if (noise) audio = denoise(audio, mem.sampleRate);
  if (semitones !== 0) audio = pitchShift(audio, semitones);
  mem.processed = samplesToBuffer(ctx, audio, mem.sampleRate, mem.width);
  mem.key = key;
  return mem.processed;
}

export async function playableSource(projectId: string, semitones: number, ctx: BaseAudioContext): Promise<AudioBuffer | null> {
  const source = sources.get(projectId);
  if (!source) return null;
  const key = String(semitones);
  if (source.cache && source.cacheKey === key) return source.cache;
  const audio = semitones === 0 ? source.samples : pitchShift(source.samples, semitones);
  source.cache = samplesToBuffer(ctx, audio, source.sampleRate, 0);
  source.cacheKey = key;
  return source.cache;
}

function onsets(samples: Float32Array, sampleRate: number): Hit[] {
  const hop = Math.max(1, Math.floor(sampleRate * 0.03));
  const hits: Hit[] = [];
  let prev = 0;
  for (let i = 0; i + hop < samples.length; i += hop) {
    let energy = 0;
    let n = 0;
    for (let j = 0; j < hop; j += 4) {
      const s = samples[i + j] ?? 0;
      energy += s * s;
      n++;
    }
    const rms = Math.sqrt(energy / Math.max(1, n));
    if (rms > 0.045 && rms > prev * 1.35) {
      hits.push({
        t: i / sampleRate,
        kind: rms > 0.18 ? "dum" : "tek",
        vel: Math.min(1, rms * 3),
      });
    }
    prev = rms * 0.65 + prev * 0.35;
    if (hits.length > 360) break;
  }
  return hits;
}

function pitches(samples: Float32Array, sampleRate: number): Note[] {
  const down = 4;
  const rate = sampleRate / down;
  const smallLen = Math.floor(samples.length / down);
  const small = new Float32Array(smallLen);
  for (let i = 0; i < smallLen; i++) small[i] = samples[i * down] ?? 0;
  const win = 320;
  const hop = 400;
  const notes: Note[] = [];
  const minLag = Math.max(2, Math.floor(rate / 1200));
  const maxLag = Math.min(win - 2, Math.floor(rate / 70));
  for (let pos = 0; pos + win < small.length; pos += hop) {
    let energy = 0;
    for (let i = 0; i < win; i += 2) energy += small[pos + i] ** 2;
    const vel = Math.sqrt(energy / (win / 2));
    if (vel < 0.02) continue;
    let best = 0;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag += 2) {
      let sum = 0;
      for (let i = 0; i < win - lag; i += 4) sum += small[pos + i] * small[pos + i + lag];
      if (sum > best) {
        best = sum;
        bestLag = lag;
      }
    }
    if (!bestLag) continue;
    const freq = rate / bestLag;
    const time = (pos * down) / sampleRate;
    const dur = (hop * down) / sampleRate;
    const last = notes[notes.length - 1];
    if (last && Math.abs(last.freq - freq) / freq < 0.04 && time <= last.t + last.dur + 0.03) {
      last.dur = time + dur - last.t;
      last.vel = Math.max(last.vel, Math.min(1, vel * 4));
    } else {
      notes.push({ t: time, dur, freq, vel: Math.min(1, vel * 4) });
    }
    if (notes.length > 240) break;
  }
  return notes;
}

export function retargetStem(stemId: string, instrumentId: string, duration: number) {
  const mem = stemMem.get(stemId);
  if (!mem) return;
  mem.processed = null;
  mem.key = "";
  mem.width = getInstrument(instrumentId)?.width ?? mem.width;
  if (instrumentId === mem.sourceInstrumentId || instrumentId === "rest") {
    mem.dry = mem.separated;
    return;
  }
  if (!mem.score) {
    const pitched = getInstrument(mem.sourceInstrumentId)?.pitched ?? true;
    mem.score = pitched
      ? { notes: pitches(mem.separated, mem.sampleRate), hits: [] }
      : { notes: [], hits: onsets(mem.separated, mem.sampleRate) };
  }
  mem.dry = renderInstrument(instrumentId, mem.score, mem.sampleRate, duration, stemId.length * 17);
}

export function sliceDemo(jobId: string, instrumentId: string, seconds: number): Float32Array | null {
  const stem = demos.get(jobId)?.find((item) => item.instrumentId === instrumentId);
  if (!stem) return null;
  const n = Math.min(stem.samples.length, Math.floor(44100 * seconds));
  return stem.samples.slice(0, n);
}

export type { DemoSong };

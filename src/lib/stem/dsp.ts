const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const HARM_MINOR = [6.4, 2.4, 3.5, 5.4, 2.5, 3.4, 2.2, 5.2, 3.1, 2.3, 4.4, 2.6];
const HIJAZ = [6.8, 5.4, 1.15, 1.45, 5.7, 4.7, 1.3, 5.5, 2.5, 1.55, 2.15, 1.45];

export function yieldNow(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + half] * wRe - im[i + j + half] * wIm;
        const vIm = re[i + j + half] * wIm + im[i + j + half] * wRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
}

export function ifft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fft(re, im);
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] = -im[i] / n;
  }
}

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, n - 1)));
  return w;
}

export type Spectrum = {
  fftSize: number;
  hop: number;
  frames: number;
  bins: number;
  re: Float32Array;
  im: Float32Array;
  mag: Float32Array;
  length: number;
};

export function stft(samples: Float32Array, fftSize = 2048, hop = 512): Spectrum {
  const win = hann(fftSize);
  const bins = fftSize / 2 + 1;
  const frames = Math.max(1, Math.floor((Math.max(samples.length, fftSize) - fftSize) / hop) + 1);
  const re = new Float32Array(frames * bins);
  const im = new Float32Array(frames * bins);
  const mag = new Float32Array(frames * bins);
  const fre = new Float32Array(fftSize);
  const fim = new Float32Array(fftSize);
  for (let f = 0; f < frames; f++) {
    fre.fill(0);
    fim.fill(0);
    const pos = f * hop;
    for (let i = 0; i < fftSize; i++) {
      const s = samples[pos + i] ?? 0;
      fre[i] = s * win[i];
    }
    fft(fre, fim);
    const base = f * bins;
    for (let k = 0; k < bins; k++) {
      re[base + k] = fre[k];
      im[base + k] = fim[k];
      mag[base + k] = Math.hypot(fre[k], fim[k]);
    }
  }
  return { fftSize, hop, frames, bins, re, im, mag, length: samples.length };
}

export function istftMasked(spec: Spectrum, mask: Float32Array): Float32Array {
  const { fftSize, hop, frames, bins, length } = spec;
  const out = new Float32Array(Math.max(length, frames * hop + fftSize));
  const norm = new Float32Array(out.length);
  const win = hann(fftSize);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  for (let f = 0; f < frames; f++) {
    re.fill(0);
    im.fill(0);
    const base = f * bins;
    for (let k = 0; k < bins; k++) {
      const m = mask[base + k];
      re[k] = spec.re[base + k] * m;
      im[k] = spec.im[base + k] * m;
    }
    for (let k = 1; k < fftSize / 2; k++) {
      re[fftSize - k] = re[k];
      im[fftSize - k] = -im[k];
    }
    ifft(re, im);
    const pos = f * hop;
    for (let i = 0; i < fftSize; i++) {
      const at = pos + i;
      if (at >= out.length) break;
      out[at] += re[i] * win[i];
      norm[at] += win[i] * win[i];
    }
  }
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const n = norm[i];
    result[i] = n > 1e-8 ? out[i] / n : 0;
  }
  return result;
}

function medianInto(values: Float32Array, count: number): number {
  for (let i = 1; i < count; i++) {
    const v = values[i];
    let j = i - 1;
    while (j >= 0 && values[j] > v) {
      values[j + 1] = values[j];
      j--;
    }
    values[j + 1] = v;
  }
  return values[count >> 1];
}

export function hpss(mag: Float32Array, frames: number, bins: number, radius = 8): {
  harmonic: Float32Array;
  percussive: Float32Array;
} {
  const harmonic = new Float32Array(mag.length);
  const percussive = new Float32Array(mag.length);
  const buf = new Float32Array(radius * 2 + 1);
  for (let k = 0; k < bins; k++) {
    for (let t = 0; t < frames; t++) {
      const t0 = Math.max(0, t - radius);
      const t1 = Math.min(frames - 1, t + radius);
      let n = 0;
      for (let j = t0; j <= t1; j++) buf[n++] = mag[j * bins + k];
      harmonic[t * bins + k] = medianInto(buf, n);
    }
  }
  for (let t = 0; t < frames; t++) {
    for (let k = 0; k < bins; k++) {
      const k0 = Math.max(0, k - radius);
      const k1 = Math.min(bins - 1, k + radius);
      let n = 0;
      for (let j = k0; j <= k1; j++) buf[n++] = mag[t * bins + j];
      percussive[t * bins + k] = medianInto(buf, n);
    }
  }
  return { harmonic, percussive };
}

export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return new Float32Array(input);
  const outLen = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const out = new Float32Array(outLen);
  const ratio = fromRate / toRate;
  const last = input.length - 1;
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const i0 = Math.min(last, Math.floor(x));
    const i1 = Math.min(last, i0 + 1);
    const f = x - i0;
    out[i] = input[i0] * (1 - f) + input[i1] * f;
  }
  return out;
}

export function makePeaks(samples: Float32Array, buckets = 96): number[] {
  const out = new Array<number>(buckets).fill(0);
  if (samples.length === 0) return out;
  const size = Math.max(1, Math.floor(samples.length / buckets));
  let max = 0;
  for (let i = 0; i < buckets; i++) {
    let m = 0;
    const start = i * size;
    const end = Math.min(samples.length, start + size);
    for (let j = start; j < end; j += 4) {
      const a = Math.abs(samples[j]);
      if (a > m) m = a;
    }
    out[i] = m;
    if (m > max) max = m;
  }
  const scale = max || 1;
  for (let i = 0; i < buckets; i++) out[i] /= scale;
  return out;
}

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let s = 0;
  const step = Math.max(1, Math.floor(samples.length / 8000));
  let n = 0;
  for (let i = 0; i < samples.length; i += step) {
    s += samples[i] * samples[i];
    n++;
  }
  return Math.sqrt(s / Math.max(1, n));
}

export function pitchShift(input: Float32Array, semitones: number): Float32Array {
  if (semitones === 0 || input.length < 64) return new Float32Array(input);
  const ratio = 2 ** (semitones / 12);
  const grain = 2048;
  const outGrain = Math.max(64, Math.round(grain / ratio));
  const hop = Math.max(1, Math.round(outGrain / 4));
  const out = new Float32Array(input.length);
  const winSum = new Float32Array(input.length);
  const last = input.length - 1;
  let inPos = 0;
  for (let outPos = 0; outPos < out.length; outPos += hop) {
    const limit = Math.min(outGrain, out.length - outPos);
    for (let i = 0; i < limit; i++) {
      const src = inPos + i * ratio;
      if (src >= last) break;
      const i0 = src | 0;
      const f = src - i0;
      const s = input[i0] * (1 - f) + input[Math.min(last, i0 + 1)] * f;
      const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / Math.max(1, outGrain - 1)));
      out[outPos + i] += s * w;
      winSum[outPos + i] += w;
    }
    inPos += hop;
    if (inPos >= last) break;
  }
  for (let i = 0; i < out.length; i++) {
    if (winSum[i] > 1e-5) out[i] /= winSum[i];
  }
  const fade = Math.min(128, out.length >> 3);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
  return out;
}

export function denoise(samples: Float32Array, sampleRate: number): Float32Array {
  if (samples.length < 2048) return new Float32Array(samples);
  const spec = stft(samples, 2048, 512);
  const { frames, bins } = spec;
  const noise = new Float32Array(bins);
  const col = new Float32Array(frames);
  for (let k = 0; k < bins; k++) {
    for (let t = 0; t < frames; t++) col[t] = spec.mag[t * bins + k];
    const copy = col.slice().sort((a, b) => a - b);
    noise[k] = copy[Math.min(copy.length - 1, Math.floor(frames * 0.22))] ?? 0;
  }
  const mask = new Float32Array(spec.mag.length);
  for (let i = 0; i < mask.length; i++) {
    const mag = spec.mag[i];
    const floor = mag * 0.1;
    const cleaned = Math.max(floor, mag - noise[i % bins] * 1.35);
    mask[i] = mag > 1e-8 ? cleaned / mag : 0;
  }
  const out = istftMasked(spec, mask);
  // Gentle hiss shelf: shave a little air above 8 kHz where noise lives.
  const cutoff = Math.min(0.45, 8000 / sampleRate);
  let y = 0;
  const a = Math.exp(-2 * Math.PI * cutoff);
  for (let i = 0; i < out.length; i++) {
    y = out[i] + a * (y - out[i]);
    out[i] = y;
  }
  return out;
}

function pearson(chroma: Float32Array, profile: number[]): number {
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < 12; i++) {
    ma += chroma[i];
    mb += profile[i];
  }
  ma /= 12;
  mb /= 12;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < 12; i++) {
    const xa = chroma[i] - ma;
    const xb = profile[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return num / Math.sqrt(da * db + 1e-12);
}

function rotate(profile: number[], root: number): number[] {
  const out = new Array<number>(12);
  for (let i = 0; i < 12; i++) out[(i + root) % 12] = profile[i];
  return out;
}

export function detectKey(samples: Float32Array, sampleRate: number): { name: string; confidence: number } {
  const fftSize = 4096;
  const hop = 2048;
  const chroma = new Float32Array(12);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const win = hann(fftSize);
  const frames = Math.max(1, Math.floor((samples.length - fftSize) / hop));
  for (let f = 0; f < frames; f++) {
    const pos = f * hop;
    im.fill(0);
    for (let i = 0; i < fftSize; i++) re[i] = (samples[pos + i] ?? 0) * win[i];
    fft(re, im);
    for (let k = 1; k < fftSize / 2; k++) {
      const freq = (k * sampleRate) / fftSize;
      if (freq < 70 || freq > 4200) continue;
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += Math.hypot(re[k], im[k]);
    }
  }
  const modes = [
    { name: "major", profile: MAJOR },
    { name: "minor", profile: MINOR },
    { name: "harmonic minor", profile: HARM_MINOR },
    { name: "Hijaz", profile: HIJAZ },
  ];
  let best = { name: "C major", score: -2 };
  let second = -2;
  for (const mode of modes) {
    for (let root = 0; root < 12; root++) {
      const score = pearson(chroma, rotate(mode.profile, root));
      const name = `${NOTE_NAMES[root]} ${mode.name}`;
      if (score > best.score) {
        second = best.score;
        best = { name, score };
      } else if (score > second) second = score;
    }
  }
  return { name: best.name, confidence: Math.max(0, best.score - Math.max(0, second)) };
}

export function detectBpm(samples: Float32Array, sampleRate: number): { bpm: number; confidence: number } {
  const fftSize = 1024;
  const hop = 512;
  const frames = Math.max(1, Math.floor((samples.length - fftSize) / hop));
  const env = new Float32Array(frames);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  let prev = new Float32Array(fftSize / 2);
  const maxBin = Math.min(fftSize / 2, Math.floor((250 * fftSize) / sampleRate));
  for (let f = 0; f < frames; f++) {
    const pos = f * hop;
    im.fill(0);
    for (let i = 0; i < fftSize; i++) re[i] = samples[pos + i] ?? 0;
    fft(re, im);
    let flux = 0;
    const mag = new Float32Array(maxBin);
    for (let k = 1; k < maxBin; k++) {
      mag[k] = Math.hypot(re[k], im[k]);
      flux += Math.max(0, mag[k] - prev[k]);
    }
    env[f] = flux;
    prev = mag;
  }
  let mean = 0;
  for (let i = 0; i < env.length; i++) mean += env[i];
  mean /= env.length || 1;
  for (let i = 0; i < env.length; i++) env[i] = Math.max(0, env[i] - mean);

  const hopSec = hop / sampleRate;
  let best = 0;
  let second = 0;
  let bestLag = 0;
  const seen = new Set<number>();
  for (let bpm = 70; bpm <= 180; bpm++) {
    const lag = Math.round(60 / bpm / hopSec);
    if (lag < 2 || lag >= env.length || seen.has(lag)) continue;
    seen.add(lag);
    let sum = 0;
    for (let i = 0; i + lag < env.length; i++) sum += env[i] * env[i + lag];
    const lag2 = lag * 2;
    if (lag2 < env.length) {
      let sum2 = 0;
      for (let i = 0; i + lag2 < env.length; i++) sum2 += env[i] * env[i + lag2];
      sum += sum2 * 0.45;
    }
    if (sum > best) {
      second = best;
      best = sum;
      bestLag = lag;
    } else if (sum > second) second = sum;
  }
  let bestBpm = bestLag ? Math.round(60 / (bestLag * hopSec)) : 120;
  const scoreAt = (bpm: number) => {
    const lag = Math.round(60 / bpm / hopSec);
    let sum = 0;
    for (let i = 0; i + lag < env.length; i++) sum += env[i] * env[i + lag];
    return sum;
  };
  if (bestBpm > 150 && scoreAt(Math.round(bestBpm / 2)) > best * 0.72) bestBpm = Math.round(bestBpm / 2);
  if (bestBpm < 85 && bestBpm * 2 <= 180 && scoreAt(bestBpm * 2) > best * 0.8) bestBpm *= 2;
  return { bpm: bestBpm, confidence: best > 0 ? Math.min(1, (best - second) / best) : 0 };
}

export function shiftKey(label: string, semitones: number): string {
  if (!semitones) return label;
  const parts = label.split(" ");
  const idx = NOTE_NAMES.indexOf(parts[0] ?? "");
  if (idx < 0) return label;
  const next = (idx + semitones) % 12;
  const root = NOTE_NAMES[(next + 12) % 12];
  return `${root} ${parts.slice(1).join(" ")}`.trim();
}

export function confidenceWord(value: number): string {
  if (value >= 0.08) return "High confidence";
  if (value >= 0.035) return "Medium confidence";
  return "Low confidence";
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function dbLabel(linear: number): string {
  if (linear <= 0.001) return "−∞";
  const db = 20 * Math.log10(linear);
  const text = Math.abs(db).toFixed(1);
  return `${db >= 0 ? "+" : "−"}${text} dB`;
}

export function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

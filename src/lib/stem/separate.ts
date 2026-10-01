import { getInstrument, type Profile } from "@/lib/stem/catalog";
import { hpss, istftMasked, resampleLinear, rms, stft, yieldNow } from "@/lib/stem/dsp";

const FFT = 2048;
const HOP = 512;

function band(freq: number, profile: Profile): number {
  const hz = Math.max(1, freq);
  const oct = Math.log2(hz / profile.center);
  let weight = Math.exp(-0.5 * (oct / profile.oct) ** 2);
  if (hz < profile.lo) weight *= Math.exp(-((profile.lo - hz) / profile.lo) * 2.4);
  if (hz > profile.hi) weight *= Math.exp(-((hz - profile.hi) / profile.hi) * 1.8);
  return weight;
}

function smoothMask(mask: Float32Array, frames: number, bins: number) {
  const next = mask.slice();
  for (let t = 0; t < frames; t++) {
    const base = t * bins;
    for (let k = 1; k < bins - 1; k++) {
      next[base + k] = mask[base + k] * 0.6 + mask[base + k - 1] * 0.2 + mask[base + k + 1] * 0.2;
    }
  }
  mask.set(next);
}

export async function separateMono(
  samples: Float32Array,
  sampleRate: number,
  instrumentIds: string[],
  onProgress?: (progress: number) => void,
): Promise<{ stems: { instrumentId: string; samples: Float32Array }[]; rest: Float32Array }> {
  const workRate = Math.min(sampleRate, 44100);
  const mono = workRate === sampleRate ? samples : resampleLinear(samples, sampleRate, workRate);
  const stems = instrumentIds.map((id) => ({
    instrumentId: id,
    samples: new Float32Array(mono.length),
  }));
  const rest = new Float32Array(mono.length);
  const chunk = Math.floor(workRate * 8);
  const overlap = FFT;
  let pos = 0;
  while (pos < mono.length) {
    const end = Math.min(mono.length, pos + chunk);
    const slice = mono.subarray(pos, end);
    const spec = stft(slice, FFT, HOP);
    const { harmonic, percussive } = hpss(spec.mag, spec.frames, spec.bins, 6);
    const masks = instrumentIds.map(() => new Float32Array(spec.mag.length));
    const sum = new Float32Array(spec.mag.length);
    for (let t = 0; t < spec.frames; t++) {
      for (let k = 0; k < spec.bins; k++) {
        const idx = t * spec.bins + k;
        const freq = (k * workRate) / FFT;
        const h = harmonic[idx];
        const p = percussive[idx];
        const denom = h + p + 1e-8;
        const hMask = h / denom;
        const pMask = p / denom;
        for (let s = 0; s < instrumentIds.length; s++) {
          const profile = getInstrument(instrumentIds[s])?.profile;
          if (!profile) continue;
          let m = (profile.harm * hMask + (1 - profile.harm) * pMask) * band(freq, profile);
          m = Math.max(0, m) ** 1.3;
          masks[s][idx] = m;
          sum[idx] += m;
        }
      }
    }
    for (const mask of masks) smoothMask(mask, spec.frames, spec.bins);
    sum.fill(0);
    for (const mask of masks) {
      for (let i = 0; i < sum.length; i++) sum[i] += mask[i];
    }
    const restMask = new Float32Array(spec.mag.length);
    for (let i = 0; i < sum.length; i++) {
      if (sum[i] > 1) {
        const scale = 1 / sum[i];
        for (const mask of masks) mask[i] *= scale;
        restMask[i] = 0;
      } else restMask[i] = Math.max(0, 1 - sum[i]);
    }
    const fade = Math.min(overlap, slice.length);
    const write = (dest: Float32Array, part: Float32Array) => {
      for (let i = 0; i < part.length && pos + i < dest.length; i++) {
        if (pos > 0 && i < fade) {
          const g = i / fade;
          dest[pos + i] = dest[pos + i] * (1 - g) + part[i] * g;
        } else dest[pos + i] = part[i];
      }
    };
    for (let s = 0; s < stems.length; s++) write(stems[s].samples, istftMasked(spec, masks[s]));
    write(rest, istftMasked(spec, restMask));
    const step = Math.max(FFT, end - pos - overlap);
    pos = end >= mono.length ? mono.length : pos + step;
    onProgress?.(Math.min(0.98, pos / mono.length));
    await yieldNow();
  }
  if (workRate !== sampleRate) {
    for (const stem of stems) {
      stem.samples = new Float32Array(resampleLinear(stem.samples, workRate, sampleRate));
    }
    return { stems, rest: new Float32Array(resampleLinear(rest, workRate, sampleRate)) };
  }
  return { stems, rest };
}

export function stemIsQuiet(samples: Float32Array): boolean {
  return rms(samples) < 0.012;
}

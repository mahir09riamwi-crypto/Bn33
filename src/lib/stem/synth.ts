export type Note = { t: number; dur: number; freq: number; vel: number };
export type HitKind = "dum" | "tek" | "ka" | "hat";
export type Hit = { t: number; kind: HitKind; vel: number };
export type StemScore = { notes: Note[]; hits: Hit[] };

export type RenderedStem = {
  instrumentId: string;
  samples: Float32Array;
  score: StemScore;
};

export type DemoSong = {
  sampleRate: number;
  mix: Float32Array;
  stems: RenderedStem[];
  duration: number;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mixAt(dest: Float32Array, src: Float32Array, offset: number, gain: number) {
  const start = Math.max(0, offset);
  for (let i = 0; i < src.length; i++) {
    const at = start + i;
    if (at >= dest.length) break;
    dest[at] += src[i] * gain;
  }
}

function envGain(i: number, n: number, attack: number, release: number): number {
  const a = Math.min(1, i / Math.max(1, attack));
  const relStart = n - release;
  const r = i > relStart ? Math.max(0, 1 - (i - relStart) / Math.max(1, release)) : 1;
  return a * r;
}

function pluck(freq: number, dur: number, sr: number, vel: number, rng: () => number, bright = 0.45): Float32Array {
  const n = Math.max(2, Math.round(sr / Math.max(40, freq)));
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = (rng() * 2 - 1) * (1 - (1 - bright) * (i / n));
  const outLen = Math.max(1, Math.floor(sr * dur));
  const out = new Float32Array(outLen);
  const loss = 0.08 ** (1 / Math.max(1, dur * sr));
  let idx = 0;
  let prev = 0;
  for (let i = 0; i < outLen; i++) {
    const s = buf[idx];
    const next = buf[(idx + 1) % n];
    const avg = (s + next) * 0.5;
    const filtered = avg * 0.65 + prev * 0.35;
    prev = avg;
    buf[idx] = filtered * (0.2 + 0.8 * loss);
    out[i] = s * vel;
    idx = (idx + 1) % n;
  }
  return out;
}

function bowed(freq: number, dur: number, sr: number, vel: number, partials: number): Float32Array {
  const n = Math.max(1, Math.floor(sr * dur));
  const out = new Float32Array(n);
  const attack = Math.floor(sr * 0.09);
  const release = Math.floor(sr * Math.min(0.25, dur * 0.3));
  for (let h = 1; h <= partials; h++) {
    const amp = vel / h;
    const f = freq * h;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * t);
      phase += (f * vib) / sr;
      out[i] += Math.sin(2 * Math.PI * phase) * amp * envGain(i, n, attack, release);
    }
  }
  return out;
}

function wind(freq: number, dur: number, sr: number, vel: number, rng: () => number, breath: number): Float32Array {
  const n = Math.max(1, Math.floor(sr * dur));
  const out = new Float32Array(n);
  const attack = Math.floor(sr * 0.07);
  const release = Math.floor(sr * 0.12);
  let phase = 0;
  let noise = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const vib = 1 + 0.007 * Math.sin(2 * Math.PI * 5.4 * t);
    phase += (freq * vib) / sr;
    const p = phase % 1;
    noise = noise * 0.98 + (rng() * 2 - 1) * 0.02;
    const tone =
      Math.sin(2 * Math.PI * phase) +
      0.28 * Math.sin(4 * Math.PI * phase) +
      0.08 * Math.sin(6 * Math.PI * phase);
    const air = noise * breath * (0.6 + 0.4 * Math.sin(Math.PI * p));
    out[i] = (tone * 0.8 + air) * vel * envGain(i, n, attack, release);
  }
  return out;
}

function piano(freq: number, dur: number, sr: number, vel: number): Float32Array {
  const n = Math.max(1, Math.floor(sr * dur));
  const out = new Float32Array(n);
  for (let h = 1; h <= 7; h++) {
    const fh = freq * h * (1 + 0.00015 * h * h);
    const amp = vel / h ** 1.15;
    const decay = Math.exp(-((0.8 + h * 0.55) / Math.max(0.2, dur)));
    let phase = 0;
    for (let i = 0; i < n; i++) {
      phase += fh / sr;
      const e = Math.exp((-i / n) * (2.2 + h * 0.35)) * (i < 80 ? i / 80 : 1);
      out[i] += Math.sin(2 * Math.PI * phase) * amp * e * (0.45 + decay);
    }
  }
  return out;
}

function epiano(freq: number, dur: number, sr: number, vel: number): Float32Array {
  const n = Math.max(1, Math.floor(sr * dur));
  const out = new Float32Array(n);
  let car = 0;
  let mod = 0;
  for (let i = 0; i < n; i++) {
    mod += (freq * 2.01) / sr;
    car += freq / sr;
    const e = Math.exp(-i / (sr * Math.max(0.25, dur * 0.7)));
    const attack = Math.min(1, i / 120);
    out[i] = Math.sin(2 * Math.PI * car + 1.4 * e * Math.sin(2 * Math.PI * mod)) * vel * e * attack;
  }
  return out;
}

function vocal(freq: number, dur: number, sr: number, vel: number, rng: () => number): Float32Array {
  const n = Math.max(1, Math.floor(sr * dur));
  const out = new Float32Array(n);
  const formants = [
    { f: 730, bw: 90, g: 1 },
    { f: 1090, bw: 110, g: 0.6 },
    { f: 2440, bw: 170, g: 0.28 },
  ].map((item) => {
    const w0 = (2 * Math.PI * item.f) / sr;
    const alpha = Math.sin(w0) / (2 * (item.f / item.bw));
    const a0 = 1 + alpha;
    return {
      b0: alpha / a0,
      b2: -alpha / a0,
      a1: (-2 * Math.cos(w0)) / a0,
      a2: (1 - alpha) / a0,
      g: item.g,
      x1: 0,
      x2: 0,
      y1: 0,
      y2: 0,
    };
  });
  let phase = 0;
  const attack = Math.floor(sr * 0.04);
  const release = Math.floor(sr * 0.08);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    phase += (freq * (1 + 0.008 * Math.sin(2 * Math.PI * 5 * t))) / sr;
    const p = phase % 1;
    const glottal = Math.sin(Math.PI * p) * Math.exp(-3.2 * p) + (rng() * 2 - 1) * 0.02;
    let y = 0;
    for (const r of formants) {
      const yn = r.b0 * glottal + r.b2 * r.x2 - r.a1 * r.y1 - r.a2 * r.y2;
      r.x2 = r.x1;
      r.x1 = glottal;
      r.y2 = r.y1;
      r.y1 = yn;
      y += yn * r.g;
    }
    out[i] = y * vel * 2.4 * envGain(i, n, attack, release);
  }
  return out;
}

function noiseBurst(sr: number, dur: number, vel: number, rng: () => number, color: (n: number) => number): Float32Array {
  const n = Math.max(1, Math.floor(sr * dur));
  const out = new Float32Array(n);
  let state = 0;
  for (let i = 0; i < n; i++) {
    const white = rng() * 2 - 1;
    state = color(state * 0 + white);
    const t = i / sr;
    out[i] = state * vel * Math.exp(-t / Math.max(0.012, dur * 0.35));
  }
  return out;
}

function renderHit(kind: HitKind, kit: string, sr: number, vel: number, rng: () => number): Float32Array {
  const useKit = kit === "drum-kit" || kit === "kick" || kit === "snare" || kit === "hi-hat" || kit === "cymbals" || kit === "percussion";
  if (kit === "darbuka" || (!useKit && kind !== "hat")) {
    if (kind === "dum" || kit === "kick") return dum(sr, vel, rng, kit === "kick" ? 55 : 78);
    if (kind === "tek") return tek(sr, vel, rng, 1700);
    if (kind === "ka") return tek(sr, vel * 0.8, rng, 2800);
    return tek(sr, vel * 0.7, rng, 4200);
  }
  if (kit === "frame-drum") {
    if (kind === "dum") return dum(sr, vel, rng, 62);
    return tek(sr, vel * 0.75, rng, 900);
  }
  if (kind === "dum" || kit === "kick") return dum(sr, vel, rng, kit === "darbuka" ? 90 : 52);
  if (kind === "hat" || kit === "hi-hat") return tek(sr, vel, rng, 6200);
  if (kit === "cymbals") {
    const n = Math.floor(sr * 0.55);
    const out = new Float32Array(n);
    let hp = 0;
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const w = rng() * 2 - 1;
      hp = 0.92 * (hp + w - prev);
      prev = w;
      out[i] = hp * vel * Math.exp(-i / (sr * 0.22));
    }
    return out;
  }
  if (kind === "tek" || kit === "snare") {
    const body = dum(sr, vel * 0.45, rng, 180);
    const noise = tek(sr, vel, rng, 2200);
    const out = new Float32Array(Math.max(body.length, noise.length));
    mixAt(out, body, 0, 0.7);
    mixAt(out, noise, 0, 0.8);
    return out;
  }
  return tek(sr, vel, rng, 2400);
}

function dum(sr: number, vel: number, rng: () => number, startFreq: number): Float32Array {
  const n = Math.floor(sr * 0.22);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = startFreq * 0.45 + startFreq * Math.exp(-t * 28);
    phase += f / sr;
    const noise = (rng() * 2 - 1) * Math.exp(-t * 40);
    out[i] = (Math.sin(2 * Math.PI * phase) * 0.95 + noise * 0.28) * Math.exp(-t * 14) * vel;
  }
  return out;
}

function tek(sr: number, vel: number, rng: () => number, tone: number): Float32Array {
  const dur = tone > 4000 ? 0.045 : 0.07;
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  let band = 0;
  let prev = 0;
  const q = Math.min(0.92, 400 / tone);
  for (let i = 0; i < n; i++) {
    const w = rng() * 2 - 1;
    band += (w - band) * q;
    const hp = band - prev;
    prev = band;
    out[i] = hp * vel * Math.exp(-i / (n * 0.32)) * 2.2;
  }
  return out;
}

function renderNote(id: string, note: Note, sr: number, rng: () => number): Float32Array {
  const { freq, dur, vel } = note;
  switch (id) {
    case "oud":
      return pluck(freq, dur, sr, vel, rng, 0.35);
    case "qanun": {
      const a = pluck(freq, dur * 0.85, sr, vel, rng, 0.7);
      const b = pluck(freq * 1.004, dur * 0.8, sr, vel * 0.8, rng, 0.75);
      mixAt(a, b, 0, 0.7);
      return a;
    }
    case "classic-guitar":
    case "acoustic-guitar":
      return pluck(freq, dur, sr, vel, rng, id === "acoustic-guitar" ? 0.55 : 0.42);
    case "electric-guitar": {
      const raw = pluck(freq, dur * 1.15, sr, vel, rng, 0.62);
      for (let i = 0; i < raw.length; i++) raw[i] = Math.tanh(raw[i] * 2.6) * 0.72;
      return raw;
    }
    case "double-bass":
    case "bass-guitar": {
      const raw = pluck(freq, dur, sr, vel * 1.2, rng, 0.18);
      if (id === "bass-guitar") {
        for (let i = 0; i < raw.length; i++) raw[i] = Math.tanh(raw[i] * 1.8);
      }
      return raw;
    }
    case "cello":
      return bowed(freq, dur, sr, vel, 8);
    case "viola":
      return bowed(freq, dur, sr, vel, 9);
    case "violin":
      return bowed(freq, dur, sr, vel * 0.9, 10);
    case "nay":
      return wind(freq, dur, sr, vel, rng, 0.55);
    case "flute":
      return wind(freq, dur, sr, vel * 0.85, rng, 0.22);
    case "brass":
      return bowed(freq, dur, sr, vel * 0.8, 6);
    case "piano":
      return piano(freq, dur, sr, vel);
    case "electric-piano":
      return epiano(freq, dur, sr, vel);
    case "synth": {
      const raw = bowed(freq, dur, sr, vel * 0.55, 5);
      for (let i = 0; i < raw.length; i++) raw[i] = Math.tanh(raw[i] * 1.4);
      return raw;
    }
    case "lead-vocal":
      return vocal(freq, dur, sr, vel, rng);
    case "backing-vocal":
      return vocal(freq * 1.005, dur, sr, vel * 0.75, rng);
    default:
      return pluck(freq, dur, sr, vel, rng, 0.4);
  }
}

function notesFromHits(hits: Hit[]): Note[] {
  return hits.map((hit, index) => {
    const freq = hit.kind === "dum" ? 110 : hit.kind === "tek" ? 220 : hit.kind === "ka" ? 330 : 660;
    return { t: hit.t, dur: hit.kind === "dum" ? 0.28 : 0.12, freq: freq * (1 + (index % 3) * 0.02), vel: hit.vel };
  });
}

function hitsFromNotes(notes: Note[]): Hit[] {
  return notes.map((note) => ({
    t: note.t,
    vel: note.vel,
    kind: note.freq < 140 ? "dum" : note.freq > 700 ? "ka" : "tek",
  }));
}

const PERC = new Set(["kick", "snare", "hi-hat", "cymbals", "drum-kit", "darbuka", "frame-drum", "percussion"]);

export function renderInstrument(
  id: string,
  score: StemScore,
  sr: number,
  duration: number,
  seed = 1,
): Float32Array {
  const rng = mulberry32(seed + id.length * 97);
  const out = new Float32Array(Math.max(1, Math.floor(sr * duration)));
  if (PERC.has(id)) {
    const hits = score.hits.length ? score.hits : hitsFromNotes(score.notes);
    for (const hit of hits) {
      const buffer = renderHit(hit.kind, id, sr, hit.vel, rng);
      mixAt(out, buffer, Math.floor(hit.t * sr), 1);
    }
  } else {
    const notes = score.notes.length ? score.notes : notesFromHits(score.hits);
    for (const note of notes) {
      const buffer = renderNote(id, note, sr, rng);
      mixAt(out, buffer, Math.floor(note.t * sr), 1);
    }
  }
  for (let i = 0; i < out.length; i++) out[i] += (rng() * 2 - 1) * 0.0075;
  let peak = 0;
  for (let i = 0; i < out.length; i += 2) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0.98 ? 0.98 / peak : 1;
  if (gain !== 1) for (let i = 0; i < out.length; i++) out[i] *= gain;
  return out;
}

const midi = (semisFromA3: number) => 220 * 2 ** (semisFromA3 / 12);

export function createDemoSong(): DemoSong {
  const sampleRate = 44100;
  const bpm = 108;
  const beat = 60 / bpm;
  const bars = 8;
  const duration = bars * 4 * beat;
  const oud: StemScore = { notes: [], hits: [] };
  const qanun: StemScore = { notes: [], hits: [] };
  const nay: StemScore = { notes: [], hits: [] };
  const violin: StemScore = { notes: [], hits: [] };
  const bass: StemScore = { notes: [], hits: [] };
  const darbuka: StemScore = { notes: [], hits: [] };

  const phraseA = [
    [0, 1, 0],
    [1, 1, 1],
    [2, 0.5, 4],
    [2.5, 0.5, 5],
    [3, 0.5, 4],
    [3.5, 0.5, 1],
  ];
  const phraseB = [
    [0, 1, 0],
    [1, 0.5, 7],
    [1.5, 0.5, 8],
    [2, 1, 7],
    [3, 1, 0],
  ];
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat;
    const phrase = bar === bars - 1 ? [[0, 1, 1], [1, 1, 4], [2, 1, 5], [3, 1, 0]] : bar % 2 === 0 ? phraseA : phraseB;
    for (const [start, len, semi] of phrase) {
      oud.notes.push({
        t: t0 + start * beat,
        dur: len * beat * 0.92,
        freq: midi(12 + semi),
        vel: 0.85,
      });
    }
    const roll = [0, 1, 4, 5, 7, 4, 1, 0];
    roll.forEach((semi, i) => {
      qanun.notes.push({
        t: t0 + i * 0.5 * beat,
        dur: 0.28 * beat,
        freq: midi(semi + (i % 2 === 0 ? 0 : 12)),
        vel: 0.62,
      });
    });
    const bassSemi = [0, 5, 7, 0][bar % 4] - 12;
    bass.notes.push({ t: t0, dur: 3.5 * beat, freq: midi(bassSemi), vel: 0.9 });
    if (bar % 2 === 0) {
      violin.notes.push(
        { t: t0, dur: 1.8 * beat, freq: midi(12), vel: 0.28 },
        { t: t0 + 2 * beat, dur: 1.8 * beat, freq: midi(13), vel: 0.26 },
      );
    }
    if (bar % 2 === 1) {
      nay.notes.push(
        { t: t0, dur: 1.6 * beat, freq: midi(16), vel: 0.5 },
        { t: t0 + 2 * beat, dur: 1.6 * beat, freq: midi(25), vel: 0.46 },
      );
    }
    const pattern: [number, HitKind, number][] = [
      [0, "dum", 1],
      [1, "tek", 0.42],
      [2, "dum", 0.82],
      [2.5, "tek", 0.32],
      [3, "tek", 0.4],
      [3.5, "ka", 0.28],
    ];
    for (const [start, kind, vel] of pattern) {
      darbuka.hits.push({ t: t0 + start * beat, kind, vel });
    }
  }

  const specs: { id: string; score: StemScore; gain: number; seed: number }[] = [
    { id: "darbuka", score: darbuka, gain: 0.7, seed: 11 },
    { id: "double-bass", score: bass, gain: 0.48, seed: 12 },
    { id: "qanun", score: qanun, gain: 0.46, seed: 13 },
    { id: "oud", score: oud, gain: 0.7, seed: 14 },
    { id: "violin", score: violin, gain: 0.22, seed: 15 },
    { id: "nay", score: nay, gain: 0.4, seed: 16 },
  ];

  const stems: RenderedStem[] = specs.map((spec) => {
    const raw = renderInstrument(spec.id, spec.score, sampleRate, duration, spec.seed);
    for (let i = 0; i < raw.length; i++) raw[i] *= spec.gain;
    return { instrumentId: spec.id, samples: raw, score: spec.score };
  });

  const mix = new Float32Array(stems[0]?.samples.length ?? 1);
  for (const stem of stems) mixAt(mix, stem.samples, 0, 1);
  let peak = 0;
  for (let i = 0; i < mix.length; i += 2) peak = Math.max(peak, Math.abs(mix[i]));
  const norm = peak > 0.97 ? 0.97 / peak : 1;
  if (norm !== 1) {
    for (let i = 0; i < mix.length; i++) mix[i] *= norm;
    for (const stem of stems) for (let i = 0; i < stem.samples.length; i++) stem.samples[i] *= norm;
  }
  return { sampleRate, mix, stems, duration };
}

export function sumSamples(parts: Float32Array[], length: number): Float32Array {
  const out = new Float32Array(length);
  for (const part of parts) {
    const n = Math.min(length, part.length);
    for (let i = 0; i < n; i++) out[i] += part[i];
  }
  return out;
}

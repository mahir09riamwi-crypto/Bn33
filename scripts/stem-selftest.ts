import { detectBpm, detectKey, fft, ifft } from "../src/lib/stem/dsp.ts";
import { encodeAiff, encodeFlac, encodeWav } from "../src/lib/stem/encode.ts";
import { createDemoSong } from "../src/lib/stem/synth.ts";

const n = 32;
const re = new Float32Array(n);
const im = new Float32Array(n);
for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 3 * i) / n);
const original = re.slice();
fft(re, im);
ifft(re, im);
let err = 0;
for (let i = 0; i < n; i++) err = Math.max(err, Math.abs(re[i] - original[i]));
if (err > 1e-4) throw new Error(`fft roundtrip ${err}`);

const song = createDemoSong();
const key = detectKey(song.mix, song.sampleRate);
const bpm = detectBpm(song.mix, song.sampleRate);
console.log(JSON.stringify({ key, bpm, duration: song.duration, stems: song.stems.map((s) => s.instrumentId) }));
if (key.name !== "A Hijaz") throw new Error(`expected A Hijaz, got ${key.name}`);
if (bpm.bpm < 106 || bpm.bpm > 110) throw new Error(`expected ~108 bpm, got ${bpm.bpm}`);

const channels = [song.mix, song.mix];
const wav = encodeWav(channels, song.sampleRate);
const aiff = encodeAiff(channels, song.sampleRate);
const flac = encodeFlac(channels, song.sampleRate);
if (String.fromCharCode(...wav.slice(0, 4)) !== "RIFF") throw new Error("wav");
if (String.fromCharCode(...aiff.slice(0, 4)) !== "FORM") throw new Error("aiff");
if (String.fromCharCode(...flac.slice(0, 4)) !== "fLaC") throw new Error("flac marker");
console.log("encoders", { wav: wav.length, aiff: aiff.length, flac: flac.length });
console.log("ok");

import { writeFileSync } from "node:fs";
import { encodeAiff, encodeFlac, encodeMp3, encodeWav } from "../src/lib/stem/encode.ts";

const sr = 44100;
const n = sr;
const left = new Float32Array(n);
const right = new Float32Array(n);
for (let i = 0; i < n; i++) {
  const s = Math.sin((2 * Math.PI * 440 * i) / sr) * 0.4;
  left[i] = s;
  right[i] = s * 0.8;
}
writeFileSync("/tmp/stem.wav", encodeWav([left, right], sr));
writeFileSync("/tmp/stem.aiff", encodeAiff([left, right], sr));
writeFileSync("/tmp/stem.flac", encodeFlac([left, right], sr));
writeFileSync("/tmp/stem.mp3", encodeMp3([left, right], sr));
console.log("wrote");

import { Mp3Encoder } from "@breezystack/lamejs";
import { resampleLinear } from "@/lib/stem/dsp";

export type AudioFormat = "mp3" | "wav" | "flac" | "ogg" | "aac" | "aiff";

const MIME: Record<AudioFormat, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
  aac: "audio/aac",
  aiff: "audio/aiff",
};

function clamp16(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample));
  return s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
}

function asStereo(channels: Float32Array[]): [Float32Array, Float32Array] {
  const left = channels[0] ?? new Float32Array(1);
  const right = channels[1] ?? left;
  const n = Math.max(left.length, right.length);
  if (left.length === n && right.length === n) return [left, right];
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  l.set(left);
  r.set(right.length === left.length ? right : left);
  return [l, r];
}

export function encodeWav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const [left, right] = asStereo(channels);
  const n = left.length;
  const dataSize = n * 4;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < n; i++) {
    view.setInt16(offset, clamp16(left[i]), true);
    view.setInt16(offset + 2, clamp16(right[i]), true);
    offset += 4;
  }
  return new Uint8Array(buffer);
}

function extended80(rate: number): Uint8Array {
  const out = new Uint8Array(10);
  if (rate <= 0) return out;
  let value = rate;
  let exp = 0;
  while (value >= 2) {
    value /= 2;
    exp++;
  }
  while (value < 1) {
    value *= 2;
    exp--;
  }
  const bias = exp + 16383;
  out[0] = (bias >> 8) & 0x7f;
  out[1] = bias & 0xff;
  let frac = value;
  for (let i = 0; i < 8; i++) {
    frac *= 256;
    const byte = Math.floor(frac);
    out[2 + i] = byte & 0xff;
    frac -= byte;
  }
  return out;
}

export function encodeAiff(channels: Float32Array[], sampleRate: number): Uint8Array {
  const [left, right] = asStereo(channels);
  const n = left.length;
  const dataSize = n * 4;
  const comm = 18;
  const ssnd = 8 + dataSize;
  const form = 4 + (8 + comm) + (8 + ssnd);
  const buffer = new ArrayBuffer(8 + form);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "FORM");
  view.setUint32(4, form, false);
  write(8, "AIFF");
  write(12, "COMM");
  view.setUint32(16, comm, false);
  view.setUint16(20, 2, false);
  view.setUint32(22, n, false);
  view.setUint16(26, 16, false);
  const rate = extended80(sampleRate);
  for (let i = 0; i < 10; i++) view.setUint8(28 + i, rate[i]);
  const ssndAt = 38;
  write(ssndAt, "SSND");
  view.setUint32(ssndAt + 4, ssnd, false);
  view.setUint32(ssndAt + 8, 0, false);
  view.setUint32(ssndAt + 12, 0, false);
  let offset = ssndAt + 16;
  for (let i = 0; i < n; i++) {
    view.setInt16(offset, clamp16(left[i]), false);
    view.setInt16(offset + 2, clamp16(right[i]), false);
    offset += 4;
  }
  return new Uint8Array(buffer);
}

function crc8Table(): Uint8Array {
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    table[i] = crc;
  }
  return table;
}

function crc16Table(): Uint16Array {
  const table = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff;
    table[i] = crc;
  }
  return table;
}

const CRC8 = crc8Table();
const CRC16 = crc16Table();

function crc8(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) crc = CRC8[crc ^ byte];
  return crc;
}

function crc16(data: Uint8Array): number {
  let crc = 0;
  for (const byte of data) crc = ((crc << 8) ^ CRC16[((crc >> 8) ^ byte) & 0xff]) & 0xffff;
  return crc;
}

function utf8num(n: number): number[] {
  if (n < 0x80) return [n];
  if (n < 0x800) return [0xc0 | (n >> 6), 0x80 | (n & 0x3f)];
  if (n < 0x10000) return [0xe0 | (n >> 12), 0x80 | ((n >> 6) & 0x3f), 0x80 | (n & 0x3f)];
  return [0xf0 | (n >> 18), 0x80 | ((n >> 12) & 0x3f), 0x80 | ((n >> 6) & 0x3f), 0x80 | (n & 0x3f)];
}

class Bits {
  bytes: number[] = [];
  acc = 0;
  n = 0;
  write(value: number, width: number) {
    for (let i = width - 1; i >= 0; i--) {
      this.acc = (this.acc << 1) | (Math.floor(value / 2 ** i) % 2);
      this.n++;
      if (this.n === 8) {
        this.bytes.push(this.acc & 0xff);
        this.acc = 0;
        this.n = 0;
      }
    }
  }
  toUint8(): Uint8Array {
    if (this.n) {
      this.bytes.push((this.acc << (8 - this.n)) & 0xff);
      this.n = 0;
      this.acc = 0;
    }
    return Uint8Array.from(this.bytes);
  }
}

export function encodeFlac(channels: Float32Array[], sampleRate: number): Uint8Array {
  const stereo = asStereo(channels);
  let left = stereo[0];
  let right = stereo[1];
  const block = 4096;
  let total = left.length;
  const rem = total % block;
  if (total < 16 || (rem !== 0 && rem < 16)) {
    const pad = total < 16 ? 16 - total : 16 - rem;
    const nextL = new Float32Array(total + pad);
    const nextR = new Float32Array(total + pad);
    nextL.set(left);
    nextR.set(right);
    left = nextL;
    right = nextR;
    total = left.length;
  }
  const last = total % block || Math.min(block, total);
  const info = new Bits();
  info.write(Math.min(block, last), 16);
  info.write(Math.min(block, total), 16);
  info.write(0, 24);
  info.write(0, 24);
  info.write(sampleRate, 20);
  info.write(1, 3);
  info.write(15, 5);
  info.write(Math.floor(total / 2 ** 32), 4);
  info.write(total >>> 0, 32);
  for (let i = 0; i < 16; i++) info.write(0, 8);
  const streamInfo = info.toUint8();
  const parts: Uint8Array[] = [new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x80, 0x00, 0x00, 34]), streamInfo];
  let frame = 0;
  for (let offset = 0; offset < total; offset += block) {
    const count = Math.min(block, total - offset);
    const header: number[] = [];
    header.push(0xff, 0xf8);
    let blockCode = 12;
    let extra: number[] = [];
    if (count === 4096) blockCode = 12;
    else {
      blockCode = 7;
      extra = [(count - 1) >> 8, (count - 1) & 0xff];
    }
    header.push((blockCode << 4) | 0);
    header.push((1 << 4) | 0b1000);
    header.push(...utf8num(frame));
    header.push(...extra);
    header.push(crc8(Uint8Array.from(header)));
    const body = new Uint8Array(header.length + count * 4 + 2);
    body.set(header, 0);
    let at = header.length;
    const sub = () => {
      body[at++] = 1 << 1;
    };
    sub();
    for (let i = 0; i < count; i++) {
      const s = clamp16(left[offset + i]);
      body[at++] = (s >> 8) & 0xff;
      body[at++] = s & 0xff;
    }
    sub();
    for (let i = 0; i < count; i++) {
      const s = clamp16(right[offset + i]);
      body[at++] = (s >> 8) & 0xff;
      body[at++] = s & 0xff;
    }
    const framed = body.subarray(0, at);
    const crc = crc16(framed);
    const full = new Uint8Array(framed.length + 2);
    full.set(framed, 0);
    full[framed.length] = (crc >> 8) & 0xff;
    full[framed.length + 1] = crc & 0xff;
    parts.push(full);
    frame++;
  }
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

function i16(channel: Float32Array): Int16Array {
  const out = new Int16Array(channel.length);
  for (let i = 0; i < channel.length; i++) out[i] = clamp16(channel[i]);
  return out;
}

export function encodeMp3(channels: Float32Array[], sampleRate: number): Uint8Array {
  let left = channels[0] ?? new Float32Array(1);
  let right = channels[1] ?? left;
  let rate = sampleRate;
  if (![32000, 44100, 48000].includes(rate)) {
    left = resampleLinear(left, sampleRate, 44100);
    right = resampleLinear(right, sampleRate, 44100);
    rate = 44100;
  }
  const encoder = new Mp3Encoder(2, rate, 192);
  const l = i16(left);
  const r = i16(right);
  const parts: Uint8Array[] = [];
  const block = 1152;
  for (let i = 0; i < l.length; i += block) {
    const lBlock = new Int16Array(block);
    const rBlock = new Int16Array(block);
    lBlock.set(l.subarray(i, i + block));
    rBlock.set(r.subarray(i, Math.min(r.length, i + block)));
    const chunk = encoder.encodeBuffer(lBlock, rBlock);
    if (chunk.length) parts.push(chunk);
  }
  const end = encoder.flush();
  if (end.length) parts.push(end);
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

let oggTable: Uint32Array | null = null;
function oggCrc(data: Uint8Array): number {
  if (!oggTable) {
    oggTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let crc = i << 24;
      for (let j = 0; j < 8; j++) {
        crc = crc & 0x80000000 ? ((crc << 1) ^ 0x04c11db7) >>> 0 : (crc << 1) >>> 0;
      }
      oggTable[i] = crc >>> 0;
    }
  }
  let crc = 0;
  for (const byte of data) {
    crc = ((crc << 8) ^ oggTable[((crc >>> 24) ^ byte) & 0xff]) >>> 0;
  }
  return crc >>> 0;
}

function oggPage(packets: Uint8Array[], serial: number, seq: number, granule: bigint, bos: boolean, eos: boolean): Uint8Array {
  const segments: number[] = [];
  const body: number[] = [];
  for (const packet of packets) {
    let left = packet.length;
    let offset = 0;
    do {
      const take = Math.min(255, left);
      segments.push(take);
      for (let i = 0; i < take; i++) body.push(packet[offset + i]);
      offset += take;
      left -= take;
    } while (left > 0 || packet.length === 0);
    if (packet.length % 255 === 0) {
      /* packet already terminated by a short segment, including 0 */
    }
  }
  const head = new Uint8Array(27 + segments.length + body.length);
  const view = new DataView(head.buffer);
  head.set([0x4f, 0x67, 0x67, 0x53, 0], 0);
  head[5] = (bos ? 0x02 : 0) | (eos ? 0x04 : 0);
  view.setUint32(6, Number(granule & 0xffffffffn), true);
  view.setUint32(10, Number((granule >> 32n) & 0xffffffffn), true);
  view.setUint32(14, serial, true);
  view.setUint32(18, seq, true);
  head[26] = segments.length;
  head.set(segments, 27);
  head.set(body, 27 + segments.length);
  const crc = oggCrc(head);
  view.setUint32(22, crc, true);
  return head;
}

function opusHead(channels: number, sampleRate: number): Uint8Array {
  const packet = new Uint8Array(19);
  const view = new DataView(packet.buffer);
  packet.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 1, channels], 0);
  view.setUint16(10, 312, true);
  view.setUint32(12, sampleRate, true);
  return packet;
}

function opusTags(): Uint8Array {
  const vendor = "StemSplit";
  const packet = new Uint8Array(8 + 4 + vendor.length + 4);
  packet.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0);
  const view = new DataView(packet.buffer);
  view.setUint32(8, vendor.length, true);
  for (let i = 0; i < vendor.length; i++) packet[12 + i] = vendor.charCodeAt(i);
  return packet;
}

async function encodeOpusPackets(channels: Float32Array[], sampleRate: number): Promise<Uint8Array[]> {
  if (typeof AudioEncoder === "undefined") throw new Error("This browser cannot encode OGG.");
  const rate = 48000;
  const left = resampleLinear(channels[0], sampleRate, rate);
  const right = resampleLinear(channels[1] ?? channels[0], sampleRate, rate);
  const support = await AudioEncoder.isConfigSupported({
    codec: "opus",
    sampleRate: rate,
    numberOfChannels: 2,
    bitrate: 128000,
  });
  if (!support.supported) throw new Error("OGG Opus encoding is not available here.");
  const packets: Uint8Array[] = [];
  const encoder = new AudioEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      packets.push(data);
    },
    error: (error) => {
      throw error;
    },
  });
  encoder.configure({ codec: "opus", sampleRate: rate, numberOfChannels: 2, bitrate: 128000 });
  const frame = 960;
  for (let i = 0; i < left.length; i += frame) {
    const count = Math.min(frame, left.length - i);
    const planar = new Float32Array(frame * 2);
    planar.set(left.subarray(i, i + count), 0);
    planar.set(right.subarray(i, i + count), frame);
    const audio = new AudioData({
      format: "f32-planar",
      sampleRate: rate,
      numberOfFrames: frame,
      numberOfChannels: 2,
      timestamp: Math.round((i / rate) * 1_000_000),
      data: planar,
    });
    encoder.encode(audio);
    audio.close();
  }
  await encoder.flush();
  encoder.close();
  return packets;
}

export async function encodeOgg(channels: Float32Array[], sampleRate: number): Promise<Uint8Array> {
  const packets = await encodeOpusPackets(channels, sampleRate);
  const serial = 0x5354454d;
  const pages: Uint8Array[] = [
    oggPage([opusHead(2, sampleRate)], serial, 0, 0n, true, false),
    oggPage([opusTags()], serial, 1, 0n, false, false),
  ];
  let granule = 312n;
  let seq = 2;
  const group: Uint8Array[] = [];
  packets.forEach((packet, index) => {
    group.push(packet);
    granule += 960n;
    const last = index === packets.length - 1;
    if (group.length === 16 || last) {
      pages.push(oggPage(group.splice(0, group.length), serial, seq++, granule, false, last));
    }
  });
  return concat(pages);
}

function adts(length: number, sampleRate: number, channels: number): Uint8Array {
  const rates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050];
  const freq = Math.max(0, rates.indexOf(sampleRate));
  const frame = length + 7;
  const header = new Uint8Array(7);
  header[0] = 0xff;
  header[1] = 0xf1;
  header[2] = (1 << 6) | (freq << 2) | ((channels >> 2) & 1);
  header[3] = ((channels & 3) << 6) | ((frame >> 11) & 0x3);
  header[4] = (frame >> 3) & 0xff;
  header[5] = ((frame & 7) << 5) | 0x1f;
  header[6] = 0xfc;
  return header;
}

async function encodeAacWasm(
  channels: Float32Array[],
  sampleRate: number,
  onProgress?: (value: number) => void,
): Promise<Uint8Array> {
  const wav = encodeWav(channels, sampleRate);
  const [{ Input, ALL_FORMATS, BufferSource, Output, BufferTarget, Mp4OutputFormat, Conversion, canEncodeAudio }, { registerAacEncoder }] =
    await Promise.all([import("mediabunny"), import("@mediabunny/aac-encoder")]);
  if (!(await canEncodeAudio("aac"))) registerAacEncoder();
  const pcm = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength);
  const input = new Input({ source: new BufferSource(pcm), formats: ALL_FORMATS });
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const conversion = await Conversion.init({
    input,
    output,
    audio: { codec: "aac", bitrate: 192000, forceTranscode: true },
  });
  if (!conversion.isValid) {
    const reason = conversion.discardedTracks.map((track) => track.reason).join(", ");
    throw new Error(reason || "AAC encoding is not available in this browser.");
  }
  conversion.onProgress = (value) => onProgress?.(value);
  await conversion.execute();
  if (!target.buffer) throw new Error("AAC encoding failed.");
  onProgress?.(1);
  return new Uint8Array(target.buffer);
}

export async function encodeAac(
  channels: Float32Array[],
  sampleRate: number,
  onProgress?: (value: number) => void,
): Promise<Uint8Array> {
  const rate = 48000;
  const supported =
    typeof AudioEncoder !== "undefined" &&
    (await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate: rate,
      numberOfChannels: 2,
      bitrate: 192000,
    }).catch(() => ({ supported: false }))).supported;
  if (!supported) return encodeAacWasm(channels, sampleRate, onProgress);
  const left = resampleLinear(channels[0], sampleRate, rate);
  const right = resampleLinear(channels[1] ?? channels[0], sampleRate, rate);
  const frames: Uint8Array[] = [];
  const encoder = new AudioEncoder({
    output: (chunk) => {
      const raw = new Uint8Array(chunk.byteLength);
      chunk.copyTo(raw);
      const header = adts(raw.length, rate, 2);
      const full = new Uint8Array(header.length + raw.length);
      full.set(header, 0);
      full.set(raw, header.length);
      frames.push(full);
    },
    error: (error) => {
      throw error;
    },
  });
  encoder.configure({ codec: "mp4a.40.2", sampleRate: rate, numberOfChannels: 2, bitrate: 192000 });
  const frame = 1024;
  for (let i = 0; i < left.length; i += frame) {
    const count = Math.min(frame, left.length - i);
    const planar = new Float32Array(frame * 2);
    planar.set(left.subarray(i, i + count), 0);
    planar.set(right.subarray(i, i + count), frame);
    const audio = new AudioData({
      format: "f32-planar",
      sampleRate: rate,
      numberOfFrames: frame,
      numberOfChannels: 2,
      timestamp: Math.round((i / rate) * 1_000_000),
      data: planar,
    });
    encoder.encode(audio);
    audio.close();
  }
  await encoder.flush();
  encoder.close();
  return concat(frames);
}

export async function encodeFormat(
  channels: Float32Array[],
  sampleRate: number,
  format: AudioFormat,
  onProgress?: (value: number) => void,
): Promise<Uint8Array> {
  switch (format) {
    case "wav":
      return encodeWav(channels, sampleRate);
    case "aiff":
      return encodeAiff(channels, sampleRate);
    case "flac":
      return encodeFlac(channels, sampleRate);
    case "mp3":
      return encodeMp3(channels, sampleRate);
    case "ogg":
      return encodeOgg(channels, sampleRate);
    case "aac":
      return encodeAac(channels, sampleRate, onProgress);
  }
}

export function containerExtension(format: AudioFormat, data: Uint8Array): string {
  if (
    format === "aac" &&
    data.length > 8 &&
    data[4] === 0x66 &&
    data[5] === 0x74 &&
    data[6] === 0x79 &&
    data[7] === 0x70
  ) {
    return "m4a";
  }
  return format;
}

export function formatMime(format: AudioFormat): string {
  return MIME[format];
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + name.length + file.data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, file.data.length, true);
    view.setUint32(22, file.data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(file.data, 30 + name.length);
    locals.push(local);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, file.data.length, true);
    cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);
    offset += local.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return concat([...locals, ...central, end]);
}

export async function bufferToChannels(buffer: AudioBuffer): Promise<Float32Array[]> {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c).slice());
  return channels;
}

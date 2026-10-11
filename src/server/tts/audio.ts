/** Small audio helpers (no dependencies): MP3 length, WAV read/write, PCM resampling. */

const BR_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BR_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SR: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Length of ID3v2 tag at the start (0 when none). */
export function id3Length(b: Uint8Array): number {
  if (b.length >= 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) return 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f));
  return 0;
}

/** Duration (ms) of an MP3 (MPEG audio layer III), by walking its frames. */
export function mp3DurationMs(b: Uint8Array): number {
  let i = id3Length(b), sec = 0;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) { i++; continue; }
    const sr = SR[ver][sri], br = (ver === 3 ? BR_V1 : BR_V2)[bri] * 1000;
    const len = Math.floor(((ver === 3 ? 144 : 72) * br) / sr) + pad;
    if (len < 4) { i++; continue; }
    sec += (ver === 3 ? 1152 : 576) / sr;
    i += len;
  }
  return Math.round(sec * 1000);
}

/** Joins MP3 pieces (drops the ID3 tags of the pieces after the first). */
export function joinMp3(parts: Uint8Array[]): Uint8Array {
  const clean = parts.map((p, k) => (k === 0 ? p : p.subarray(id3Length(p))));
  const out = new Uint8Array(clean.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of clean) { out.set(p, o); o += p.length; }
  return out;
}

/** 16-bit mono PCM samples from a WAV file (null when it is not a PCM WAV). */
export function parseWav(b: Uint8Array): { rate: number; samples: Int16Array } | null {
  const s = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  if (b.length < 44 || s(0, 4) !== "RIFF" || s(8, 4) !== "WAVE") return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 12, rate = 0, channels = 1, bits = 16;
  while (i + 8 <= b.length) {
    const id = s(i, 4), size = dv.getUint32(i + 4, true);
    if (id === "fmt ") { channels = dv.getUint16(i + 10, true); rate = dv.getUint32(i + 12, true); bits = dv.getUint16(i + 22, true); }
    if (id === "data") {
      if (bits !== 16 || !rate) return null;
      const end = Math.min(b.length, i + 8 + size);
      const n = Math.floor((end - i - 8) / 2 / channels);
      const out = new Int16Array(n);
      for (let k = 0; k < n; k++) out[k] = dv.getInt16(i + 8 + k * 2 * channels, true);
      return { rate, samples: out };
    }
    i += 8 + size + (size & 1);
  }
  return null;
}

/** Raw little-endian 16-bit PCM bytes → samples. */
export function pcm16(b: Uint8Array): Int16Array {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = new Int16Array(Math.floor(b.length / 2));
  for (let k = 0; k < out.length; k++) out[k] = dv.getInt16(k * 2, true);
  return out;
}

/** Linear-interpolation resampling of mono 16-bit samples. */
export function resample(samples: Int16Array, from: number, to: number): Int16Array {
  if (from === to) return samples;
  const n = Math.floor((samples.length * to) / from);
  const out = new Int16Array(n);
  for (let k = 0; k < n; k++) {
    const x = (k * from) / to, j = Math.floor(x), f = x - j;
    const a = samples[j] ?? 0, c = samples[j + 1] ?? a;
    out[k] = Math.round(a + (c - a) * f);
  }
  return out;
}

/** A mono 16-bit PCM WAV file. */
export function wavFile(samples: Int16Array, rate: number): Uint8Array {
  const out = new Uint8Array(44 + samples.length * 2);
  const dv = new DataView(out.buffer);
  const w = (i: number, t: string) => { for (let k = 0; k < t.length; k++) out[i + k] = t.charCodeAt(k); };
  w(0, "RIFF"); dv.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, "data"); dv.setUint32(40, samples.length * 2, true);
  for (let k = 0; k < samples.length; k++) dv.setInt16(44 + k * 2, samples[k], true);
  return out;
}

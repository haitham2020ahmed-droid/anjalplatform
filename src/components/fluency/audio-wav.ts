/**
 * 🎙 What happens to a reading after Stop, on the student's device (pure functions, no browser APIs, so they are
 * tested in Node): the decoded recording is mixed to one channel, resampled to 16 kHz, checked for a voice, a quiet
 * voice is made louder, and it is written as a small WAV (16-bit PCM, about 32 KB a second) — the one audio type
 * every Gemini model accepts. Silence never goes to the AI: the student is told at once to check the microphone.
 */

export const WAV_RATE = 16_000;
/** frames of 20 ms for the voice check */
export const FRAME_MS = 20;
/** quieter than this (about -52 dBFS) is never a voice, whatever the room */
export const VOICE_MIN_RMS = 0.0025;
/** a voice is this many times louder than the room's own noise (≈ +8 dB, the same rule as the live meter) */
export const VOICE_OVER_FLOOR = 2.5;
/** the recording starts with this much room sound (the recorder's pre-roll, before "Read now") */
export const PRE_ROLL_MS = 300;
/** at least this much voice (seconds) before a recording is sent */
export const MIN_VOICE_SECONDS = 0.35;
/** shorter recordings (seconds) are "too short" */
export const MIN_RECORDING_SECONDS = 1;
/** a quiet voice is made louder up to this peak, by at most this gain (×16 ≈ +24 dB) */
export const TARGET_PEAK = 0.89;
export const MAX_GAIN = 16;

/** One channel: the average of the device's channels. */
export function mixToMono(channels: ArrayLike<number>[]): Float32Array {
  if (!channels.length) return new Float32Array(0);
  if (channels.length === 1) return Float32Array.from(channels[0]);
  const n = Math.min(...channels.map((c) => c.length)), out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i] / channels.length;
  return out;
}

/**
 * Resampled to `to` Hz in plain JavaScript (no OfflineAudioContext: older Safari refuses 16 kHz). Going down, each
 * output sample is the average of the input samples it covers (a simple low-pass, no aliasing hiss); going up, linear.
 */
export function resample(samples: Float32Array, from: number, to: number = WAV_RATE): Float32Array {
  if (!samples.length || from <= 0) return new Float32Array(0);
  if (from === to) return Float32Array.from(samples);
  const ratio = from / to, n = Math.max(1, Math.floor(samples.length / ratio)), out = new Float32Array(n);
  if (ratio > 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * ratio), b = Math.min(samples.length, Math.max(a + 1, Math.floor((i + 1) * ratio)));
      let sum = 0; for (let k = a; k < b; k++) sum += samples[k];
      out[i] = sum / (b - a);
    }
  } else {
    for (let i = 0; i < n; i++) {
      const x = i * ratio, a = Math.floor(x), b = Math.min(samples.length - 1, a + 1), f = x - a;
      out[i] = samples[a] * (1 - f) + samples[b] * f;
    }
  }
  return out;
}

export interface VoiceCheck {
  seconds: number; voicedSeconds: number; peak: number; noiseFloor: number; threshold: number;
  /** silent: no voice at all · short: under a second · voice: send it */
  verdict: "silent" | "short" | "voice";
}

/**
 * Is there a voice in the recording? Loudness of every 20 ms frame; the room's noise is the quietest tenth of the
 * frames; a frame is voice when clearly above both the room and an absolute minimum. A soft voice in a quiet room
 * passes (it is made louder later); only silence or a hum with nothing on top is "silent".
 */
export function checkVoice(samples: Float32Array, rate: number): VoiceCheck {
  const seconds = rate > 0 ? samples.length / rate : 0;
  const size = Math.max(1, Math.round((rate * FRAME_MS) / 1000));
  const frames: number[] = [];
  let peak = 0;
  for (let s = 0; s + size <= samples.length; s += size) {
    let sum = 0;
    for (let i = s; i < s + size; i++) { const v = samples[i]; sum += v * v; const a = v < 0 ? -v : v; if (a > peak) peak = a; }
    frames.push(Math.sqrt(sum / size));
  }
  const sorted = [...frames].sort((a, b) => a - b);
  // the room: the quietest tenth of the frames, or the pre-roll (the first ~300 ms, before "Read now") when quieter
  const tenth = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : 0;
  const pre = frames.slice(0, Math.max(1, Math.round(PRE_ROLL_MS / FRAME_MS))).sort((a, b) => a - b);
  const noiseFloor = pre.length >= 5 ? Math.min(tenth, pre[Math.floor(pre.length / 2)]) : tenth;
  // a loud room must not hide a voice: the bar never goes above a normal speaking level
  const threshold = Math.max(VOICE_MIN_RMS, Math.min(noiseFloor * VOICE_OVER_FLOOR, 0.03));
  const voiced = frames.filter((f) => f > threshold).length;
  const voicedSeconds = (voiced * size) / Math.max(1, rate);
  const verdict = seconds < MIN_RECORDING_SECONDS ? "short" : voicedSeconds < MIN_VOICE_SECONDS ? "silent" : "voice";
  return { seconds, voicedSeconds, peak, noiseFloor, threshold, verdict };
}

/** The gain that brings a quiet voice up to a normal level (1 when already loud enough). Ignores a single click. */
export function gainFor(samples: Float32Array): number {
  if (!samples.length) return 1;
  // the 99.9th percentile of the loudness, on a sample of at most 50 000 points (fast on 4 minutes of audio)
  const step = Math.max(1, Math.floor(samples.length / 50_000)), abs: number[] = [];
  for (let i = 0; i < samples.length; i += step) abs.push(Math.abs(samples[i]));
  abs.sort((a, b) => a - b);
  const top = abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.999))];
  if (!(top > 0)) return 1;
  return Math.max(1, Math.min(MAX_GAIN, TARGET_PEAK / top));
}

/** The samples made louder by `gain` (clipped to -1…1). */
export function applyGain(samples: Float32Array, gain: number): Float32Array {
  if (gain === 1) return samples;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = Math.max(-1, Math.min(1, samples[i] * gain));
  return out;
}

/** A 16-bit PCM mono WAV file (44-byte header + 2 bytes a sample). */
export function encodeWav(samples: Float32Array, rate: number = WAV_RATE): Uint8Array {
  const buf = new Uint8Array(44 + samples.length * 2), v = new DataView(buf.buffer);
  const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const x = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return buf;
}

/**
 * Everything after Stop: one channel at 16 kHz, the voice check, a quiet voice made louder, the WAV.
 * `wav` is null when there is no voice (nothing is sent).
 */
export function prepareReading(channels: ArrayLike<number>[], rate: number, opts: { trustVoice?: boolean } = {}): { check: VoiceCheck; gain: number; wav: Uint8Array | null } {
  const mono = resample(mixToMono(channels), rate, WAV_RATE);
  const check = checkVoice(mono, WAV_RATE);
  // `trustVoice`: the live meter heard the student clearly while reading, so a "silent" file check (a device that
  // records very softly) is not believed — the recording is made louder and sent
  if (check.verdict === "short" || (check.verdict === "silent" && !opts.trustVoice)) return { check, gain: 1, wav: null };
  const gain = gainFor(mono);
  return { check, gain, wav: encodeWav(applyGain(mono, gain), WAV_RATE) };
}

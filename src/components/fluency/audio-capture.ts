/**
 * 🎙 Microphone helpers for every student recording (Fluency Coach, Writing & Reading Aloud). Pure functions and a
 * small opener, no React: clear voice settings (echo and noise reduced, steady volume, one channel), the best
 * recording format the browser has (Opus in WebM; MP4/AAC on iPad and iPhone Safari), about 64 kbit/s, and a
 * level check ("We can hear you ✓") before reading.
 */

/** Best first: Opus in WebM (Chrome, Edge, Firefox, Android), then MP4/AAC (iPad / iPhone Safari). */
export const RECORDER_MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"] as const;
export const RECORDER_BITRATE = 64_000;

/** The best supported recording type ("" = the browser's own default). */
export function pickRecorderMime(isSupported: (type: string) => boolean): string {
  for (const t of RECORDER_MIME_TYPES) { try { if (isSupported(t)) return t; } catch { /* old browsers throw */ } }
  return "";
}

/** The browser's own check (false when MediaRecorder is missing). */
export function browserRecorderMime(): string {
  const MR = typeof MediaRecorder !== "undefined" ? MediaRecorder : null;
  return MR && typeof MR.isTypeSupported === "function" ? pickRecorderMime((t) => MR.isTypeSupported(t)) : "";
}

/** The microphone settings, best first; each next one asks for less (some devices refuse exact settings). */
export const MIC_CONSTRAINTS: MediaStreamConstraints[] = [
  { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 48000 } },
  { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
  { audio: true },
];

/**
 * Opens the microphone with the best settings the device accepts. A refusal by the student or the browser
 * (NotAllowedError / SecurityError) is not retried: it is passed on.
 */
export async function openMicrophone(getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>): Promise<MediaStream> {
  let last: unknown = null;
  for (const c of MIC_CONSTRAINTS) {
    try { return await getUserMedia(c); }
    catch (e) {
      const name = (e as { name?: string })?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError" || name === "NotFoundError") throw e;
      last = e;
    }
  }
  throw last ?? new Error("No microphone.");
}

/** MediaRecorder options: the chosen type and about 64 kbit/s. */
export const recorderOptions = (mime: string): MediaRecorderOptions => ({ ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: RECORDER_BITRATE });

/** Loudness (root mean square) of samples in -1…1. */
export function rms(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/** Speech louder than this counts as heard (about -34 dBFS); quieter for the whole check → "too quiet". */
export const HEARD_RMS = 0.02;
export const HEARD_MS = 300;
export const QUIET_AFTER_MS = 4000;

/** The meter's message: still listening, heard (✓), or too quiet (move closer / speak up). */
export function micVerdict(m: { heardMs: number; elapsedMs: number }): "listening" | "heard" | "quiet" {
  if (m.heardMs >= HEARD_MS) return "heard";
  return m.elapsedMs >= QUIET_AFTER_MS ? "quiet" : "listening";
}

/** The meter bar (0–1) for a loudness: speech fills most of it. */
export const meterLevel = (r: number) => Math.max(0, Math.min(1, Math.sqrt(r / 0.15)));

/**
 * 🎚 The live microphone level while a student reads (pure functions, no browser APIs — tested in Node).
 *
 * Built for soft, accented and noisy-room voices:
 *  - the room is measured first: the quietest part of the first ~300 ms (the recorder's pre-roll, before "Read now")
 *    is the room's noise floor;
 *  - a voice is anything clearly above that floor (about +8 dB), with a low absolute minimum (about -44 dBFS: a soft
 *    child's voice with automatic gain) and a cap (a loud room never hides a normal speaking voice);
 *  - the floor keeps following the room afterwards, down quickly and up slowly, and only from frames that are not voice;
 *  - while reading, plain advice: "Speak a little louder", "Move closer", "The room is noisy", "A little further
 *    away" (clipping), "Keep going" (a long stop after reading had started). Pauses are normal: the recording never
 *    stops on silence.
 * The same threshold rule is used after Stop on the whole file (audio-wav.ts), so the live meter and the file check
 * agree; when the meter heard a voice, the student is never told "we couldn't hear you".
 */

/** the room is measured during this first part of the recording (the pre-roll) */
export const CALIBRATE_MS = 300;
/** never a voice below this loudness (≈ -44 dBFS), whatever the room */
export const ABS_MIN_RMS = 0.006;
/** a voice is this many times louder than the room (≈ +8 dB) */
export const FLOOR_FACTOR = 2.5;
/** the threshold never goes above a normal speaking level (a loud room must not hide a voice) */
export const MAX_THRESHOLD_RMS = 0.03;
/** a room whose floor is above this is noisy (≈ -40 dBFS) */
export const NOISY_FLOOR_RMS = 0.01;
/** a heard voice quieter than this (most of the time) → "speak a little louder" */
export const SOFT_VOICE_RMS = 0.035;
/** a sample at or above this is clipping (too close / too loud) */
export const CLIP_PEAK = 0.98;
/** heard voice for this long → "We can hear you ✓" */
export const HEARD_ENOUGH_MS = 300;
/** no voice at all for this long after the start → "Move closer" */
export const NOTHING_YET_MS = 3500;
/** a stop this long after reading had started → "Keep going" */
export const LONG_STOP_MS = 5000;
/** how far back the advice looks (ms) */
export const WINDOW_MS = 2000;

/** The voice threshold for a room's noise floor: above the room, above the absolute minimum, under the cap. */
export function adaptiveThreshold(noiseFloor: number): number {
  const f = Number.isFinite(noiseFloor) && noiseFloor > 0 ? noiseFloor : 0;
  return Math.max(ABS_MIN_RMS, Math.min(f * FLOOR_FACTOR, MAX_THRESHOLD_RMS));
}

/**
 * The room's noise floor from the loudness of the first frames: the median of the quieter half (a student who starts
 * talking at once does not raise it), never above the noisy-room level times two.
 */
export function noiseFloorOf(levels: readonly number[]): number {
  const xs = levels.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const low = xs.slice(0, Math.max(1, Math.ceil(xs.length / 2)));
  return Math.min(low[Math.floor((low.length - 1) / 2)], NOISY_FLOOR_RMS * 2);
}

/**
 * Noise suppression helps in a noisy room but can thin out a soft voice in a quiet one: on when the room is noisy,
 * off when it is quiet (automatic gain stays on, echo cancellation stays off — nothing plays while the student reads).
 */
export const wantsNoiseSuppression = (noiseFloor: number): boolean => noiseFloor >= NOISY_FLOOR_RMS / 2;

export type MicFeedback = "listening" | "ok" | "louder" | "closer" | "noisy" | "too-loud" | "keep-going";
export interface LevelState {
  elapsedMs: number; calibrated: boolean; floor: number; threshold: number;
  /** total time a voice was heard */
  heardMs: number;
  /** time since a voice was last heard (ms; Infinity before any voice) */
  sinceVoiceMs: number;
  /** the recent frames (newest last), for the advice */
  recent: { ms: number; rms: number; peak: number; voice: boolean }[];
  calib: number[];
}

export const newLevelState = (): LevelState => ({ elapsedMs: 0, calibrated: false, floor: 0, threshold: ABS_MIN_RMS, heardMs: 0, sinceVoiceMs: Infinity, recent: [], calib: [] });

/**
 * One meter frame (loudness `rms`, loudest sample `peak`, `dtMs` since the last frame) → the next state. During the
 * first CALIBRATE_MS the room is measured (a loud frame there still counts as voice against the absolute minimum).
 */
export function pushLevel(st: LevelState, rms: number, peak: number, dtMs: number): LevelState {
  const elapsedMs = st.elapsedMs + dtMs;
  let { floor, calibrated } = st;
  const calib = calibrated ? st.calib : [...st.calib, rms];
  if (!calibrated && elapsedMs >= CALIBRATE_MS) { floor = noiseFloorOf(calib); calibrated = true; }
  const threshold = calibrated ? adaptiveThreshold(floor) : Math.max(ABS_MIN_RMS * 2, adaptiveThreshold(noiseFloorOf(calib)));
  const voice = rms >= threshold;
  // the floor follows the room: down at once, up slowly, and only from frames that are not voice
  if (calibrated && !voice) floor = rms < floor ? rms : floor * 0.97 + rms * 0.03;
  const heardMs = st.heardMs + (voice ? dtMs : 0);
  const sinceVoiceMs = voice ? 0 : st.sinceVoiceMs + dtMs;
  const recent = [...st.recent, { ms: dtMs, rms, peak, voice }];
  let span = recent.reduce((a, f) => a + f.ms, 0);
  while (recent.length > 1 && span - recent[0].ms >= WINDOW_MS) { span -= recent[0].ms; recent.shift(); }
  return { elapsedMs, calibrated, floor, threshold: calibrated ? adaptiveThreshold(floor) : threshold, heardMs, sinceVoiceMs, recent, calib };
}

/** The plain advice for the student now (see MicFeedback). */
export function micFeedback(st: LevelState): MicFeedback {
  const r = st.recent;
  if (r.length >= 4 && r.filter((f) => f.peak >= CLIP_PEAK).length / r.length > 0.15) return "too-loud";
  const voiced = r.filter((f) => f.voice);
  if (voiced.length >= 3) {
    const sorted = voiced.map((f) => f.rms).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] < Math.max(SOFT_VOICE_RMS, st.threshold * 1.5) ? "louder" : "ok";
  }
  if (st.heardMs < HEARD_ENOUGH_MS) {
    if (st.elapsedMs < NOTHING_YET_MS) return "listening";
    return st.floor >= NOISY_FLOOR_RMS ? "noisy" : "closer";
  }
  if (st.sinceVoiceMs >= LONG_STOP_MS) return "keep-going";
  return voiced.length ? "ok" : "listening";
}

/** The meter's short verdict (kept for the existing pages): still listening, heard (✓), or too quiet. */
export function levelVerdict(st: LevelState): "listening" | "heard" | "quiet" {
  if (st.heardMs >= HEARD_ENOUGH_MS) return "heard";
  return st.elapsedMs >= NOTHING_YET_MS ? "quiet" : "listening";
}

/** The words shown to the student for each piece of advice (English; the Arabic is in i18n/ar.ts). */
export const FEEDBACK_TEXT: Record<MicFeedback, string> = {
  listening: "Say a few words to test the microphone…",
  ok: "We can hear you ✓",
  louder: "Speak a little louder.",
  closer: "Move closer to the microphone.",
  noisy: "The room is noisy. Move closer and read in a clear voice.",
  "too-loud": "Too loud — hold the device a little further away.",
  "keep-going": "Keep going! Say the next word, or skip it.",
};

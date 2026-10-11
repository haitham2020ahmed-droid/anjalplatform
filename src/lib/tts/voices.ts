/**
 * Picks the most natural American English voice the device offers (free fallback when no pre-generated audio
 * exists). Natural/neural voices first: Microsoft "… Online (Natural)" (Edge), Google US English (Chrome),
 * Apple enhanced/premium voices (Safari, iPad, iPhone). Novelty voices (Zarvox, Bubbles…) are never chosen.
 */
export interface VoiceLike { name: string; lang: string; localService?: boolean; default?: boolean; voiceURI?: string }

const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|ralph|kathy|grandma|grandpa|rocko|shelley|eddy|flo|reed|sandy)\b/i;

export function scoreVoice(v: VoiceLike): number {
  const lang = v.lang.replace("_", "-").toLowerCase();
  if (!lang.startsWith("en")) return -1;
  if (NOVELTY.test(v.name)) return 0;
  let s = lang === "en-us" ? 50 : 10;
  const n = v.name;
  if (/\b(natural|neural)\b/i.test(n)) s += 40; // Microsoft Edge online voices: "Microsoft Ava Online (Natural)"
  if (/\b(aria|jenny|ava|andrew|emma|brian|michelle|guy|ana|christopher|eric|roger|steffan)\b/i.test(n) && /microsoft/i.test(n)) s += 10;
  if (/^google us english$/i.test(n) || /google.*(en-us|us english)/i.test(n)) s += 35; // Chrome's online voice
  if (/\((premium|enhanced)\)/i.test(n)) s += 30; // Apple downloaded high-quality voices
  if (/\b(samantha|ava|allison|susan|zoe|evan|nathan|tom|noelle)\b/i.test(n) && !/microsoft/i.test(n)) s += 12; // Apple US voices
  if (/espeak|robot/i.test(n)) s -= 30;
  if (/\bmicrosoft (david|zira|mark)\b/i.test(n) && !/natural/i.test(n)) s -= 5; // older Windows desktop voices
  return s;
}

/** English voices, best first. */
export function rankVoices<T extends VoiceLike>(voices: readonly T[]): T[] {
  return voices.filter((v) => scoreVoice(v) > 0).sort((a, b) => scoreVoice(b) - scoreVoice(a) || a.name.localeCompare(b.name));
}

/** The chosen voice: the saved one (by name) when still available, else the best-scoring one. */
export function pickBestVoice<T extends VoiceLike>(voices: readonly T[], preferredName?: string | null): T | null {
  if (preferredName) { const p = voices.find((v) => v.name === preferredName); if (p && scoreVoice(p) > 0) return p; }
  return rankVoices(voices)[0] ?? null;
}

/** Browser-speech rates for the two speeds (pre-generated audio uses `AUDIO_RATE`). */
export const SPEECH_RATE = { slow: 0.75, normal: 0.95 } as const;
export const AUDIO_RATE = { slow: 0.8, normal: 1 } as const;
export type ListenSpeed = keyof typeof SPEECH_RATE;

/** Device-side voice pick for code that speaks a single word or sentence. */
export function bestBrowserVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  let saved: string | null = null;
  try { saved = window.localStorage.getItem("listen.voice"); } catch { /* storage blocked */ }
  return pickBestVoice(window.speechSynthesis.getVoices(), saved);
}

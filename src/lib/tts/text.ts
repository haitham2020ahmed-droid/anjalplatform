/**
 * Read-aloud text helpers shared by the browser player and the server (pre-generated audio).
 *
 * The browser and the pre-generation script must turn a passage or a question into EXACTLY the same spoken
 * text, because the audio is looked up by a hash of that text (no ids, no student data). Word timings are
 * stored per word of `speechWords(text)`, so both sides also split words the same way.
 */
import { plainPassage } from "../passage";

/** The text that is spoken: blanks ("____") are read as "blank", spaces collapsed. */
export function normalizeSpeech(raw: string): string {
  return String(raw ?? "").replace(/_{3,}/g, " blank ").replace(/\s+/g, " ").trim();
}

/** What the reading pages speak for a passage or article: its title, then the plain text. */
export const passageSpeech = (title: string, body: string) => normalizeSpeech(`${title}. ${plainPassage(body)}`);

/** What the question pages speak for a question: the question, then each answer choice. */
export const questionSpeech = (stem: string, options: readonly { label: string; text: string }[] = []) =>
  normalizeSpeech([stem, ...options.map((o) => `${o.label}. ${o.text}`)].join(". "));

export interface SpeechWord { text: string; start: number; end: number }

/** The words of a (normalized) text with their character offsets. */
export function speechWords(text: string): SpeechWord[] {
  const out: SpeechWord[] = [];
  for (const m of text.matchAll(/\S+/g)) out.push({ text: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  return out;
}

const SENTENCE_END = /[.!?]["'”’)\]]*$/;

/**
 * Groups words into chunks of whole sentences of at most `maxChars` characters (a sentence longer than that is
 * split between words). Returns [startWord, endWord) ranges. Used to keep provider requests small and, in the
 * browser, to avoid the long-utterance cut-off of some voices.
 */
export function chunkWords(words: readonly SpeechWord[], maxChars: number): [number, number][] {
  const out: [number, number][] = [];
  let a = 0, len = 0, lastEnd = -1;
  for (let i = 0; i < words.length; i++) {
    const w = words[i].text.length + 1;
    if (len + w > maxChars && i > a) {
      const cut = lastEnd >= a ? lastEnd + 1 : i;
      out.push([a, cut]);
      a = cut; len = 0;
      for (let k = a; k < i; k++) len += words[k].text.length + 1;
      lastEnd = -1;
    }
    len += w;
    if (SENTENCE_END.test(words[i].text)) lastEnd = i;
  }
  if (a < words.length) out.push([a, words.length]);
  return out;
}

/**
 * Estimated start time (ms) of each word when a voice gives no timings: proportional to the word length, with
 * extra time for the pause after a comma or a full stop.
 */
export function estimateWordTimes(words: readonly { text: string }[], durationMs: number, offsetMs = 0): number[] {
  if (!words.length) return [];
  const weight: number[] = [];
  let total = 0;
  words.forEach((w, i) => {
    const prev = i > 0 ? words[i - 1].text : "";
    const pause = /[.!?]["'”’)\]]*$/.test(prev) ? 6 : /[,;:—–-]["'”’)\]]*$/.test(prev) ? 3 : 0;
    const x = pause + w.text.replace(/[^\p{L}\p{N}]/gu, "").length + 2;
    weight.push(total + pause); // the word starts after the pause
    total += x;
  });
  return weight.map((w) => Math.round(offsetMs + (w / total) * durationMs));
}

/** Index of the word being spoken at time `ms` (last word whose start ≤ ms), or -1 before the first word. */
export function wordAt(starts: readonly number[], ms: number): number {
  let lo = 0, hi = starts.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= ms) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

/** Index of the word containing (or following) a character offset (speechSynthesis boundary events). */
export function wordAtChar(words: readonly SpeechWord[], charIndex: number): number {
  let ans = 0;
  for (let i = 0; i < words.length; i++) { if (words[i].start <= charIndex) ans = i; else break; }
  return ans;
}

/** SHA-256 (hex) with Web Crypto: the same in the browser (secure pages) and in Node. Null when unavailable. */
export async function sha256Hex(s: string): Promise<string | null> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) return null;
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The lookup key of a spoken text's audio: a hash of the normalized text only (no ids, no names). */
export const speechKey = (text: string) => sha256Hex(`tts1:${normalizeSpeech(text)}`);

export const isSpeechKey = (k: string) => /^[0-9a-f]{64}$/.test(k);

/** Stored word timings. `exact`: from the voice itself (SSML marks); otherwise estimated. */
export interface WordTimings { v: 1; exact: boolean; words: number[] }

/** The two reading speeds of the player (Slow is generated as its own, naturally slower recording when possible). */
export type TtsSpeed = "slow" | "normal";
export const TTS_SPEEDS: readonly TtsSpeed[] = ["normal", "slow"];
export const isTtsSpeed = (s: unknown): s is TtsSpeed => s === "slow" || s === "normal";

/**
 * The cache key (TtsAudio.textHash) of one recording: generated once per text + voice + speed.
 *  - normal: the text's own key (`speechKey`), with the voice stored on the row (audio made before speeds existed
 *    stays valid; a new voice replaces it: pregenerate --replace-voice)
 *  - slow:   a hash of the text key, the voice and the speed
 * Only the text's hash goes in: never an id or anything about a student.
 */
export async function ttsCacheKey(textKey: string, voice: string, speed: TtsSpeed): Promise<string | null> {
  if (speed === "normal") return textKey;
  return sha256Hex(`tts2:${textKey}|${voice}|${speed}`);
}

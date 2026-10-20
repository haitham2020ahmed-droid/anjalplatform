/**
 * Text-to-speech providers for read-aloud audio: pre-generated (scripts/tts/pregenerate.ts) or made once on first
 * listen (on-demand.ts), then cached in TtsAudio per text + voice + speed.
 *
 * Provider-agnostic: each provider turns a spoken text (a passage or a question — never anything about a
 * student) into one audio file plus the start time of every word (`speechWords`), used to highlight words as
 * they are read. Chosen by TTS_PROVIDER; keys come from `ttsEnv()`. Plain `fetch`, no SDKs.
 *
 *   google  Google Cloud Text-to-Speech (v1beta1). Default voice Chirp 3 HD (most natural): word timings are
 *           estimated sentence by sentence. Neural2/WaveNet/Studio voices get EXACT word timings from SSML <mark>
 *           timepoints (marks are not billed). MP3 output.
 *   gemini  Gemini API speech generation (the school's Gemini key, model gemini-2.5-flash-preview-tts, voice Kore).
 *           PCM → 16 kHz WAV; estimated timings. Slow = the same voice asked to read slowly (a natural slow
 *           reading, not a stretched recording).
 */
import { chunkWords, estimateWordTimes, speechWords, type SpeechWord, type TtsSpeed, type WordTimings } from "@/lib/tts/text";
import { joinMp3, mp3DurationMs, parseWav, pcm16, resample, wavFile } from "./audio";
import type { TtsEnv } from "./env";

export type TtsProviderId = "google" | "gemini";
export interface TtsResult { audio: Uint8Array; mime: "audio/mpeg" | "audio/wav"; durationMs: number; timings: WordTimings; requests: number; billedChars: number }
export interface TtsProvider {
  id: TtsProviderId;
  /** voice name as stored with the audio (regenerate when it changes) */
  voice: string;
  synthesize(text: string, opts?: { speed?: TtsSpeed }): Promise<TtsResult>;
}
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;
export interface ProviderOpts { fetchImpl?: FetchLike; timeoutMs?: number }

/** A provider error; `retry` when waiting and trying again may help (rate limit, server busy). */
export class TtsError extends Error {
  constructor(message: string, readonly retry = false) { super(message); }
}

const b64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const rateOf = (env: TtsEnv) => { const r = Number(env.TTS_SPEAKING_RATE); return r >= 0.25 && r <= 2 ? r : 0.95; };
/** Slow audio: this share of the normal speaking rate (Google). */
export const SLOW_FACTOR = 0.8;

async function post(f: FetchLike, url: string, headers: Record<string, string>, body: unknown, timeoutMs: number, who: string): Promise<Record<string, unknown>> {
  let res;
  try {
    res = await f(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) { throw new TtsError(`${who}: no answer (${(e as Error).message})`, true); }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new TtsError(`${who}: HTTP ${res.status} ${detail}`, res.status === 429 || res.status >= 500);
  }
  return (await res.json()) as Record<string, unknown>;
}

/** SSML for Google voices: a <mark> before every word, named by its index in the whole text. */
export function ssmlWithMarks(words: readonly SpeechWord[], from: number, to: number): string {
  const parts: string[] = [];
  for (let i = from; i < to; i++) parts.push(`<mark name="${i}"/>${xml(words[i].text)}`);
  return `<speak>${parts.join(" ")}</speak>`;
}

/** Google voices whose SSML ignores <mark> (no timepoints): Chirp 3 HD and Journey. */
export const googleVoiceHasMarks = (voice: string) => !/chirp|journey/i.test(voice);

/** Most natural (Chirp 3 HD). Neural2 voices (e.g. en-US-Neural2-F) give exact word timings instead. */
export const DEFAULT_GOOGLE_VOICE = "en-US-Chirp3-HD-Leda";

export function googleProvider(env: TtsEnv, o: ProviderOpts = {}): TtsProvider {
  const key = env.GOOGLE_TTS_API_KEY ?? "";
  const voice = env.GOOGLE_TTS_VOICE?.trim() || DEFAULT_GOOGLE_VOICE;
  const f = o.fetchImpl ?? (fetch as unknown as FetchLike);
  const marks = googleVoiceHasMarks(voice);
  return {
    id: "google",
    voice,
    async synthesize(text, so) {
      const words = speechWords(text);
      const rate = Math.max(0.25, Math.round(rateOf(env) * (so?.speed === "slow" ? SLOW_FACTOR : 1) * 100) / 100);
      const parts: Uint8Array[] = [];
      const starts: number[] = [];
      let offset = 0, billed = 0, exact = marks;
      // with marks: big requests (exact timings anyway); without: about one sentence per request, so the
      // estimated word timings restart at every sentence and never drift far
      for (const [a, b] of chunkWords(words, marks ? 1200 : 300)) {
        const plain = words.slice(a, b).map((w) => w.text).join(" ");
        const input = marks ? { ssml: ssmlWithMarks(words, a, b) } : { text: plain };
        billed += marks ? xml(plain).length + 15 : plain.length; // <mark> tags are not billed
        const r = await post(f, "https://texttospeech.googleapis.com/v1beta1/text:synthesize", { "x-goog-api-key": key }, {
          input,
          voice: { languageCode: "en-US", name: voice },
          audioConfig: { audioEncoding: "MP3", speakingRate: rate },
          ...(marks ? { enableTimePointing: ["SSML_MARK"] } : {}),
        }, o.timeoutMs ?? 60_000, "Google Text-to-Speech");
        if (typeof r.audioContent !== "string" || !r.audioContent) throw new TtsError("Google Text-to-Speech: no audio in the answer.");
        const mp3 = b64(r.audioContent);
        const dur = mp3DurationMs(mp3);
        const tp = new Map<number, number>();
        for (const t of (Array.isArray(r.timepoints) ? r.timepoints : []) as { markName?: string; timeSeconds?: number }[]) {
          const i = Number(t.markName);
          if (Number.isInteger(i) && i >= a && i < b && typeof t.timeSeconds === "number") tp.set(i, Math.round(offset + t.timeSeconds * 1000));
        }
        const est = estimateWordTimes(words.slice(a, b), dur, offset);
        if (!marks || tp.size < (b - a) * 0.8) { exact = false; starts.push(...est); }
        else for (let i = a; i < b; i++) starts.push(tp.get(i) ?? est[i - a]);
        parts.push(mp3);
        offset += dur;
      }
      return { audio: joinMp3(parts), mime: "audio/mpeg", durationMs: offset, timings: { v: 1, exact: exact && words.length > 0, words: starts }, requests: parts.length, billedChars: billed };
    },
  };
}

const GEMINI_RATE = 16_000; // stored sample rate: speech stays clear at 16 kHz, files are a third smaller than 24 kHz

export const DEFAULT_GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";
/** Warm, clear and natural for young readers (Puck is a livelier alternative). */
export const DEFAULT_GEMINI_VOICE = "Kore";
export const DEFAULT_GEMINI_STYLE = "Read aloud in a warm, clear American English voice, at a natural, steady pace for young students";
export const GEMINI_SLOW_STYLE = "Read aloud slowly and clearly, word by word but still natural, with a short pause after each sentence, in a warm American English voice for young students learning English";

/** The instruction for a speed: Slow always asks for a slow reading (even when the school's own style is empty). */
export function geminiStyle(env: TtsEnv, speed: TtsSpeed = "normal"): string {
  if (speed === "slow") return env.GEMINI_TTS_STYLE?.trim() ? `${env.GEMINI_TTS_STYLE.trim()}. Read slowly, with clear pauses between sentences` : GEMINI_SLOW_STYLE;
  return env.GEMINI_TTS_STYLE ?? DEFAULT_GEMINI_STYLE;
}

/** The generateContent body for one piece of text (the text only: never a name or an id). */
export function geminiTtsBody(text: string, voiceName: string, style: string): Record<string, unknown> {
  return {
    contents: [{ parts: [{ text: style ? `${style}:\n${text}` : text }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
  };
}

export function geminiProvider(env: TtsEnv, o: ProviderOpts = {}): TtsProvider {
  const key = env.GEMINI_API_KEY ?? "";
  const model = env.GEMINI_TTS_MODEL?.trim() || DEFAULT_GEMINI_TTS_MODEL;
  const voiceName = env.GEMINI_TTS_VOICE?.trim() || DEFAULT_GEMINI_VOICE;
  const f = o.fetchImpl ?? (fetch as unknown as FetchLike);
  return {
    id: "gemini",
    // 🐛 fix (audit finding, Oct 2026): the ":t3" tag (word-timing schema 3 — see the 150-char chunking above; was
    // ":t2" at 300 chars) makes this look like a different voice from any audio already cached under an older,
    // larger-chunk timing schema, so `scripts/tts/pregenerate.ts --replace-voice --apply` (see its header) finds
    // and regenerates every passage and question that was already played before this fix, picking up the
    // tighter-synced timings. Cached audio is looked up by voice+text (store.ts), so without this tag
    // already-generated audio would keep its old, more drifted timings forever — this fix would only ever apply to
    // text nobody had listened to yet. Bump the "t" number again if the chunking or estimate formula changes again.
    voice: `${model}:${voiceName}:t3`,
    async synthesize(text, so) {
      const style = geminiStyle(env, so?.speed ?? "normal");
      const words = speechWords(text);
      const pcm: Int16Array[] = [];
      const starts: number[] = [];
      let offset = 0, billed = 0, requests = 0;
      // 🐛 fix (audit finding, Oct 2026): Gemini never returns real per-word timestamps, so the highlighted word is
      // always a linear estimate (character count ÷ audio duration) — see estimateWordTimes above. Gemini's
      // expressive, non-uniform pacing (pauses, emphasis, slow-reading style) makes that estimate drift further
      // from the real audio the longer a single chunk runs uninterrupted, so the highlight visibly falls behind the
      // voice on a long passage. Each chunk boundary re-anchors the estimate to where the audio for that chunk
      // actually started, so a SMALLER chunk resets the drift more often and keeps it from accumulating across a
      // whole passage. A real fix would need Gemini to return real per-word timestamps, which it doesn't offer
      // today (only Google Cloud TTS's Neural2/WaveNet/Studio voices do, via SSML <mark>s — see googleProvider
      // above); this bounds the symptom as far as it can go while staying on Gemini's own voice.
      // 150 (pushed down from an initial, more conservative 300 — ~one elementary sentence at a time for this
      // platform's grade 4-6 passages, per chunkWords' own "a sentence longer than this is split between words"
      // rule: most of these sentences stay under 150 chars, so a chunk still ends on a real sentence break instead
      // of a mid-sentence word boundary, which would otherwise sound like an audible stumble where Gemini's two
      // halves of one sentence get stitched together) is about as tight as this estimate-only approach can go
      // without risking that. Audio is cached per text+voice+speed, so the extra Gemini requests this costs happen
      // once per passage/question (more chunks per passage = more requests, but only the first time it's heard),
      // not once per student play.
      for (const [a, b] of chunkWords(words, 150)) {
        const plain = words.slice(a, b).map((w) => w.text).join(" ");
        billed += plain.length;
        const r = await post(f, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": key }, geminiTtsBody(plain, voiceName, style), o.timeoutMs ?? 120_000, "Gemini speech");
        requests++;
        const cand = (r.candidates as { content?: { parts?: Record<string, unknown>[] } }[] | undefined)?.[0];
        const part = cand?.content?.parts?.find((p) => p.inlineData || p.inline_data);
        const data = (part?.inlineData ?? part?.inline_data) as { mimeType?: string; mime_type?: string; data?: string } | undefined;
        if (!data?.data) throw new TtsError("Gemini speech: no audio in the answer.");
        const mime = String(data.mimeType ?? data.mime_type ?? "");
        const bytes = b64(data.data);
        let samples: Int16Array, rate: number;
        if (/wav/i.test(mime)) { const w = parseWav(bytes); if (!w) throw new TtsError("Gemini speech: unreadable WAV audio."); samples = w.samples; rate = w.rate; }
        else { samples = pcm16(bytes); rate = Number(/rate=(\d+)/.exec(mime)?.[1]) || 24_000; }
        const out = resample(samples, rate, GEMINI_RATE);
        const dur = Math.round((out.length / GEMINI_RATE) * 1000);
        starts.push(...estimateWordTimes(words.slice(a, b), dur, offset));
        pcm.push(out);
        offset += dur;
      }
      const all = new Int16Array(pcm.reduce((n, p) => n + p.length, 0));
      let k = 0;
      for (const p of pcm) { all.set(p, k); k += p.length; }
      return { audio: wavFile(all, GEMINI_RATE), mime: "audio/wav", durationMs: offset, timings: { v: 1, exact: false, words: starts }, requests, billedChars: billed };
    },
  };
}

export type PickedTts = { ok: true; provider: TtsProvider } | { ok: false; reason: string };

/** The provider chosen by TTS_PROVIDER (none → the browser's own voice is used). */
export function pickTtsProvider(env: TtsEnv, o: ProviderOpts = {}): PickedTts {
  const p = (env.TTS_PROVIDER ?? "").trim().toLowerCase();
  if (!p || p === "none" || p === "browser") return { ok: false, reason: "TTS_PROVIDER is not set (google or gemini): students hear their device's best voice." };
  if (p === "google") return env.GOOGLE_TTS_API_KEY ? { ok: true, provider: googleProvider(env, o) } : { ok: false, reason: "Set GOOGLE_TTS_API_KEY for TTS_PROVIDER=google." };
  if (p === "gemini") return env.GEMINI_API_KEY ? { ok: true, provider: geminiProvider(env, o) } : { ok: false, reason: "Set GEMINI_API_KEY for TTS_PROVIDER=gemini." };
  return { ok: false, reason: `Unknown TTS_PROVIDER "${p}" (use google or gemini).` };
}

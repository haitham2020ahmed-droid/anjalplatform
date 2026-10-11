/**
 * 🔊 Natural read-aloud audio made the FIRST time a text is listened to (when it was not pre-generated), then cached
 * in TtsAudio, so every text is generated once per voice and speed and every later listener gets it at once.
 *
 *  - Only the spoken text goes to the provider (never a name, an id or an answer); nothing about who asked is stored.
 *  - Small and gentle: at most `perMinute` new audio files a minute for the whole server (default 3, under the AI
 *    limit of about 4 a minute), one at a time (memory: 512 MB server), texts up to MAX_ON_DEMAND_CHARS.
 *    Two listeners of the same text share one request.
 *  - Busy, switched off or an error → the player keeps the device's own voice (nothing breaks).
 */
import type { Repo } from "../seeding/repo";
import { normalizeSpeech, speechKey, type TtsSpeed } from "@/lib/tts/text";
import type { TtsEnv } from "./env";
import { pickTtsProvider, TtsError, type ProviderOpts, type TtsProvider } from "./providers";
import { audioKeyFor, findAudioMeta, saveAudio, type AudioMeta } from "./store";

export const MAX_ON_DEMAND_CHARS = 3000;
const MAX_BYTES = 15_000_000;

export type OnDemandResult =
  | { status: "OK"; key: string; meta: AudioMeta; made: boolean }
  | { status: "BUSY" | "OFF" | "TOO_LONG" | "ERROR"; reason: string };

export interface OnDemandOptions extends ProviderOpts {
  perMinute?: number;
  /** for tests: a ready provider */
  provider?: TtsProvider | null;
  now?: () => number;
}

/** A generator with its own small limiter (one per server; tests make their own). */
export function createOnDemandTts(o: OnDemandOptions = {}) {
  const now = o.now ?? (() => Date.now());
  const recent: number[] = [];
  const inflight = new Map<string, Promise<OnDemandResult>>();
  let running = 0;

  return async function speak(repo: Repo, env: TtsEnv, rawText: string, speed: TtsSpeed): Promise<OnDemandResult> {
    if ((env.TTS_ON_DEMAND ?? "").trim().toLowerCase() === "off") return { status: "OFF", reason: "Audio is made ahead of time only (TTS_ON_DEMAND=off)." };
    const text = normalizeSpeech(rawText);
    if (!text) return { status: "ERROR", reason: "Nothing to read." };
    if (text.length > MAX_ON_DEMAND_CHARS) return { status: "TOO_LONG", reason: "Long texts are prepared ahead of time (scripts/tts/pregenerate.ts)." };
    const picked = o.provider !== undefined ? (o.provider ? { ok: true as const, provider: o.provider } : { ok: false as const, reason: "No provider." }) : pickTtsProvider(env, o);
    if (!picked.ok) return { status: "OFF", reason: picked.reason };
    const provider = picked.provider;
    const textKey = await speechKey(text);
    const key = textKey ? await audioKeyFor(textKey, provider, speed) : null;
    if (!textKey || !key) return { status: "ERROR", reason: "No secure hashing on this server." };
    const have = await findAudioMeta(repo, key);
    if (have) return { status: "OK", key, meta: have, made: false };
    const same = inflight.get(key);
    if (same) return same;

    const perMinute = Math.max(1, o.perMinute ?? (Number(env.TTS_ON_DEMAND_PER_MINUTE) || 3));
    const t = now();
    while (recent.length && t - recent[0] >= 60_000) recent.shift();
    if (running > 0 || recent.length >= perMinute) return { status: "BUSY", reason: "The voice is busy. Your device's voice reads this time." };
    recent.push(t);
    running++;
    const job = (async (): Promise<OnDemandResult> => {
      try {
        const r = await provider.synthesize(text, { speed });
        if (r.audio.length > MAX_BYTES) return { status: "TOO_LONG", reason: "The audio is too large." };
        await saveAudio(repo, { key, provider, result: r, chars: text.length, source: `on-demand:${speed}`, now: new Date(now()) });
        const meta = await findAudioMeta(repo, key);
        return meta ? { status: "OK", key, meta, made: true } : { status: "ERROR", reason: "The audio was not saved." };
      } catch (e) {
        const err = e instanceof TtsError ? e : new TtsError((e as Error).message);
        return err.retry ? { status: "BUSY", reason: "The voice is busy. Try again in a minute." } : { status: "ERROR", reason: err.message.slice(0, 200) };
      } finally { running--; inflight.delete(key); }
    })();
    inflight.set(key, job);
    return job;
  };
}

/** The server's generator. */
export const onDemandTts = createOnDemandTts();

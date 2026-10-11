/**
 * Pre-generates read-aloud audio for the platform's TEXTS: question-bank passages, published questions (question
 * + answer choices), published ReadMaster article versions and (opt-in, `readrise`) every level version of the
 * published ReadRise articles — the same text the ReadRise reader's player asks for (title + body). Only the text that the reading pages speak is sent
 * to the provider — never a student name, id or answer.
 *
 * Dry run by default (counts texts and characters, estimates the cost). With `apply`: one text at a time, rate
 * limited, retried on "busy"; already generated texts are skipped, so a stopped run simply continues next time
 * (resumable). Reads 200 rows per page and keeps one audio file in memory at a time (512 MB server).
 * Small batches for the AI limit (~4 requests a minute): Gemini runs at 4 requests a minute by default (`rpm`),
 * `limit` new files per run, and `from` ("readrise:400") starts where an earlier run stopped. `speeds`: also the
 * naturally slow recording (["normal", "slow"]; default normal only — the player slows it down otherwise).
 */
import type { Repo, Row, Where } from "../seeding/repo";
import { passageSpeech, questionSpeech, speechKey, ttsCacheKey, type TtsSpeed } from "@/lib/tts/text";
import { existingVoices, saveAudio } from "./store";
import { pickTtsProvider, TtsError, type ProviderOpts, type TtsProvider } from "./providers";
import type { TtsEnv } from "./env";

export type TtsSource = "passages" | "questions" | "readmaster" | "readrise";
/** The default sources. ReadRise (many long texts: one per article per level) is opt-in: `only: ["readrise"]` / --readrise. */
export const TTS_SOURCES: TtsSource[] = ["passages", "questions", "readmaster"];
export const ALL_TTS_SOURCES: TtsSource[] = [...TTS_SOURCES, "readrise"];
const OPTION_TYPES = new Set(["MULTIPLE_CHOICE", "DROPDOWN", "MULTI_SELECT"]);
const MAX_BYTES = 15_000_000; // MEDIUMBLOB holds 16 MB

export interface PregenOptions extends ProviderOpts {
  apply?: boolean;
  only?: TtsSource[];
  /** at most this many new audio files in this run (default 500) */
  limit?: number;
  /** provider requests per minute (default TTS_REQUESTS_PER_MINUTE, else 4 for Gemini and 30 for Google) */
  rpm?: number;
  /** which recordings to make for each text (default ["normal"]) */
  speeds?: TtsSpeed[];
  /** resume: start at this source and row offset ("readrise:400"), as printed by an earlier run */
  from?: string;
  /** also regenerate texts made with another voice */
  replaceVoice?: boolean;
  pageSize?: number;
  log?: (s: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** for tests: a ready provider instead of the one from the environment */
  provider?: TtsProvider;
}
export interface PregenSummary { apply: boolean; provider: string | null; texts: number; chars: number; done: number; missing: number; missingChars: number; generated: number; failed: number; stopped: string | null; estimate: Record<string, string>; resume: string | null }

/** "readrise:400" → where to start (null when not valid). */
export function parseFrom(from: string | undefined): { source: TtsSource; skip: number } | null {
  const m = /^([a-z]+):(\d+)$/.exec(String(from ?? "").trim());
  return m && (ALL_TTS_SOURCES as string[]).includes(m[1]) ? { source: m[1] as TtsSource, skip: Number(m[2]) } : null;
}

interface SpeechText { key: string; text: string; source: string }

/** Approximate list prices (USD per 1M characters, Oct 2026) for the dry-run estimate. See OPTIONS / docs/READ_ALOUD.md. */
export const PRICE_PER_M = { "google-neural2": 16, "google-chirp3-hd": 30, "gemini-flash-tts": 17 } as const;
const FREE_PER_MONTH = { "google-neural2": 1_000_000, "google-chirp3-hd": 1_000_000, "gemini-flash-tts": 0 } as const;

export function estimateCost(chars: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, p] of Object.entries(PRICE_PER_M)) {
    const billable = Math.max(0, chars - FREE_PER_MONTH[k as keyof typeof FREE_PER_MONTH]);
    out[k] = `$${((billable / 1_000_000) * p).toFixed(2)}`;
  }
  return out;
}

const str = (v: unknown) => (v == null ? "" : String(v));

/** One page of texts of a source (null when the source has no more rows). */
async function page(repo: Repo, source: TtsSource, skip: number, take: number): Promise<SpeechText[] | null> {
  const order = { orderBy: [{ field: "id" }], skip, take };
  const make = async (text: string, src: string): Promise<SpeechText | null> => {
    if (!text) return null;
    const key = await speechKey(text);
    return key ? { key, text, source: src } : null;
  };
  const done = (xs: (SpeechText | null)[]) => xs.filter((x): x is SpeechText => Boolean(x));
  if (source === "passages") {
    const rows = await repo.findMany("ReadingPassage", { status: "PUBLISHED", deletedAt: null }, { select: ["id", "title", "body"], ...order });
    if (!rows.length) return null;
    return done(await Promise.all(rows.map((r) => make(passageSpeech(str(r.title), str(r.body)), `passage:${str(r.id)}`))));
  }
  if (source === "questions") {
    const rows = await repo.findMany("Question", { status: "PUBLISHED", deletedAt: null } as Where, { select: ["id", "stem", "typeId"], ...order });
    if (!rows.length) return null;
    const types = new Map((await repo.findMany("QuestionType", {}, { select: ["id", "code"] })).map((t) => [str(t.id), str(t.code)]));
    const withOptions = rows.filter((r) => OPTION_TYPES.has(types.get(str(r.typeId)) ?? "")).map((r) => str(r.id));
    const opts: Row[] = withOptions.length ? await repo.findMany("QuestionOption", { questionId: { in: withOptions } }, { select: ["questionId", "label", "text", "order"] }) : [];
    const byQ = new Map<string, Row[]>();
    for (const o of opts) { const k = str(o.questionId); byQ.set(k, [...(byQ.get(k) ?? []), o]); }
    return done(await Promise.all(rows.map((r) => {
      const os = (byQ.get(str(r.id)) ?? []).sort((a, b) => Number(a.order) - Number(b.order)).map((o) => ({ label: str(o.label), text: str(o.text) }));
      return make(questionSpeech(str(r.stem), os), `question:${str(r.id)}`);
    })));
  }
  if (source === "readrise") {
    // one page of published, not deleted articles (the platform library and the school's own), all their level versions
    const rr = await repo.findMany("RRArticle", { status: "PUBLISHED", deletedAt: null }, { select: ["id", "title"], ...order });
    if (!rr.length) return null;
    const rrTitle = new Map(rr.map((a) => [str(a.id), str(a.title)]));
    const rv = await repo.findMany("RRVersion", { articleId: { in: [...rrTitle.keys()] } }, { select: ["id", "articleId", "title", "body"] });
    return done(await Promise.all(rv.map((v) => make(passageSpeech(str(v.title) || (rrTitle.get(str(v.articleId)) ?? ""), str(v.body)), `readrise:${str(v.id)}`))));
  }
  const arts = await repo.findMany("ReadMasterArticle", { status: "PUBLISHED" }, { select: ["id", "title"], ...order });
  if (!arts.length) return null;
  const title = new Map(arts.map((a) => [str(a.id), str(a.title)]));
  const vers = await repo.findMany("ReadMasterVersion", { articleId: { in: [...title.keys()] } }, { select: ["id", "articleId", "body"] });
  return done(await Promise.all(vers.map((v) => make(passageSpeech(title.get(str(v.articleId)) ?? "", str(v.body)), `readmaster:${str(v.id)}`))));
}

export async function pregenerate(repo: Repo, env: TtsEnv, o: PregenOptions = {}): Promise<PregenSummary> {
  const log = o.log ?? ((s: string) => console.log(s));
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now ?? (() => new Date());
  const take = o.pageSize ?? 200;
  const limit = Math.max(1, o.limit ?? 500);
  const picked = o.provider ? { ok: true as const, provider: o.provider } : pickTtsProvider(env, o);
  const provider = picked.ok ? picked.provider : null;
  const rpm = Math.max(1, o.rpm ?? (Number(env.TTS_REQUESTS_PER_MINUTE) || (provider?.id === "gemini" ? 4 : 30)));
  const speeds: TtsSpeed[] = o.speeds?.length ? [...new Set(o.speeds)] : ["normal"];
  const sum: PregenSummary = { apply: Boolean(o.apply), provider: provider ? `${provider.id} (${provider.voice})` : null, texts: 0, chars: 0, done: 0, missing: 0, missingChars: 0, generated: 0, failed: 0, stopped: null, estimate: {}, resume: null };
  const sources = o.only?.length ? o.only : TTS_SOURCES;
  const start = parseFrom(o.from);
  const startAt = start && sources.includes(start.source) ? start : null;
  if (o.apply && !provider) { sum.stopped = (picked as { reason: string }).reason; log(`Cannot generate audio: ${sum.stopped}`); }
  const seen = new Set<string>();
  let lastCall = 0;
  for (const source of startAt ? sources.slice(sources.indexOf(startAt.source)) : sources) {
    let n = 0, chars = 0;
    for (let skip = startAt?.source === source ? startAt.skip : 0; ; skip += take) {
      const texts = await page(repo, source, skip, take);
      if (!texts) break;
      const fresh = texts.filter((t) => !seen.has(t.key) && (seen.add(t.key), true));
      // one job per text and speed: normal audio under the text's key, slow audio under text + voice + speed
      const jobs: (SpeechText & { speed: TtsSpeed; textKey: string })[] = [];
      for (const t of fresh) for (const sp of speeds) {
        const key = sp === "normal" ? t.key : provider ? await ttsCacheKey(t.key, provider.voice, sp) : null;
        if (key) jobs.push({ ...t, key, speed: sp, textKey: t.key });
      }
      const have = await existingVoices(repo, jobs.map((t) => t.key));
      for (const t of jobs) {
        if (t.speed === "normal") { n++; chars += t.text.length; sum.texts++; sum.chars += t.text.length; }
        const voice = have.get(t.key);
        const current = voice !== undefined && (!o.replaceVoice || !provider || voice === provider.voice);
        if (current) { if (t.speed === "normal") sum.done++; continue; }
        sum.missing++; sum.missingChars += t.text.length;
        if (!o.apply || !provider) continue;
        if (sum.stopped || sum.generated + sum.failed >= limit) { sum.resume ??= `${source}:${skip}`; continue; }
        // rate limit: at most `rpm` provider requests per minute
        const gap = 60_000 / rpm, wait = lastCall + gap - Date.now();
        if (wait > 0) await sleep(wait);
        let ok = false;
        for (let tries = 0; tries < 4 && !ok; tries++) {
          try {
            const r = await provider.synthesize(t.text, { speed: t.speed });
            lastCall = Date.now() + gap * (r.requests - 1);
            if (r.audio.length > MAX_BYTES) { log(`  skipped ${t.source}: audio too large (${r.audio.length} bytes)`); sum.failed++; break; }
            await saveAudio(repo, { key: t.key, provider, result: r, chars: t.text.length, source: t.speed === "slow" ? `${t.source}:slow` : t.source, now: now(), replace: voice !== undefined });
            sum.generated++; ok = true;
            if (sum.generated % 25 === 0) log(`  ${sum.generated} audio files made…`);
          } catch (e) {
            const err = e instanceof TtsError ? e : new TtsError((e as Error).message);
            if (!err.retry) {
              log(`  failed ${t.source}: ${err.message}`);
              sum.failed++;
              if (/HTTP (400|401|403)\b/.test(err.message) && /key|permission|denied|unauth|billing/i.test(err.message)) sum.stopped = err.message;
              break;
            }
            if (tries === 3) { log(`  gave up on ${t.source}: ${err.message}`); sum.failed++; break; }
            log(`  provider busy (${err.message.slice(0, 80)}); waiting a minute…`);
            await sleep(60_000);
          }
        }
        if (sum.stopped) log(`Stopped: ${sum.stopped}`);
      }
    }
    log(`${source}: ${n} texts, ${chars.toLocaleString("en-US")} characters`);
  }
  sum.estimate = estimateCost(sum.missingChars);
  log(`total: ${sum.texts} texts (${sum.chars.toLocaleString("en-US")} characters); with audio ${sum.done}; without ${sum.missing} (${sum.missingChars.toLocaleString("en-US")} characters)`);
  log(`estimated one-time cost for the missing audio (after the monthly free characters): ${Object.entries(sum.estimate).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  if (!o.apply) log(`dry run: nothing was generated. Add --apply${provider ? "" : ` (and set the provider: ${(picked as { reason: string }).reason})`}.`);
  else log(`generated ${sum.generated}, failed ${sum.failed}${sum.generated + sum.failed >= limit ? ` (limit ${limit} reached: run again to continue${sum.resume ? `, or skip the finished rows with --from=${sum.resume}` : ""})` : ""}.`);
  return sum;
}

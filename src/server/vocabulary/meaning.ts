/**
 * 📖 A meaning for every word (Update 42C): the bounded word cache, request dedupe, the AI fallback (one word +
 * its sentence only — never a student's name, id or answers), the batch AI used by the admin button and the prefill
 * script, and the missing-word requests (word, how often, the last sentence) shown on the admin dictionary page.
 *
 * AI meanings are saved once per school as WordEntry rows with source "AI" (shown to students at once; marked
 * “AI · check” for teachers, who can correct them like any other definition).
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { consumeRateLimit } from "../auth/rate-limit";
import { audit } from "../audit";
import { aiSettings, callJson, pickProvider, type AiSettings, type EnvLike, type Picked, type Validator } from "../ai/engine";
import { anthropicProvider, geminiProvider } from "../ai/question-generator";
import { lemmaCandidates, lemmaTiers, normalizeWord } from "./lemma";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;

// ------------------------------------------------------------------ bounded LRU (one per database)

export const WORD_CACHE_MAX = 5000;

/** A small least-recently-used map: a Map keeps insertion order, so the first key is the oldest. */
export class Lru<V> {
  private m = new Map<string, V>();
  constructor(readonly max: number) {}
  get(k: string): V | undefined { const v = this.m.get(k); if (v !== undefined) { this.m.delete(k); this.m.set(k, v); } return v; }
  set(k: string, v: V): void { this.m.delete(k); this.m.set(k, v); while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string); }
  delete(k: string): void { this.m.delete(k); }
  deletePrefix(p: string): void { for (const k of [...this.m.keys()]) if (k.startsWith(p)) this.m.delete(k); }
  get size(): number { return this.m.size; }
}

const caches = new WeakMap<object, Lru<unknown>>();
/** The word cache of this database (tests use many databases; production uses one). */
export function wordCache<V>(repo: Repo): Lru<V> {
  let c = caches.get(repo); if (!c) { c = new Lru<unknown>(WORD_CACHE_MAX); caches.set(repo, c); }
  return c as Lru<V>;
}
export const cacheKey = (schoolId: string, word: string) => `${schoolId}\u0000${word}`;
/** After a teacher / admin / AI changes the school's dictionary. */
export function forgetSchoolWords(repo: Repo, schoolId: string | null | undefined): void { if (schoolId) caches.get(repo)?.deletePrefix(`${schoolId}\u0000`); }

const flights = new WeakMap<object, Map<string, Promise<unknown>>>();
/** Runs fn once for concurrent callers with the same key (the second tap waits for the first lookup). */
export function once<T>(repo: Repo, key: string, fn: () => Promise<T>): Promise<T> {
  let m = flights.get(repo); if (!m) { m = new Map(); flights.set(repo, m); }
  const have = m.get(key); if (have) return have as Promise<T>;
  const p = fn().finally(() => m!.delete(key));
  m.set(key, p);
  return p;
}

// ------------------------------------------------------------------ AI: prompt, checks, saving

export const PARTS_OF_SPEECH = ["noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "interjection", "determiner", "proper noun", "phrase"];
export interface AiWord { word: string; baseWord: string; partOfSpeech: string; definition: string; example: string | null; arabicGloss: string | null }
export interface WordAiOptions { env?: EnvLike; fetchImpl?: typeof fetch; timeoutMs?: number }

const SYSTEM = [
  "You write a children's dictionary for Grade 4-6 students learning English (their first language is Arabic).",
  "For each word, use its sentence to choose the right meaning. Give the dictionary form as baseWord (stopped → stop, children → child, went → go).",
  "definition: a kid-friendly English definition of baseWord as used in the sentence, at most 15 words, CEFR A2 words, no Arabic, without repeating the word.",
  "partOfSpeech: one of " + PARTS_OF_SPEECH.join(", ") + ".",
  "example: one new simple sentence (at most 12 words) that uses the word.",
  "arabicGloss: the Arabic meaning in one to three Arabic words.",
  'Reply with JSON only: {"results":[{"word":"…","baseWord":"…","partOfSpeech":"…","definition":"…","example":"…","arabicGloss":"…"}]} — one result for every word.',
].join(" ");

/** The request: only the words and their passage sentences (no student data). */
export function wordPrompt(items: { word: string; sentence: string | null }[]): { system: string; user: { task: string; words: { word: string; sentence: string }[] } } {
  return { system: SYSTEM, user: { task: "Define these words", words: items.map((i) => ({ word: i.word, sentence: s(i.sentence).slice(0, 300) })) } };
}

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
function checkOne(raw: unknown, asked: string): { ok: true; value: AiWord } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const def = s(r.definition).replace(/\s+/g, " ").trim();
  if (def.length < 3) return { ok: false, error: `${asked}: the definition is empty` };
  if (words(def) > 15) return { ok: false, error: `${asked}: the definition must be 15 words or fewer` };
  if (/[؀-ۿ]/.test(def)) return { ok: false, error: `${asked}: the definition must be in English` };
  const pos = s(r.partOfSpeech).toLowerCase().trim();
  if (!PARTS_OF_SPEECH.includes(pos)) return { ok: false, error: `${asked}: partOfSpeech must be one of ${PARTS_OF_SPEECH.join(", ")}` };
  const cands = lemmaCandidates(asked);
  const base = normalizeWord(s(r.baseWord));
  const ex = s(r.example).replace(/\s+/g, " ").trim();
  const gloss = s(r.arabicGloss).replace(/\s+/g, " ").trim();
  return { ok: true, value: { word: asked, baseWord: base && cands.includes(base) ? base : asked, partOfSpeech: pos, definition: def.slice(0, 200), example: ex && words(ex) <= 20 && !/[؀-ۿ]/.test(ex) ? ex.slice(0, 300) : null, arabicGloss: gloss && /[؀-ۿ]/.test(gloss) && gloss.length <= 60 ? gloss : null } };
}

/** All words valid (strict, for one word); for a batch at least half valid (the bad ones are left for later). */
export function wordValidator(asked: string[], strict = asked.length === 1): Validator<AiWord[]> {
  return (data) => {
    const list = (data as { results?: unknown })?.results;
    if (!Array.isArray(list)) return { ok: false, error: "missing the “results” list" };
    const out: AiWord[] = []; const errors: string[] = [];
    for (const w of asked) {
      const raw = list.find((x) => normalizeWord(s((x as Record<string, unknown>)?.word)) === w);
      if (!raw) { errors.push(`no result for “${w}”`); continue; }
      const c = checkOne(raw, w);
      if (c.ok) out.push(c.value); else errors.push(c.error);
    }
    if (strict ? errors.length : out.length * 2 < asked.length) return { ok: false, error: errors.slice(0, 5).join("; ") || "no valid results" };
    return { ok: true, value: out };
  };
}

/** Saves an AI meaning for the school (never over a dictionary or school meaning) and clears the word's request. */
export async function saveAiWord(repo: Repo, schoolId: string, r: AiWord, sentence: string | null, now: Date, isVocab = false): Promise<Row | null> {
  const head = r.baseWord;
  const meaning = { partOfSpeech: r.partOfSpeech, definition: r.definition, example: r.example, synonyms: [] as string[], antonyms: [] as string[] };
  const row = await repo.findUnique("WordEntry", { schoolId, word: head });
  let ms: unknown = row?.meanings; if (typeof ms === "string") { try { ms = JSON.parse(ms); } catch { ms = []; } }
  const has = Array.isArray(ms) && ms.some((m) => s((m as Record<string, unknown>)?.definition));
  const ctx = sentence && new RegExp(`\\b${r.word.replace(/[^a-z'-]/g, "")}`, "i").test(sentence) ? sentence.slice(0, 300) : null;
  if (row && has) { /* someone defined it meanwhile: keep theirs */ }
  else if (row) await repo.updateMany("WordEntry", { id: row.id }, { meanings: [meaning], source: "AI", arabicGloss: row.arabicGloss ?? r.arabicGloss, contextSentence: row.contextSentence ?? ctx, updatedAt: now });
  else {
    try { await repo.create("WordEntry", { schoolId, word: head, phonetic: null, audioUrl: null, meanings: [meaning], source: "AI", isVocab, arabicGloss: r.arabicGloss, contextSentence: ctx, updatedById: null, updatedAt: now }); }
    catch { /* created by a parallel request */ }
  }
  await repo.deleteMany("MissingWord", { schoolId, word: { in: [...new Set([r.word, head])] } });
  forgetSchoolWords(repo, schoolId);
  return repo.findUnique("WordEntry", { schoolId, word: head });
}

/** The school's AI provider with a short timeout (the AI settings decide on / off and the provider). */
export function wordProvider(env: EnvLike, settings: AiSettings, o: WordAiOptions = {}): Picked {
  const t = o.timeoutMs ?? 8000;
  return pickProvider(env, settings, {
    gemini: (x) => geminiProvider({ ...x, timeoutMs: t, ...(o.fetchImpl ? { fetchImpl: o.fetchImpl } : {}) }),
    anthropic: (x) => anthropicProvider({ ...x, timeoutMs: t, ...(o.fetchImpl ? { fetchImpl: o.fetchImpl } : {}) }),
  });
}

/** Room for `need` more AI requests under the school's limits (counted in the database, bounded queries). */
export async function aiRoom(repo: Repo, schoolId: string, settings: AiSettings, now = new Date(), need = 1): Promise<{ ok: boolean; reason: string | null }> {
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const today = await repo.count("AiRequestLog", { schoolId, createdAt: { gte: dayStart } });
  if (today + need > settings.perDay) return { ok: false, reason: `Today's limit of ${settings.perDay} AI requests is reached.` };
  const minute = await repo.findMany("AiRequestLog", { schoolId, createdAt: { gt: new Date(now.getTime() - 60_000) } }, { select: ["error"], take: 100 });
  if (minute.some((l) => /RATE_LIMIT/.test(s(l.error)))) return { ok: false, reason: "The AI provider asked us to slow down. Try again in a minute." };
  if (minute.length + need > settings.perMinute) return { ok: false, reason: "The AI is busy this minute. Try again in a minute." };
  return { ok: true, reason: null };
}

export const WORD_AI_PER_USER_DAY = 40;

/**
 * One word through the AI (≈8 s budget). Returns null when the AI is off, not set up, over a limit, slow or wrong.
 * A reply that arrives after the budget is still saved, so the next tap finds it.
 */
export async function aiDefineWord(repo: Repo, schoolId: string, word: string, sentence: string | null, userKey: string, o: WordAiOptions, now = new Date(), isVocab: (w: string) => Promise<boolean> = async () => false): Promise<AiWord | null> {
  if (!o.env) return null;
  const settings = await aiSettings(repo, schoolId);
  const picked = wordProvider(o.env, settings, o);
  if (!picked.ok) return null;
  if (!(await aiRoom(repo, schoolId, settings, now)).ok) return null;
  if (!(await consumeRateLimit(repo, `word-ai:${userKey}`, WORD_AI_PER_USER_DAY, DAY, now)).allowed) return null;
  const { system, user } = wordPrompt([{ word, sentence }]);
  const work = (async () => {
    const r = await callJson(repo, { schoolId, tool: "WORD", picked, items: 1 }, system, user, wordValidator([word]), 1);
    if (!r.ok || !r.value[0]) return null;
    await saveAiWord(repo, schoolId, r.value[0], sentence, new Date(), await isVocab(r.value[0].baseWord).catch(() => false));
    return r.value[0];
  })().catch(() => null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((res) => { timer = setTimeout(() => res(null), o.timeoutMs ?? 8000); (timer as { unref?: () => void }).unref?.(); });
  try { return await Promise.race([work, late]); } finally { clearTimeout(timer); }
}

/** Many words in one request (≈30): saves the valid ones. stop = a limit / outage / setup problem (stop the run). */
export async function defineWordsWithAi(repo: Repo, schoolId: string, items: { word: string; sentence: string | null }[], picked: Extract<Picked, { ok: true }>, now = new Date(), vocab: Set<string> = new Set()): Promise<{ saved: string[]; error: string | null; stop: boolean }> {
  if (!items.length) return { saved: [], error: null, stop: false };
  const { system, user } = wordPrompt(items);
  const r = await callJson(repo, { schoolId, tool: "WORD", picked, items: items.length }, system, user, wordValidator(items.map((i) => i.word), false), 1);
  if (!r.ok) return { saved: [], error: r.error, stop: r.stop };
  const saved: string[] = [];
  for (const w of r.value) { const it = items.find((i) => i.word === w.word); await saveAiWord(repo, schoolId, w, it?.sentence ?? null, now, vocab.has(w.baseWord)); saved.push(w.baseWord); }
  return { saved, error: null, stop: false };
}

// ------------------------------------------------------------------ missing-word requests

/** A tap that found no meaning: one row per school and word (count + last sentence), never who tapped it. */
export async function recordMissingWord(repo: Repo, schoolId: string, word: string, sentence: string | null, now = new Date(), checked = false): Promise<void> {
  const row = await repo.findUnique("MissingWord", { schoolId, word });
  const last = sentence ? sentence.slice(0, 300) : null;
  if (row) { await repo.updateMany("MissingWord", { id: row.id }, { count: Number(row.count ?? 0) + 1, lastSentence: last ?? row.lastSentence ?? null, lastAt: now, ...(checked ? { checkedAt: now } : {}) }); return; }
  try { await repo.create("MissingWord", { schoolId, word, count: 1, lastSentence: last, checkedAt: checked ? now : null, firstAt: now, lastAt: now }); }
  catch { await recordMissingWordAgain(repo, schoolId, word, last, now); }
}
async function recordMissingWordAgain(repo: Repo, schoolId: string, word: string, last: string | null, now: Date) {
  const row = await repo.findUnique("MissingWord", { schoolId, word });
  if (row) await repo.updateMany("MissingWord", { id: row.id }, { count: Number(row.count ?? 0) + 1, lastSentence: last ?? row.lastSentence ?? null, lastAt: now });
}

export interface MissingWordView { word: string; count: number; lastSentence: string | null; lastAt: string }
const isStaff = (a: Actor) => a.role === "TEACHER" || a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";

/** The school's words without a meaning, most-tapped first (words that found a meaning since are removed). */
export async function missingWords(repo: Repo, actor: Actor, take = 100): Promise<MissingWordView[]> {
  if (!isStaff(actor) || !actor.schoolId) throw new ForbiddenError();
  const rows = await repo.findMany("MissingWord", { schoolId: actor.schoolId }, { orderBy: [{ field: "count", dir: "desc" }, { field: "lastAt", dir: "desc" }], take });
  if (!rows.length) return [];
  const done = await resolvedWords(repo, actor.schoolId, rows.map((r) => s(r.word)));
  if (done.size) await repo.deleteMany("MissingWord", { schoolId: actor.schoolId, word: { in: [...done] } });
  const iso = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).toISOString();
  return rows.filter((r) => !done.has(s(r.word))).map((r) => ({ word: s(r.word), count: Number(r.count ?? 0), lastSentence: r.lastSentence ? s(r.lastSentence) : null, lastAt: iso(r.lastAt) }));
}

/** Which of these words (or the base of a plural / verb form) already have a meaning in the school dictionary: one query. */
export async function resolvedWords(repo: Repo, schoolId: string, list: string[]): Promise<Set<string>> {
  const cands = new Map(list.map((w) => [w, lemmaTiers(w).safe]));
  const all = [...new Set([...cands.values()].flat())];
  if (!all.length) return new Set();
  const rows = await repo.findMany("WordEntry", { schoolId, word: { in: all } }, { select: ["word", "meanings"] });
  const ok = new Set(rows.filter((r) => { let m: unknown = r.meanings; if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = []; } } return Array.isArray(m) && m.some((x) => s((x as Record<string, unknown>)?.definition)); }).map((r) => s(r.word)));
  return new Set(list.filter((w) => cands.get(w)!.some((c) => ok.has(c))));
}

export const AI_WORD_BATCH = 30;

/** ✨ Admin: “Add meanings with AI” for the most-tapped missing words (up to 2 requests of 30 words a click). */
export async function fillMissingWithAi(repo: Repo, actor: Actor, env: EnvLike, o: { fetchImpl?: typeof fetch; requests?: number } = {}, now = new Date()): Promise<{ added: number; left: number; message: string }> {
  if (!isAdmin(actor) || !actor.schoolId) throw new ForbiddenError("School admins add meanings with AI.");
  const schoolId = actor.schoolId;
  const settings = await aiSettings(repo, schoolId);
  const picked = wordProvider(env, settings, { fetchImpl: o.fetchImpl, timeoutMs: 60_000 });
  const list = await missingWords(repo, actor, AI_WORD_BATCH * (o.requests ?? 2));
  if (!picked.ok) return { added: 0, left: list.length, message: picked.reason };
  let added = 0, message = "";
  for (let i = 0; i < list.length; i += AI_WORD_BATCH) {
    const room = await aiRoom(repo, schoolId, settings, new Date());
    if (!room.ok) { message = room.reason ?? ""; break; }
    const r = await defineWordsWithAi(repo, schoolId, list.slice(i, i + AI_WORD_BATCH).map((w) => ({ word: w.word, sentence: w.lastSentence })), picked, now);
    added += r.saved.length;
    if (r.error) { message = r.error; if (r.stop) break; }
  }
  const left = await repo.count("MissingWord", { schoolId });
  await audit(repo, { actorId: actor.userId, action: "word.ai.fill", entityType: "WordEntry", entityId: "missing", after: { added, left }, at: now });
  return { added, left, message: message || (added ? "" : "No new meanings were added.") };
}

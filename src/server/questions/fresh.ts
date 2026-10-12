/**
 * 🆕 Fresh questions — the school's rule: a student NEVER sees the same question twice while solving, and does not see
 * a question again later while unseen questions of the same skill (and type) exist. Second Chance is the only place a
 * missed question comes back, by design.
 *
 *   SAME CONTENT   Two questions are "the same" when they share the stored fingerprint (Question.contentHash, see
 *                  dedupe-hash.ts) OR the same normalized stem + the same correct answer (copies of one question
 *                  stored under different skills, grades or Curriculum Map places). contentKeys…() return those keys;
 *                  two questions are the same when any key matches.
 *   ONE SITTING    Sitting: the question ids AND content keys already served in a practice session, a set, a test, a
 *                  Diagnostic, a lesson run or a game round. Nothing in it is served again (selection AND delivery).
 *   ACROSS SITTINGS seenIndex(): when each question of a candidate pool (and its copies elsewhere in the bank, found by
 *                  fingerprint) was last attempted by the student — ONE batched read of the student's attempts for
 *                  the pool's ids (≤ BATCH ids per statement, needed columns only), never one query per question.
 *                  freshOrder / freshFilter: never-seen first, then the ones seen longest ago; a seen question comes
 *                  back only when every question of its group (skill, type…) has been seen.
 *
 * Only WHICH question is served changes: levels, ability, mastery and the adaptive difficulty logic are untouched.
 */
import { createHash } from "node:crypto";
import type { PracticeItem } from "../practice/items";
import type { Repo, Row } from "../seeding/repo";
import { bankVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";
import { normalizeText } from "./dedupe-hash";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime() || 0;
/** ids per read (bounded statements) */
export const BATCH = 500;
const chunks = <T,>(xs: T[], n = BATCH) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const sha = (x: string) => createHash("sha1").update(x).digest("hex").slice(0, 24);

/** The "same normalized stem + same correct answer" key (null for an empty stem: nothing to compare). */
export function stemAnswerKey(stem: unknown, answer: string): string | null {
  const st = normalizeText(stem);
  if (!st) return null;
  return `s:${sha(`${st}\u0000${normalizeText(answer)}`)}`;
}

const parseJ = (v: unknown): unknown => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return v; } };
/** a stored answer value as comparable text (strings normalized inside) */
function answerText(v: unknown): string {
  const norm = (x: unknown): unknown => (typeof x === "string" ? normalizeText(x) : Array.isArray(x) ? x.map(norm) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x as object).sort().filter((k) => k !== "rationale" && k !== "misconception").map((k) => [k, norm((x as Record<string, unknown>)[k])])) : x ?? null);
  return JSON.stringify(norm(parseJ(v)));
}
const optionsText = (texts: string[]) => texts.map((t) => normalizeText(t)).sort().join("\u0001");

/** The content keys of a loaded bank item (in memory, no reads). */
export function itemContentKeys(item: PracticeItem): string[] {
  const keys: string[] = [];
  if (item.contentHash) keys.push(`h:${item.contentHash}`);
  let answer: string;
  if (item.options?.length) answer = optionsText(item.options.filter((o) => o.correct).map((o) => o.text));
  else if (item.twoPart) answer = optionsText([...item.twoPart.partA.options, ...item.twoPart.partB.options].filter((o) => o.correct).map((o) => o.text));
  else if (item.type === "TRUE_FALSE") answer = String(Boolean(item.answer));
  else if (item.type === "FILL_BLANK") answer = answerText(item.answers ?? []);
  else if (item.sequence) answer = answerText(item.sequence);
  else if (item.pairs) answer = answerText(item.pairs);
  else answer = answerText({ seg: item.segments, err: item.errorIndexes ?? item.errorIndex, cor: item.corrections ?? item.correction, grid: item.grid, hot: item.hotText, dict: item.dictation, comb: item.combine });
  const k = stemAnswerKey(item.stem, `${item.type}|${answer}`);
  if (k) keys.push(k);
  return keys;
}

/**
 * The content keys of stored questions (bounded reads: ≤ BATCH ids per statement, three statements per batch, only the
 * needed columns). Questions not found get no entry.
 */
export async function contentKeysForIds(repo: Repo, ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const part of chunks([...new Set(ids.map(s).filter(Boolean))])) {
    const [qs, opts, ans, types] = await Promise.all([
      repo.findMany("Question", { id: { in: part } }, { select: ["id", "stem", "contentHash", "typeId"] }),
      repo.findMany("QuestionOption", { questionId: { in: part }, isCorrect: true }, { select: ["questionId", "text"] }),
      repo.findMany("QuestionAnswer", { questionId: { in: part } }, { select: ["questionId", "value", "isPrimary"] }),
      typeCodes(repo),
    ]);
    const optsOf = new Map<string, string[]>(), ansOf = new Map<string, Row[]>();
    for (const o of opts) { const l = optsOf.get(s(o.questionId)); if (l) l.push(s(o.text)); else optsOf.set(s(o.questionId), [s(o.text)]); }
    for (const a of ans) { const l = ansOf.get(s(a.questionId)); if (l) l.push(a); else ansOf.set(s(a.questionId), [a]); }
    for (const q of qs) {
      const id = s(q.id), keys: string[] = [];
      if (q.contentHash) keys.push(`h:${s(q.contentHash)}`);
      const o = optsOf.get(id);
      const a = (ansOf.get(id) ?? []).sort((x, y) => Number(Boolean(y.isPrimary)) - Number(Boolean(x.isPrimary)))[0];
      const k = stemAnswerKey(q.stem, `${types.get(s(q.typeId)) ?? s(q.typeId)}|${o?.length ? optionsText(o) : a ? answerText(a.value) : ""}`);
      if (k) keys.push(k);
      out.set(id, keys);
    }
  }
  return out;
}

let typeCache: { v: number; at: number; m: Map<string, string> } | null = null;
async function typeCodes(repo: Repo): Promise<Map<string, string>> {
  if (typeCache && typeCache.v === bankVersion() && Date.now() - typeCache.at < 600_000) return typeCache.m;
  const m = new Map((await repo.findMany("QuestionType", {}, { select: ["id", "code"] })).map((t) => [s(t.id), s(t.code)]));
  typeCache = { v: bankVersion(), at: Date.now(), m };
  return m;
}

const keyCache = new Map<string, { v: number; at: number; p: Promise<Map<string, string[]>> }>();
/** contentKeysForIds kept in memory for a fixed pool (a set's order, a Diagnostic's design) while the bank is unchanged (≤ 10 min). */
export function cachedContentKeys(repo: Repo, cacheKey: string, ids: string[]): Promise<Map<string, string[]>> {
  const hit = keyCache.get(cacheKey);
  if (hit && hit.v === bankVersion() && Date.now() - hit.at < 600_000) return hit.p;
  const p = contentKeysForIds(repo, ids).catch((e) => { keyCache.delete(cacheKey); throw e; });
  remember(keyCache, cacheKey, { v: bankVersion(), at: Date.now(), p }, 200);
  return p;
}

// ------------------------------------------------------------------ one sitting

/** What one sitting has served: ids and content keys. */
export class Sitting {
  readonly ids = new Set<string>();
  readonly keys = new Set<string>();
  add(id: string, keys: readonly string[] = []): this { this.ids.add(id); for (const k of keys) this.keys.add(k); return this; }
  /** this question (or a copy of it) was already served in the sitting */
  has(id: string, keys: readonly string[] = []): boolean { return this.ids.has(id) || keys.some((k) => this.keys.has(k)); }
}

/** One copy per content (the first one in the list wins). */
export function dedupeByContent<T>(list: readonly T[], idOf: (t: T) => string, keysOf: (t: T) => readonly string[]): T[] {
  const seen = new Sitting();
  const out: T[] = [];
  for (const t of list) { const id = idOf(t), keys = keysOf(t); if (seen.has(id, keys)) continue; seen.add(id, keys); out.push(t); }
  return out;
}

/** Question ids with copies removed (first wins), from stored rows. */
export async function dedupeIds(repo: Repo, ids: string[], keys?: Map<string, string[]>): Promise<string[]> {
  const k = keys ?? (await contentKeysForIds(repo, ids));
  return dedupeByContent(ids, (id) => id, (id) => k.get(id) ?? []);
}

// ------------------------------------------------------------------ across sittings

export interface SeenIndex {
  /** when the student last attempted this question or a copy of it (ms), 0 = never */
  lastSeen(id: string, keys?: readonly string[]): number;
}
export const NEVER_SEEN: SeenIndex = { lastSeen: () => 0 };

/**
 * When the student last attempted each question of the pool — their own answers to it, to a copy of it elsewhere in
 * the bank (same fingerprint), from any practice, set, test, Diagnostic, lesson, ReadMaster or Question of the Day.
 * `exceptSessions`: the current sitting (handled by Sitting). Reads: the copies of the pool's fingerprints (one
 * indexed read per BATCH), then the student's attempts on those ids (one read per BATCH, two columns).
 */
export async function seenIndex(repo: Repo, studentId: string, pool: readonly { id: string; keys?: readonly string[] }[], opts: { exceptSessions?: readonly string[] } = {}): Promise<SeenIndex> {
  if (!pool.length || !studentId) return NEVER_SEEN;
  const hashes = [...new Set(pool.flatMap((p) => (p.keys ?? []).filter((k) => k.startsWith("h:")).map((k) => k.slice(2))))];
  const hashOf = new Map<string, string>();
  for (const part of chunks(hashes)) for (const q of await repo.findMany("Question", { contentHash: { in: part } }, { select: ["id", "contentHash"] })) hashOf.set(s(q.id), s(q.contentHash));
  const ids = [...new Set([...pool.map((p) => p.id), ...hashOf.keys()])];
  const skip = new Set(opts.exceptSessions ?? []);
  const lastById = new Map<string, number>();
  const note = (id: string, t: number) => { if (t > (lastById.get(id) ?? 0)) lastById.set(id, t); };
  for (const part of chunks(ids)) {
    const [att, qotd] = await Promise.all([
      repo.findMany("QuestionAttempt", { studentId, questionId: { in: part } }, { select: ["questionId", "createdAt", "sessionId"] }),
      repo.findMany("QotdAnswer", { studentId, questionId: { in: part } }, { select: ["questionId", "createdAt"] }),
    ]);
    for (const a of att) if (!skip.has(s(a.sessionId))) note(s(a.questionId), Math.max(1, time(a.createdAt)));
    for (const a of qotd) note(s(a.questionId), Math.max(1, time(a.createdAt)));
  }
  const lastByKey = new Map<string, number>();
  const noteKey = (k: string, t: number) => { if (t > (lastByKey.get(k) ?? 0)) lastByKey.set(k, t); };
  for (const [id, h] of hashOf) { const t = lastById.get(id); if (t) noteKey(`h:${h}`, t); }
  // a pool question seen through one key (its own id, a fingerprint copy) marks its other keys too, so a copy that only
  // shares the stem + answer with it counts as seen (two passes: copies of copies)
  for (let pass = 0; pass < 2; pass++) {
    for (const p of pool) {
      const t = Math.max(lastById.get(p.id) ?? 0, ...(p.keys ?? []).map((k) => lastByKey.get(k) ?? 0));
      if (t) for (const k of p.keys ?? []) noteKey(k, t);
    }
  }
  return {
    lastSeen: (id, keys = []) => Math.max(lastById.get(id) ?? 0, ...keys.map((k) => lastByKey.get(k) ?? 0)),
  };
}

const seenCache = new Map<string, { at: number; p: Promise<SeenIndex> }>();
/**
 * seenIndex kept for one sitting (key: student + sitting + pool): what was answered in OTHER sittings does not change
 * while this one is being answered. At most 20 minutes, bounded.
 */
export function cachedSeenIndex(repo: Repo, cacheKey: string, studentId: string, pool: readonly { id: string; keys?: readonly string[] }[], opts: { exceptSessions?: readonly string[] } = {}): Promise<SeenIndex> {
  const hit = seenCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 20 * 60_000) return hit.p;
  const p = seenIndex(repo, studentId, pool, opts).catch((e) => { seenCache.delete(cacheKey); throw e; });
  remember(seenCache, cacheKey, { at: Date.now(), p }, 2000);
  return p;
}

/** Never-seen first (their order kept), then the ones seen longest ago first. Pure. */
export function freshOrder<T>(list: readonly T[], seenAt: (t: T) => number): T[] {
  const never = list.filter((t) => !seenAt(t));
  const seen = list.filter((t) => seenAt(t)).map((t, i) => ({ t, at: seenAt(t), i })).sort((a, b) => a.at - b.at || a.i - b.i).map((x) => x.t);
  return [...never, ...seen];
}

/**
 * For an engine that chooses by its own rules (difficulty, information, Lexile): only the candidates it may choose
 * from. Per group (a skill, a skill + type…): the never-seen ones while there are any; once every question of the
 * group has been seen, the ones seen longest ago (the older half, at least one). Pure.
 */
export function freshFilter<T>(list: readonly T[], seenAt: (t: T) => number, groupOf: (t: T) => string = () => ""): T[] {
  const groups = new Map<string, T[]>();
  for (const t of list) { const g = groupOf(t); const l = groups.get(g); if (l) l.push(t); else groups.set(g, [t]); }
  const keep = new Set<T>();
  for (const l of groups.values()) {
    const never = l.filter((t) => !seenAt(t));
    if (never.length) { for (const t of never) keep.add(t); continue; }
    const byAge = [...l].sort((a, b) => seenAt(a) - seenAt(b));
    const cut = seenAt(byAge[Math.max(0, Math.ceil(byAge.length / 2) - 1)]);
    for (const t of byAge) if (seenAt(t) <= cut) keep.add(t);
  }
  return list.filter((t) => keep.has(t));
}

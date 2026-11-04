/**
 * 🎯 "Picks the longest answer" (teacher signal, next to ⚡ on Student Skills): over the student's last LONGEST_DAYS days
 * of CAREFUL (not rapid-guess) bank answers on 4-choice questions with sentence-like choices, the accuracy when the
 * correct choice was the longest one is compared with the accuracy when it was not. Flagged when there are at least
 * LONGEST_MIN_EACH answers of each kind and the first is at least LONGEST_GAP points higher: the student is choosing
 * by length, not by reading.
 *
 * Bounded like the ⚡ flag: ONE read of the class's answers (newest FALLBACK_TAKE, 3 small columns), the choices of the
 * questions answered in batches of 500 (question id, text, isCorrect); each question's "correct = longest" kept per
 * database while the choices are unchanged, and a class's result kept 5 minutes while no answer / choice is written
 * (a page opened again reads nothing more).
 */
import type { Repo, Row } from "../seeding/repo";
import { createHash } from "node:crypto";
import { modelVersion } from "../cache/bank-version";
import { remember } from "../cache/lru";
import { sweptMap } from "../cache/idle";
import { FALLBACK_TAKE } from "./grid-fallback";
import { lengthCue, SENTENCE_WORDS, wordCount } from "../../lib/length-cue";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;
export const LONGEST_DAYS = 60;
export const LONGEST_MIN_EACH = 12;
export const LONGEST_GAP = 35;
export const LONGEST_TIP = "Picks the longest answer — ask the student to read every choice and explain why the others are wrong.";
export const LONGEST_RULE = "🎯 = in the last 60 days the student was right much more often when the correct answer was the longest choice (at least 35 points more, from 12+ answers of each kind).";

export interface LongestPick { longN: number; longRight: number; otherN: number; otherRight: number; gap: number; flagged: boolean }

/** Pure: the signal from one student's answers ({ longest: the correct choice was the longest, correct: answered right }). */
export function longestPickOf(rows: readonly { longest: boolean; correct: boolean }[]): LongestPick {
  let longN = 0, longRight = 0, otherN = 0, otherRight = 0;
  for (const r of rows) { if (r.longest) { longN++; if (r.correct) longRight++; } else { otherN++; if (r.correct) otherRight++; } }
  const gap = longN && otherN ? Math.round((100 * longRight) / longN - (100 * otherRight) / otherN) : 0;
  return { longN, longRight, otherN, otherRight, gap, flagged: longN >= LONGEST_MIN_EACH && otherN >= LONGEST_MIN_EACH && gap >= LONGEST_GAP };
}

/** question id (cuid: unique across databases) → true (correct = longest) / false (not) / null (not a 4-choice
 * sentence-like question) */
let cueCache: { v: string; m: Map<string, boolean | null> } = { v: "", m: new Map() };
const CUE_MAX = 30_000;
/** a class's result (its student ids + the end time to 10 minutes), kept KEEP_MS while answers and choices are unchanged */
const KEEP_MS = 5 * 60_000;
const kept = sweptMap<string, { at: number; v: string; p: Promise<Map<string, LongestPick>> }>("skills.longest-pick", KEEP_MS, 16);
const isTrue = (v: unknown) => v === true || v === 1 || v === "1";

/** Pure: whether a question counts and whether its correct choice is the longest (null = it does not count). */
export function longestOf(options: readonly { text: unknown; isCorrect: unknown }[]): boolean | null {
  if (options.length !== 4) return null;
  const k = options.findIndex((o) => isTrue(o.isCorrect));
  if (k < 0 || options.filter((o) => isTrue(o.isCorrect)).length !== 1) return null;
  if (wordCount(options[k].text) < SENTENCE_WORDS) return null;
  return lengthCue(options.map((o) => s(o.text)), k).longest;
}

async function cues(repo: Repo, ids: readonly string[]): Promise<Map<string, boolean | null>> {
  const v = modelVersion("QuestionOption");
  if (cueCache.v !== v || cueCache.m.size > CUE_MAX) cueCache = { v, m: new Map() };
  const m = cueCache.m;
  const need = ids.filter((id) => !m.has(id));
  for (let i = 0; i < need.length; i += 500) {
    const part = need.slice(i, i + 500);
    const opts = await repo.findMany("QuestionOption", { questionId: { in: part } }, { select: ["questionId", "text", "isCorrect", "order"] });
    const byQ = new Map<string, Row[]>();
    for (const o of opts) (byQ.get(s(o.questionId)) ?? byQ.set(s(o.questionId), []).get(s(o.questionId))!).push(o);
    for (const id of part) m.set(id, longestOf((byQ.get(id) ?? []).sort((a, b) => Number(a.order) - Number(b.order)) as { text: unknown; isCorrect: unknown }[]));
  }
  return new Map(ids.map((id) => [id, m.get(id) ?? null]));
}

/** The signal of each of these students (as of `now`; kept a few minutes, see the header). */
export function longestPickers(repo: Repo, studentIds: readonly string[], now = new Date()): Promise<Map<string, LongestPick>> {
  if (!studentIds.length) return Promise.resolve(new Map());
  const m = kept;
  const key = createHash("sha1").update(`${[...studentIds].sort().join(",")}|${Math.floor(now.getTime() / 600_000)}`).digest("hex");
  const v = modelVersion("QuestionAttempt", "QuestionOption"), hit = m.get(key);
  if (hit && hit.v === v && Date.now() - hit.at < KEEP_MS) return hit.p.then((x) => new Map(x));
  const p = compute(repo, studentIds, now);
  remember(m, key, { at: Date.now(), v, p }, 16);
  p.catch(() => { if (m.get(key)?.p === p) m.delete(key); });
  return p.then((x) => new Map(x));
}

async function compute(repo: Repo, studentIds: readonly string[], now: Date): Promise<Map<string, LongestPick>> {
  const out = new Map<string, LongestPick>();
  const since = new Date(now.getTime() - LONGEST_DAYS * DAY);
  const answers: Row[] = [];
  for (let i = 0; i < studentIds.length && answers.length < FALLBACK_TAKE; i += 400) {
    answers.push(...(await repo.findMany("QuestionAttempt", { studentId: { in: studentIds.slice(i, i + 400) }, rapidGuess: false, createdAt: { gte: since, lte: now } },
      { select: ["studentId", "questionId", "isCorrect"], orderBy: [{ field: "createdAt", dir: "desc" }], take: FALLBACK_TAKE - answers.length })));
  }
  if (!answers.length) return out;
  const cue = await cues(repo, [...new Set(answers.map((a) => s(a.questionId)))]);
  const rows = new Map<string, { longest: boolean; correct: boolean }[]>();
  for (const a of answers) {
    const c = cue.get(s(a.questionId));
    if (c === null || c === undefined) continue;
    (rows.get(s(a.studentId)) ?? rows.set(s(a.studentId), []).get(s(a.studentId))!).push({ longest: c, correct: isTrue(a.isCorrect) });
  }
  for (const [id, r] of rows) out.set(id, longestPickOf(r));
  return out;
}

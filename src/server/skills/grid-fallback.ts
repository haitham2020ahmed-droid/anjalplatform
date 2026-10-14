/**
 * ⭐ Skills grid fallback (owner r70 §4b): on a live server where the one-time star migration never ran (startup jobs
 * were OFF), old practice has no SkillStatus row, so every cell showed ☆ and "0 of 24 mastered". Until the school's
 * migration report exists, the grid computes the missing cells from the RAW practice answers with the SAME rule as
 * the migration (status-extras recomputeStudents → decideStatus): counted answers = careful answers (no rapid
 * guesses, no Unreliable session) of practice sessions (adaptive practice, teacher quiz) that are not tests / checks /
 * re-checks; ⭐ only with ≥ 30 such answers AND the engine's mastery; ◐ when started. Nothing is written here — the
 * migration (queued by the page, ensureStarsMigration) writes the real rows.
 * Light (512 MB): one bounded read of the class's answers (newest FALLBACK_TAKE), their sessions and assignments in
 * batches of 500, one read of the engine's mastery — only for a school not migrated yet, never once it is.
 */
import type { Repo, Row } from "../seeding/repo";
import { decideStatus, NOT_STARTED_VIEW, type SkillKeyIndex, type StarView } from "./status";
import { migrationReport, STARS_JOB } from "./status-extras";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
/** at most this many answers of the class are read for the fallback (newest first) */
export const FALLBACK_TAKE = 15000;
const PRACTICE_MODES = new Set(["ADAPTIVE_PRACTICE", "TEACHER_QUIZ"]);
const TEST_MARKS = new Set(["TEST", "WEEKLY_CHECK"]);

export interface Counted { answered: number; correct: number; skillId: string }
/**
 * Pure: student|key → counted answers, from the attempts, the sessions that count (`ok`) and the key index.
 * Exported for the tests (known answers in, known stars out).
 */
export function countAnswers(attempts: readonly Row[], ok: ReadonlySet<string>, keyOf: ReadonlyMap<string, string>): Map<string, Counted> {
  const out = new Map<string, Counted>();
  for (const a of attempts) {
    if (s(a.source) || a.unreliable || a.rapidGuess === true || a.rapidGuess === 1) continue;
    if (!ok.has(s(a.sessionId))) continue;
    const key = keyOf.get(s(a.skillId)); if (!key) continue;
    const k = `${s(a.studentId)}|${key}`, c = out.get(k) ?? { answered: 0, correct: 0, skillId: s(a.skillId) };
    c.answered++; if (a.isCorrect === true || a.isCorrect === 1) c.correct++;
    out.set(k, c);
  }
  return out;
}
/** Pure: the star view of a cell with no status row (decideStatus from nothing). */
export function fallbackView(key: string, c: Counted | undefined, eng: { score: number; mastered: boolean } | undefined): StarView {
  const d = decideStatus(null, c?.answered ?? 0, Boolean(eng?.mastered));
  if (d.status === "NOT_STARTED") return NOT_STARTED_VIEW(key);
  return { ...NOT_STARTED_VIEW(key), status: d.status, answered: c?.answered ?? 0, correct: c?.correct ?? 0, score: Math.round(eng?.score ?? 0), skillId: c?.skillId ?? null };
}

/** Is the school's star migration done (its report exists)? One read. */
export async function starsMigrated(repo: Repo, schoolId: string): Promise<boolean> {
  return Boolean(await migrationReport(repo, schoolId).catch(() => null));
}

const queued = new Set<string>();
/**
 * Makes sure the school's one-time star migration is queued (owner r70: it was OFF on the live server): once per
 * process per school, through the light job runner (batches of 25, memory gate, resumable). Never throws.
 */
export async function ensureStarsMigration(repo: Repo, schoolId: string): Promise<boolean> {
  // r70: BACKGROUND_JOBS=off (school hours on the 512 MB plan) — never start the migration from a page; the grid falls back
  if (!schoolId || queued.has(schoolId) || String(process.env.BACKGROUND_JOBS).toLowerCase() === "off") return false;
  queued.add(schoolId);
  try {
    if (await starsMigrated(repo, schoolId)) return false;
    const { enqueueJob } = await import("../jobs/runner");
    enqueueJob(repo, STARS_JOB, schoolId);
    return true;
  } catch { queued.delete(schoolId); return false; }
}

/**
 * The cells with no status row, computed from the raw practice (student id → key → view; practised keys the grid did
 * not list are returned too, so "All skills" shows them). Bounded reads, see the header.
 */
export async function fallbackStars(repo: Repo, studentIds: readonly string[], ix: SkillKeyIndex): Promise<Map<string, Map<string, StarView>>> {
  if (!studentIds.length) return new Map();
  const attempts = await readAnswers(repo, studentIds, { careful: true });
  if (!attempts.length) return new Map();
  const counts = countAnswers(attempts, await countedSessions(repo, attempts), ix.keyOf);
  if (!counts.size) return new Map();
  const mastery = await engineRows(repo, studentIds, [...new Set([...counts.values()].map((c) => c.skillId))]);
  return fallbackFrom(counts, engineOf(mastery, ix.keyOf));
}

/** the columns of an answer read (fallback, trend, guessing, date range) */
export const ANSWER_COLS = ["studentId", "sessionId", "skillId", "isCorrect", "source", "unreliable", "rapidGuess", "createdAt"];
/**
 * r75: a class's answers, newest first, at most `take` in all (ONE read): only careful ones (no rapid guess) when
 * `careful`; only from `since` / up to `until` (ms) when given.
 */
export async function readAnswers(repo: Repo, studentIds: readonly string[], opts: { since?: number | null; until?: number | null; careful?: boolean; take?: number } = {}): Promise<Row[]> {
  if (!studentIds.length) return [];
  const at = { ...(opts.since ? { gte: new Date(opts.since) } : {}), ...(opts.until ? { lte: new Date(opts.until) } : {}) };
  const where = { studentId: { in: [...studentIds] }, ...(opts.careful ? { rapidGuess: false } : {}), ...(opts.since || opts.until ? { createdAt: at } : {}) };
  return repo.findMany("QuestionAttempt", where, { select: ANSWER_COLS, orderBy: [{ field: "createdAt", dir: "desc" }], take: opts.take ?? FALLBACK_TAKE });
}
/** The sessions whose answers count for a star (practice — not a test / check / re-check): batched reads of 500. */
export async function countedSessions(repo: Repo, attempts: readonly Row[]): Promise<Set<string>> {
  const sids = [...new Set(attempts.map((a) => s(a.sessionId)).filter(Boolean))];
  const sessions: Row[] = [];
  for (let i = 0; i < sids.length; i += 500) sessions.push(...(await repo.findMany("PracticeSession", { id: { in: sids.slice(i, i + 500) } }, { select: ["id", "mode", "assignmentId"] })));
  const aids = [...new Set(sessions.map((x) => s(x.assignmentId)).filter(Boolean))];
  const as: Row[] = [];
  for (let i = 0; i < aids.length; i += 500) as.push(...(await repo.findMany("Assignment", { id: { in: aids.slice(i, i + 500) } }, { select: ["id", "testId", "curriculumPlanId", "title"] })));
  const bad = new Set(as.filter((a) => a.testId || TEST_MARKS.has(s(a.curriculumPlanId)) || s(a.title).startsWith("Re-check: ")).map((a) => s(a.id)));
  return new Set(sessions.filter((x) => PRACTICE_MODES.has(s(x.mode)) && !bad.has(s(x.assignmentId))).map((x) => s(x.id)));
}
/** The engine's mastery rows of these students and skills (one read, with when each was mastered). */
export async function engineRows(repo: Repo, studentIds: readonly string[], skillIds: readonly string[]): Promise<Row[]> {
  if (!studentIds.length || !skillIds.length) return [];
  return repo.findMany("StudentSkillMastery", { studentId: { in: [...studentIds] }, skillId: { in: [...skillIds] } }, { select: ["studentId", "skillId", "score", "isMastered", "masteredAt", "updatedAt"] });
}
const msOf = (v: unknown): number => (v === null || v === undefined || v === "" ? 0 : v instanceof Date ? v.getTime() : new Date(String(v)).getTime() || 0);
/**
 * Pure: student|key → the engine's best score and mastery; with `at` (ms) the mastery as it was then (mastered on or
 * before `at`: its masteredAt, else its last update).
 */
export function engineOf(rows: readonly Row[], keyOf: ReadonlyMap<string, string>, at: number | null = null): Map<string, { score: number; mastered: boolean }> {
  const eng = new Map<string, { score: number; mastered: boolean }>();
  for (const m of rows) {
    const key = keyOf.get(s(m.skillId)); if (!key) continue;
    const k = `${s(m.studentId)}|${key}`, e = eng.get(k) ?? { score: 0, mastered: false };
    const when = msOf(m.masteredAt) || msOf(m.updatedAt);
    e.score = Math.max(e.score, Number(m.score ?? 0)); e.mastered ||= Boolean(m.isMastered) && (at === null || when <= at); eng.set(k, e);
  }
  return eng;
}
/** Pure: the fallback views (student → key → view) from the counted answers and the engine's mastery. */
export function fallbackFrom(counts: ReadonlyMap<string, Counted>, eng: ReadonlyMap<string, { score: number; mastered: boolean }>): Map<string, Map<string, StarView>> {
  const out = new Map<string, Map<string, StarView>>();
  for (const [k, c] of counts) {
    const i = k.indexOf("|"), sid = k.slice(0, i), key = k.slice(i + 1);
    const v = fallbackView(key, c, eng.get(k));
    if (v.status === "NOT_STARTED") continue;
    const m = out.get(sid) ?? new Map<string, StarView>(); m.set(key, v); out.set(sid, m);
  }
  return out;
}

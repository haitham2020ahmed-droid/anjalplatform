/**
 * 🎯 ReadRise — WHAT COUNTS, in one place (owner, round 4). Pure, tiny imports (safe from engine.ts, reports, the
 * skill-evidence feed and the stars clean-up alike).
 *
 *  First try   ONLY the first try of an article counts. A re-read (firstTry = false) is practice: it never changes
 *              the level, the weekly goal, the level window or the stars.
 *  Stretch     the same article one version higher. It counts (as a first try of NEW questions) only when the
 *              stretch version's question band (LOW / MID / HIGH) differs from the band of the first read — the same
 *              band would reuse the questions (and the answers) the student has already been shown.
 *  Reliable    an Unreliable run (2+ rapid answers, accuracy.ts) counts for nothing anywhere.
 *  Read time   a run read faster than RR_MIN_READ_SECONDS is a rapid run: no skill evidence and no level window.
 *  Article     ONE definition for every count and average: a reliable, scored, non-stretch first try. Stretch
 *              readings are counted on their own line (stretchRuns).
 *  Accuracy    ONE tally (tallyRuns + tallyAnswers): counted first tries of reliable runs, rapid answers left out,
 *              question skills normalised to the question types (question-type.ts).
 */
import { normalizeQuestionType } from "./question-type";

type R = Record<string, unknown>;
const s = (v: unknown) => String(v ?? "");

/** a ReadRise run read faster than this (seconds) is a rapid run: it feeds no skill and does not count for the level */
export const RR_MIN_READ_SECONDS = 45;

export const isFirst = (r: R): boolean => r.firstTry === true || r.firstTry === 1;
export const isStretch = (r: R): boolean => r.stretch === true || r.stretch === 1;
/** A run marked Unreliable (2+ rapid answers). */
export const isUnreliableRun = (r: R): boolean => r.unreliable === true || r.unreliable === 1;
/** the activity was scored */
export const scoredRun = (r: R): boolean => !!r.completedAt && r.score !== null && r.score !== undefined;
/** read faster than RR_MIN_READ_SECONDS (0 / unknown = not judged) */
export const rapidRead = (r: R): boolean => Number(r.readSeconds ?? 0) > 0 && Number(r.readSeconds) < RR_MIN_READ_SECONDS;

/** The rapid question numbers stored on a run (RRRun.answerMs.rapid), [] when none. */
export function storedRapid(v: unknown): number[] {
  const o = typeof v === "string" ? (() => { try { return JSON.parse(v) as unknown; } catch { return null; } })() : v;
  const r = o && typeof o === "object" ? (o as { rapid?: unknown }).rapid : null;
  return Array.isArray(r) ? r.map(Number).filter((n) => Number.isInteger(n)) : [];
}
/** The stored per-question times (RRRun.answerMs.ms: question number → ms), {} when none. */
export function storedMs(v: unknown): Record<string, number> {
  const o = typeof v === "string" ? (() => { try { return JSON.parse(v) as unknown; } catch { return null; } })() : v;
  const m = o && typeof o === "object" ? (o as { ms?: unknown }).ms : null;
  const out: Record<string, number> = {};
  if (m && typeof m === "object") for (const [k, x] of Object.entries(m as R)) { const n = Number(x); if (Number.isFinite(n) && n >= 0) out[k] = n; }
  return out;
}

const pairKey = (r: R) => `${s(r.studentId)}|${s(r.articleId)}`;

/** The band of each article's FIRST read (the non-stretch first try), by student + article. */
export function firstReadBands(runs: readonly R[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of runs) if (isFirst(r) && !isStretch(r) && s(r.band)) out.set(pairKey(r), s(r.band));
  return out;
}

/**
 * A run that COUNTS as a first try: the non-stretch first try of the article, or the stretch first try when its
 * band differs from the first read's band (new questions). `firstBand` = the first read's band (firstReadBands).
 */
export function isCountedTry(r: R, firstBand: string | null | undefined): boolean {
  if (!isFirst(r)) return false;
  if (!isStretch(r)) return true;
  return !!firstBand && !!s(r.band) && s(r.band) !== firstBand;
}

/** The runs (of any students) that count as first tries — the first-read bands are taken from the same rows. */
export function countedTries<T extends R>(runs: readonly T[]): T[] {
  const bands = firstReadBands(runs);
  return runs.filter((r) => isCountedTry(r, bands.get(pairKey(r))));
}

/** The stretch is allowed (and fed to the stars) only when its band differs from the first read's band. */
export const stretchInNewBand = (firstBand: string | null | undefined, stretchBand: string): boolean => !!firstBand && firstBand !== stretchBand;

// ------------------------------------------------------------------ the ONE article definition

/** An article = a reliable, scored, non-stretch first try. */
export const isArticleRun = (r: R): boolean => scoredRun(r) && isFirst(r) && !isStretch(r) && !isUnreliableRun(r);
/** The articles (reliable non-stretch first tries) of the rows. */
export function articleRuns<T extends R>(runs: readonly T[]): T[] { return runs.filter(isArticleRun); }
/** The stretch readings that count (their own line): reliable, scored, a first try in a new band. */
export function stretchRuns<T extends R>(runs: readonly T[]): T[] {
  return countedTries(runs).filter((r) => isStretch(r) && scoredRun(r) && !isUnreliableRun(r));
}

// ------------------------------------------------------------------ the ONE accuracy tally

/** The runs whose answers count for accuracy: scored, counted first tries (stretch only in a new band), reliable. */
export function tallyRuns<T extends R>(runs: readonly T[]): T[] {
  return countedTries(runs).filter((r) => scoredRun(r) && !isUnreliableRun(r));
}

export interface TallyQuestion { number: number; answer: string; skill: string }
/** the questions of an article's band (questionKeys rows, or an answer-key map) */
export type QuestionsOf = (articleId: string, band: string) => readonly TallyQuestion[];
export interface TallyRun { studentId?: unknown; articleId?: unknown; band?: unknown; answers?: unknown; answerMs?: unknown; rapid?: number[] }
export interface TalliedAnswer { studentId: string; articleId: string; type: string; ok: boolean }

/** questionKeys() rows (article → its questions of every band) as a QuestionsOf. */
export const keyRowsLookup = (key: ReadonlyMap<string, readonly { band: string; number: number; answer: string; skill: string }[]>): QuestionsOf =>
  (articleId, band) => (key.get(articleId) ?? []).filter((q) => q.band === band);

/** A normalised question type (central-idea, detail, inference …); an unknown skill counts as a detail question. */
export const normalisedSkill = (skill: unknown): string => normalizeQuestionType(skill) ?? "detail";

/**
 * Every careful answer of the runs, in run order: rapid answers (the run's `rapid`, else RRRun.answerMs.rapid) and
 * unanswered questions are left out; the skill is normalised. Callers pick the runs with tallyRuns (or pass runs
 * already chosen, e.g. in tests).
 */
export function tallyAnswers(runs: readonly (TallyRun | R)[], questionsOf: QuestionsOf): TalliedAnswer[] {
  const out: TalliedAnswer[] = [];
  for (const r of runs) {
    let raw: unknown = r.answers;
    if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = {}; } }
    const answers = (raw && typeof raw === "object" ? raw : {}) as R;
    const skip = new Set(Array.isArray(r.rapid) ? (r.rapid as unknown[]).map(Number) : storedRapid(r.answerMs));
    const qs = [...questionsOf(s(r.articleId), s(r.band))].sort((a, b) => a.number - b.number);
    for (const q of qs) {
      if (skip.has(q.number)) continue;
      const chosen = s(answers[String(q.number)]).trim().toUpperCase();
      if (!chosen) continue;
      out.push({ studentId: s(r.studentId), articleId: s(r.articleId), type: normalisedSkill(q.skill), ok: chosen === s(q.answer).trim().toUpperCase() });
    }
  }
  return out;
}

/** [correct, total] per group (e.g. by type, by student|type, by standard). */
export function tallyBy(answers: readonly TalliedAnswer[], group: (a: TalliedAnswer) => string): Map<string, [number, number]> {
  const m = new Map<string, [number, number]>();
  for (const a of answers) { const k = group(a); const c = m.get(k) ?? [0, 0]; c[0] += a.ok ? 1 : 0; c[1]++; m.set(k, c); }
  return m;
}

/**
 * 🎯 ReadRise — WHAT COUNTS, in one place (owner, round 4). Pure, tiny imports (safe from engine.ts, reports, the
 * skill-evidence feed and the stars clean-up alike).
 *
 *  First try   ONLY the first try of an article counts. A re-read (firstTry = false) is practice: it never changes
 *              the level, the weekly goal, the level window or the stars.
 *  Stretch     the same article one version higher (round 5, owner). It counts FULLY (level window, weekly goal,
 *              stars) when it uses NEW questions: the article's stretch set for that band (RRQuestion band "S-L" /
 *              "S-M" / "S-H", stored on the run as its band) or — the old rule — a question band (LOW / MID / HIGH)
 *              different from the first read's. A stretch in the SAME band without a stretch set reuses the questions
 *              already shown: it is PRACTICE — it can earn the weekly goal (one credit per article: the first try OR
 *              the stretch, never both) but never the level window or the stars.
 *  Status      ONE article status (articleStatus): NEW / IN_PROGRESS / FINISH_STEPS / DONE, from the first try only.
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

/** A run's time for "earliest" (startedAt, else completedAt; unknown = last). */
const runTime = (r: R): number => {
  for (const v of [r.startedAt, r.completedAt]) {
    if (v === null || v === undefined || v === "") continue;
    const t = v instanceof Date ? v.getTime() : new Date(s(v)).getTime();
    if (Number.isFinite(t)) return t;
  }
  return Infinity;
};

/**
 * 🔒 Round 5: ONE first try and ONE stretch per student × article — when a race (double tap, two tabs) or old data left
 * two runs marked firstTry, only the EARLIEST main first try and the EARLIEST stretch first try count. Other rows
 * (re-reads, not first) pass through unchanged. Keeps the input order.
 */
export function earliestFirsts<T extends R>(runs: readonly T[]): T[] {
  const keep = new Map<string, T>();
  for (const r of runs) {
    if (!isFirst(r)) continue;
    const k = `${pairKey(r)}|${isStretch(r) ? "S" : "M"}`, have = keep.get(k);
    if (!have || runTime(r) < runTime(have)) keep.set(k, r);
  }
  const kept = new Set<T>(keep.values());
  return runs.filter((r) => !isFirst(r) || kept.has(r));
}

/** The band of each article's FIRST read (the earliest non-stretch first try), by student + article. */
export function firstReadBands(runs: readonly R[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of earliestFirsts(runs)) if (isFirst(r) && !isStretch(r) && s(r.band)) out.set(pairKey(r), s(r.band));
  return out;
}

/** The stretch question sets: RRQuestion / RRRun band "S-L" | "S-M" | "S-H" (4 new questions per band). */
export const STRETCH_SET_PREFIX = "S-";
export const isStretchSetBand = (band: unknown): boolean => s(band).startsWith(STRETCH_SET_PREFIX);
/** The stretch set band of a question band: LOW → S-L, MID → S-M, HIGH → S-H. */
export const stretchSetBand = (band: string): string => `${STRETCH_SET_PREFIX}${s(band).replace(/^S-/, "").charAt(0)}`;
/** The question band (LOW / MID / HIGH) a run's band belongs to — a stretch set band maps back to its band (prompts, key words). */
export const baseBand = (band: unknown): string => {
  const b = s(band);
  if (!isStretchSetBand(b)) return b;
  return ({ L: "LOW", M: "MID", H: "HIGH" } as Record<string, string>)[b.slice(2)] ?? b;
};

/**
 * Does a stretch with this band count fully (new questions)? A stretch set band always does; otherwise only a band
 * different from the first read's (`firstBand`).
 */
export const stretchCountsFully = (firstBand: string | null | undefined, stretchBand: string): boolean =>
  isStretchSetBand(stretchBand) || (!!firstBand && !!s(stretchBand) && firstBand !== stretchBand);

/**
 * A run that COUNTS as a first try: the non-stretch first try of the article, or the stretch first try with NEW
 * questions (a stretch set, or a band different from the first read's). `firstBand` = the first read's band.
 */
export function isCountedTry(r: R, firstBand: string | null | undefined): boolean {
  if (!isFirst(r)) return false;
  if (!isStretch(r)) return true;
  return stretchCountsFully(firstBand, s(r.band));
}

/** A PRACTICE stretch: the stretch first try that reused the first read's questions (same band, no stretch set). */
export function isPracticeStretch(r: R, firstBand: string | null | undefined): boolean {
  return isFirst(r) && isStretch(r) && !isCountedTry(r, firstBand);
}

/** The runs (of any students) that count as first tries — the first-read bands are taken from the same rows. */
export function countedTries<T extends R>(runs: readonly T[]): T[] {
  const bands = firstReadBands(runs);
  return earliestFirsts(runs).filter((r) => isCountedTry(r, bands.get(pairKey(r))));
}

/** @deprecated round 4 name — a stretch counts fully with a stretch set or in a new band (stretchCountsFully). */
export const stretchInNewBand = (firstBand: string | null | undefined, stretchBand: string): boolean => stretchCountsFully(firstBand, stretchBand);

/**
 * 🎯 The weekly-goal readings (round 5): ONE credit per article — the earliest reliable, careful (not read faster
 * than RR_MIN_READ_SECONDS), scored 75%+ run among its first try and its stretch (counted or practice). A re-read
 * never. Returns one run per student + article.
 */
export function goalRuns<T extends R>(runs: readonly T[], minScore = 75): T[] {
  const best = new Map<string, T>();
  const t = (r: R) => { const v = r.completedAt; const d = v instanceof Date ? v.getTime() : new Date(s(v)).getTime(); return Number.isFinite(d) ? d : Infinity; };
  for (const r of earliestFirsts(runs)) {
    if (!isFirst(r) || !scoredRun(r) || isUnreliableRun(r) || rapidRead(r) || Number(r.score) < minScore) continue;
    const k = pairKey(r), have = best.get(k);
    if (!have || t(r) < t(have)) best.set(k, r);
  }
  return [...best.values()];
}

// ------------------------------------------------------------------ the ONE article status

export type ArticleStatus = "NEW" | "IN_PROGRESS" | "FINISH_STEPS" | "DONE";
/** The words students see for each status (library, article page, My Work). */
export const ARTICLE_STATUS_LABEL: Record<ArticleStatus, string> = { NEW: "New", IN_PROGRESS: "In progress", FINISH_STEPS: "Finish steps 4–5", DONE: "Done" };

/** The article's first try (the first non-stretch reading), or null. */
export function firstTryRun<T extends R>(runs: readonly T[]): T | null {
  const main = runs.filter((r) => !isStretch(r));
  const first = main.find(isFirst);
  if (first) return first;
  const t = (r: R) => new Date(s(r.startedAt)).getTime() || 0;
  return main.length ? [...main].sort((a, b) => t(a) - t(b))[0] : null;
}

/**
 * 🏷 ONE article status (round 5), from the FIRST TRY only — re-reads and stretch runs never change it:
 *   NEW           no first try yet
 *   IN_PROGRESS   the first try is started, its activity (step 3) is not submitted
 *   FINISH_STEPS  the activity is scored, steps 4–5 are still open
 *   DONE          the first try finished all 5 steps
 * `runs` = one student's runs of ONE article (columns: step, score, completedAt, firstTry, stretch, startedAt).
 */
export function articleStatus(runs: readonly R[]): ArticleStatus {
  const first = firstTryRun(runs);
  if (!first) return "NEW";
  if (s(first.step) === "DONE") return "DONE";
  if (scoredRun(first) || s(first.step) === "WRITE" || s(first.step) === "POSTPOLL") return "FINISH_STEPS";
  return "IN_PROGRESS";
}

// ------------------------------------------------------------------ the ONE article definition

/**
 * An article = a reliable, scored, non-stretch first try. Round 5: a run read faster than RR_MIN_READ_SECONDS is not
 * an article read either (callers that never read RRRun.readSeconds treat every run as read carefully).
 */
export const isArticleRun = (r: R): boolean => scoredRun(r) && isFirst(r) && !isStretch(r) && !isUnreliableRun(r) && !rapidRead(r);
/** The articles (reliable non-stretch first tries) of the rows. */
export function articleRuns<T extends R>(runs: readonly T[]): T[] { return earliestFirsts(runs).filter(isArticleRun); }
/** The stretch readings that count (their own line): reliable, scored, a first try with new questions. */
export function stretchRuns<T extends R>(runs: readonly T[]): T[] {
  return countedTries(runs).filter((r) => isStretch(r) && scoredRun(r) && !isUnreliableRun(r));
}

// ------------------------------------------------------------------ the ONE accuracy tally

/** The runs whose answers count for accuracy: scored, counted first tries (stretch only with new questions), reliable. */
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

/**
 * 🔁 Automatic re-classification of bank questions from students' real answers (runs in the daily job).
 *
 *   1. Which questions: those with new answers by this school's students since the last run (SchoolSetting
 *      "reclassify.last"), in pages of 200, reading only the last 365 days of answers.
 *   2. What counts: each student's FIRST answer to the question only — never a retry — and not when that first
 *      answer was a rapid guess or used a hint (attempt.usedHint, or the session's hintQuestionId is the question).
 *      Per GRADE separately (the student's grade) → QuestionGradeStat.
 *   3. The basis for the level (the question's OWN grade only; other grades are information):
 *        - % right among students of that grade whose level is On (the platform's evidence level; with no data,
 *          ability θ between −0.75 and 0.75) — needs 30+ such answers;
 *        - else, with 30+ answers in all, every student of the grade but ONLY answers from non-adaptive work
 *          (teacher sets, Weekly Checks, Diagnostic, tests: session mode ≠ ADAPTIVE_PRACTICE), because the adaptive
 *          engine gives hard questions to strong students — needs 30+ such answers;
 *        - else nothing changes.
 *   4. Thresholds: >80% right → Below · 40–80% → On · <40% → Above, with 2 points of hysteresis and at most one
 *      change per question per 7 days. Difficulty 1–7 in step: >90 → 2, 80–90 → 3, 40–80 → 4, 25–40 → 5, <25 → 6
 *      (an authored 1 or 7 is kept while consistent). irtB follows LEVEL_TO_B unless the question is calibrated.
 *   5. A level a person set (difficultySource MANUAL/TEACHER — the question editor sets MANUAL when the level changes;
 *      or, unless the source is ESTIMATE/DATA, metaReviewedAt / tags.review VERIFIED) is never
 *      changed: a suggestion goes to AI Tools → Review (tool INTEL, kind DIFFICULTY); approval is logged APPROVED.
 *   6. Every change is logged in QuestionLevelChange with a readable reason.
 *   7. A question in a Curriculum Map level section the data disagrees with → suggestion (kind MAP_LEVEL) only.
 *   8. Alerts (30+ first answers): KEY_SUSPECT, DISTRACTOR_MAGNET, NEGATIVE_DISCRIMINATION, TOO_EASY, SLOW.
 *      KEY_SUSPECT and NEGATIVE_DISCRIMINATION hold the question out of adaptive practice (held-back.ts).
 *   9. Weekly: the school admins get one notification with the number of new alerts; the IRT calibration
 *      (src/server/jobs/item-analysis.ts) also runs once a week from here.
 */
import { LEVEL_TO_B } from "../../config/engine";
import { audit } from "../audit";
import { bumpBankVersion } from "../cache/bank-version";
import { log } from "../monitoring/log";
import { ForbiddenError, type Actor } from "../auth/rbac";
import type { Repo, Row } from "../seeding/repo";

const DAY = 86_400_000;
const PAGE = 200;
export const WINDOW_DAYS = 365;
/** first answers needed before anything is decided */
export const MIN_RESPONSES = 30;
export const HYSTERESIS = 2;
export const CHANGE_EVERY_DAYS = 7;
export const MANUAL_SOURCES = ["MANUAL", "TEACHER"];
export const LAST_RUN_KEY = "reclassify.last";
export const NOTICE_KEY = "reclassify.notice";
export const CALIBRATION_KEY = "items.calibration.last";

export type Level = "BELOW" | "ON" | "ABOVE";
export type Basis = "ON_LEVEL_STUDENTS" | "ALL_STUDENTS";
export type AlertKind = "KEY_SUSPECT" | "DISTRACTOR_MAGNET" | "NEGATIVE_DISCRIMINATION" | "TOO_EASY" | "SLOW";
export const HOLD_KINDS: ReadonlySet<AlertKind> = new Set(["KEY_SUSPECT", "NEGATIVE_DISCRIMINATION"]);
export const LEVEL_NAME: Record<Level, string> = { BELOW: "Approaching", ON: "Meeting", ABOVE: "Exceeding" };

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => (v instanceof Date ? v.getTime() : v ? new Date(s(v)).getTime() : 0);
const json = <T>(v: unknown, dflt: T): T => { if (v === null || v === undefined || v === "") return dflt; if (typeof v !== "string") return v as T; try { return JSON.parse(v) as T; } catch { return dflt; } };
const r1 = (x: number) => Math.round(x * 10) / 10;
const chunks = <T>(a: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; };
const tagsOf = (q: Row): Record<string, unknown> => json<Record<string, unknown>>(q.tags, {}) ?? {};

// ------------------------------------------------------------------ pure rules

export const levelOfDifficulty = (d: number): Level => (d <= 3 ? "BELOW" : d >= 5 ? "ABOVE" : "ON");

/** The difficulty step for a % right: >90 → 2, 80–90 → 3, 40–80 → 4, 25–40 → 5, <25 → 6. */
export function difficultyStep(pct: number): number {
  if (pct > 90) return 2;
  if (pct > 80) return 3;
  if (pct >= 40) return 4;
  if (pct >= 25) return 5;
  return 6;
}

/** The level the data points to, from the current one, with 2 points of hysteresis at each edge (80 and 40). */
export function nextLevel(current: Level, pct: number): Level {
  if (current === "ON") return pct > 80 + HYSTERESIS ? "BELOW" : pct < 40 - HYSTERESIS ? "ABOVE" : "ON";
  if (current === "BELOW") return pct < 80 - HYSTERESIS ? (pct < 40 - HYSTERESIS ? "ABOVE" : "ON") : "BELOW";
  return pct > 40 + HYSTERESIS ? (pct > 80 + HYSTERESIS ? "BELOW" : "ON") : "ABOVE";
}

/** The new level and difficulty (1–7) for a question at difficulty `d` answered right by `pct`%. */
export function decide(d: number, pct: number): { level: Level; difficulty: number } {
  const cur = levelOfDifficulty(d);
  const level = nextLevel(cur, pct);
  const clamp = (x: number) => (level === "ON" ? 4 : level === "BELOW" ? Math.min(3, Math.max(2, x)) : Math.max(5, Math.min(6, x)));
  if (level !== cur) return { level, difficulty: clamp(difficultyStep(pct)) };
  // same level: move the step only when clearly past a step edge (±2), never out of the level
  const a = difficultyStep(pct + HYSTERESIS), b = difficultyStep(pct - HYSTERESIS);
  let next = a === b ? clamp(a) : d;
  if (levelOfDifficulty(next) !== cur) next = d;
  if ((d === 1 && next === 2) || (d === 7 && next === 6)) next = d; // an authored extreme that the data agrees with
  return { level, difficulty: next };
}

/** Levels that came from an estimate or from the data itself: they change automatically even after a review. */
export const AUTO_SOURCES = ["ESTIMATE", "DATA"];

/** A level a person set is never changed automatically (a suggestion is made instead). */
export function isManualLevel(q: Row): boolean {
  const src = s(q.difficultySource).toUpperCase();
  if (MANUAL_SOURCES.includes(src)) return true;
  if (AUTO_SOURCES.includes(src)) return false; // AI-estimated (even when the estimate was approved) or set by this job
  if (q.metaReviewedAt) return true;
  const review = tagsOf(q).review as { status?: unknown } | undefined;
  return s(review?.status).toUpperCase() === "VERIFIED";
}

export interface Response { studentId: string; correct: boolean; ms: number; chosen: string | null; ability: number | null; onLevel: boolean; nonAdaptive: boolean; at: number }
export interface GradeStat {
  responses: number; correct: number; pct: number; responsesOnLevel: number; pctOnLevel: number | null;
  optionShares: Record<string, number> | null; discrimination: number | null; discN: number; medianMs: number | null;
  nonAdaptive: { responses: number; pct: number | null };
}

const median = (xs: number[]): number | null => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y), m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };

/** Point-biserial correlation of right/wrong with ability (null without both groups or spread). */
export function pointBiserial(rs: { correct: boolean; ability: number }[]): number | null {
  const n = rs.length;
  if (n < 2) return null;
  const right = rs.filter((r) => r.correct), wrong = rs.filter((r) => !r.correct);
  if (!right.length || !wrong.length) return null;
  const mean = rs.reduce((t, r) => t + r.ability, 0) / n;
  const sd = Math.sqrt(rs.reduce((t, r) => t + (r.ability - mean) ** 2, 0) / n);
  if (sd === 0) return null;
  const m1 = right.reduce((t, r) => t + r.ability, 0) / right.length, m0 = wrong.reduce((t, r) => t + r.ability, 0) / wrong.length;
  const p = right.length / n;
  return Math.round(((m1 - m0) / sd) * Math.sqrt(p * (1 - p)) * 1000) / 1000;
}

/** The statistics of one question for one grade, from its first answers. `wrongLabels`: the wrong options. */
export function gradeStat(rs: Response[], wrongLabels: string[]): GradeStat {
  const n = rs.length, correct = rs.filter((r) => r.correct).length;
  const on = rs.filter((r) => r.onLevel), na = rs.filter((r) => r.nonAdaptive);
  const withAbility = rs.filter((r) => r.ability !== null).map((r) => ({ correct: r.correct, ability: r.ability as number }));
  let optionShares: Record<string, number> | null = null;
  if (wrongLabels.length && n) {
    optionShares = {};
    for (const l of wrongLabels) optionShares[l] = Math.round((rs.filter((r) => r.chosen === l).length / n) * 1000) / 1000;
  }
  const med = median(rs.map((r) => r.ms).filter((x) => x > 0));
  return {
    responses: n, correct, pct: n ? r1((100 * correct) / n) : 0,
    responsesOnLevel: on.length, pctOnLevel: on.length ? r1((100 * on.filter((r) => r.correct).length) / on.length) : null,
    optionShares, discrimination: pointBiserial(withAbility), discN: withAbility.length, medianMs: med === null ? null : Math.round(med),
    nonAdaptive: { responses: na.length, pct: na.length ? r1((100 * na.filter((r) => r.correct).length) / na.length) : null },
  };
}

/** The basis for the level: on-level students (30+), else every student's non-adaptive answers (30+), else none. */
export function basisOf(st: GradeStat): { basis: Basis; pct: number; responses: number } | null {
  if (st.responsesOnLevel >= MIN_RESPONSES && st.pctOnLevel !== null) return { basis: "ON_LEVEL_STUDENTS", pct: st.pctOnLevel, responses: st.responsesOnLevel };
  if (st.responses >= MIN_RESPONSES && st.nonAdaptive.responses >= MIN_RESPONSES && st.nonAdaptive.pct !== null) return { basis: "ALL_STUDENTS", pct: st.nonAdaptive.pct, responses: st.nonAdaptive.responses };
  return null;
}

/** The alert conditions met by one grade's statistics (30+ first answers). `slowRef` = the median time of similar questions. */
export function alertsFor(st: GradeStat, grade: number, slowRef: number | null): { kind: AlertKind; detail: string; data: Record<string, unknown> }[] {
  if (st.responses < MIN_RESPONSES) return [];
  const out: { kind: AlertKind; detail: string; data: Record<string, unknown> }[] = [];
  const who = `${st.responses} Grade ${grade} students`;
  if (st.pct < 20) out.push({ kind: "KEY_SUSPECT", detail: `Only ${Math.round(st.pct)}% of ${who} answered right on their first try — the answer key may be wrong.`, data: { pct: st.pct, responses: st.responses } });
  const magnet = Object.entries(st.optionShares ?? {}).sort((a, b) => b[1] - a[1])[0];
  if (magnet && magnet[1] > 0.5) out.push({ kind: "DISTRACTOR_MAGNET", detail: `Wrong option ${magnet[0]} was chosen by ${Math.round(magnet[1] * 100)}% of ${who}.`, data: { option: magnet[0], share: magnet[1], responses: st.responses } });
  if (st.discrimination !== null && st.discrimination < -0.1 && st.discN >= 50) out.push({ kind: "NEGATIVE_DISCRIMINATION", detail: `Strong students get it wrong more often than weaker ones (discrimination ${st.discrimination.toFixed(2)} on ${st.discN} answers).`, data: { discrimination: st.discrimination, responses: st.discN } });
  if (st.pct > 95) out.push({ kind: "TOO_EASY", detail: `${Math.round(st.pct)}% of ${who} answered right on their first try — it tells little about them.`, data: { pct: st.pct, responses: st.responses } });
  if (slowRef && st.medianMs !== null && st.medianMs > 2.5 * slowRef) out.push({ kind: "SLOW", detail: `Students take ${Math.round(st.medianMs / 1000)} s on it (median), ${r1(st.medianMs / slowRef)}× similar Grade ${grade} questions (${Math.round(slowRef / 1000)} s).`, data: { medianMs: st.medianMs, reference: slowRef } });
  return out;
}

export function changeReason(o: { from: Level; to: Level; fromD: number; toD: number; pct: number; responses: number; basis: Basis; grade: number }): string {
  const who = o.basis === "ON_LEVEL_STUDENTS" ? `${o.responses} on-level Grade ${o.grade} students` : `${o.responses} Grade ${o.grade} students (assigned sets, Weekly Checks and tests only)`;
  const head = o.from === o.to ? `Still ${LEVEL_NAME[o.to]}` : `Was ${LEVEL_NAME[o.from]}`;
  const tail = o.from === o.to ? `difficulty ${o.fromD} → ${o.toD}` : `${LEVEL_NAME[o.to]}${o.fromD !== o.toD ? ` (difficulty ${o.fromD} → ${o.toD})` : ""}`;
  return `${head}; ${Math.round(o.pct)}% of ${who} answered right on their first try → ${tail}`.slice(0, 400);
}

// ------------------------------------------------------------------ database side

async function setting(repo: Repo, schoolId: string, key: string): Promise<Record<string, unknown> | null> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key }))[0];
  return row ? json<Record<string, unknown>>(row.value, {}) : null;
}
const saveSetting = (repo: Repo, schoolId: string, key: string, value: Record<string, unknown>) =>
  repo.upsert("SchoolSetting", { schoolId, key }, { schoolId, key, value, updatedBy: null }, { value });

/** The question's own grade: skill → curriculum → grade. */
async function ownGrades(repo: Repo, qs: Row[]): Promise<Map<string, number>> {
  const skills = await repo.findMany("Skill", { id: { in: [...new Set(qs.map((q) => s(q.skillId)))] } }, { select: ["id", "curriculumId"] });
  const curs = skills.length ? await repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => s(k.curriculumId)))] } }, { select: ["id", "gradeId"] }) : [];
  const grades = curs.length ? await repo.findMany("Grade", { id: { in: [...new Set(curs.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] }) : [];
  const gradeOfCur = new Map(curs.map((c) => [s(c.id), Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0)]));
  const gradeOfSkill = new Map(skills.map((k) => [s(k.id), gradeOfCur.get(s(k.curriculumId)) ?? 0]));
  return new Map(qs.map((q) => [s(q.id), gradeOfSkill.get(s(q.skillId)) ?? 0]));
}

interface Entry { questionId: string; grade: number; stat: GradeStat; sinceResolved: Map<string, GradeStat> }

export interface ReclassifyResult { questions: number; stats: number; changed: number; suggested: number; mapSuggested: number; newAlerts: number }

/** Re-classifies this school's questions that have new answers since the last run. */
export async function runReclassify(repo: Repo, schoolId: string, now = new Date()): Promise<ReclassifyResult> {
  const res: ReclassifyResult = { questions: 0, stats: 0, changed: 0, suggested: 0, mapSuggested: 0, newAlerts: 0 };
  const students = await repo.findMany("Student", { schoolId }, { select: ["id", "gradeId"] });
  if (!students.length) return res;
  const gradeRows = await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] });
  const levelOfGrade = new Map(gradeRows.map((g) => [s(g.id), Number(g.level)]));
  const gradeOf = new Map(students.map((x) => [s(x.id), levelOfGrade.get(s(x.gradeId)) ?? 0]));
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * DAY);
  const last = await setting(repo, schoolId, LAST_RUN_KEY);
  const since = last?.at ? new Date(Math.max(time(last.at), windowStart.getTime())) : windowStart;

  // 1. the questions with new answers since the last run — only this school's own questions (a stat row is per
  //    question and grade, so another school's question is never written from here)
  const changed = new Set<string>();
  for (const ids of chunks([...gradeOf.keys()], 500)) {
    for (const a of await repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["questionId"] })) changed.add(s(a.questionId));
  }
  const mySkills = await schoolSkillIds(repo, gradeRows);
  const questionIds: string[] = [];
  for (const part of chunks([...changed], 1000)) for (const q of await repo.findMany("Question", { id: { in: part } }, { select: ["id", "skillId"] })) if (mySkills.has(s(q.skillId))) questionIds.push(s(q.id));
  questionIds.sort();
  res.questions = questionIds.length;

  // 2. statistics per question and grade (pages of 200)
  const levelCache = new Map<string, Level | null>();
  const abilityCache = new Map<string, number | null>();
  const entries: Entry[] = [];
  for (const page of chunks(questionIds, PAGE)) entries.push(...(await statsPage(repo, schoolId, page, gradeOf, levelCache, abilityCache, windowStart, now)));
  res.stats = entries.length;

  // 3. alerts, levels and map suggestions (pages of 200 questions)
  const slowRef = await slowReferences(repo, [...new Set(entries.map((e) => e.grade))], mySkills);
  const byQ = new Map<string, Entry[]>();
  for (const e of entries) byQ.set(e.questionId, [...(byQ.get(e.questionId) ?? []), e]);
  let holds = false;
  for (const page of chunks([...byQ.keys()], PAGE)) {
    const r = await decidePage(repo, schoolId, page, byQ, slowRef, now);
    res.changed += r.changed; res.suggested += r.suggested; res.mapSuggested += r.mapSuggested; res.newAlerts += r.newAlerts; holds ||= r.holds;
  }
  if (res.changed || holds) bumpBankVersion();
  await saveSetting(repo, schoolId, LAST_RUN_KEY, { at: now.toISOString(), ...res });
  return res;
}

async function statsPage(repo: Repo, schoolId: string, ids: string[], gradeOf: Map<string, number>, levelCache: Map<string, Level | null>, abilityCache: Map<string, number | null>, windowStart: Date, now: Date): Promise<Entry[]> {
  const [attempts, options, resolved] = await Promise.all([
    repo.findMany("QuestionAttempt", { questionId: { in: ids }, createdAt: { gte: windowStart } }, { select: ["id", "sessionId", "studentId", "questionId", "isCorrect", "responseMs", "usedHint", "rapidGuess", "response", "createdAt"] }),
    repo.findMany("QuestionOption", { questionId: { in: ids } }, { select: ["questionId", "label", "isCorrect"] }),
    repo.findMany("QuestionAlert", { questionId: { in: ids }, status: "RESOLVED" }, { select: ["questionId", "grade", "kind", "resolvedAt"] }),
  ]);
  // each student's FIRST answer to each question (this school's students only); retries never count
  const first = new Map<string, Row>();
  for (const a of attempts) {
    if (!gradeOf.has(s(a.studentId))) continue;
    const k = `${s(a.studentId)}|${s(a.questionId)}`;
    const cur = first.get(k);
    if (!cur || time(a.createdAt) < time(cur.createdAt) || (time(a.createdAt) === time(cur.createdAt) && Number(a.id) < Number(cur.id))) first.set(k, a);
  }
  if (!first.size) return [];
  const firsts = [...first.values()];
  const sessions = new Map<string, Row>();
  for (const part of chunks([...new Set(firsts.map((a) => s(a.sessionId)))], 1000)) for (const x of await repo.findMany("PracticeSession", { id: { in: part } }, { select: ["id", "mode", "hintQuestionId"] })) sessions.set(s(x.id), x);
  // clean first answers: no rapid guess, no hint
  const clean = firsts.filter((a) => !a.rapidGuess && !a.usedHint && s(sessions.get(s(a.sessionId))?.hintQuestionId) !== s(a.questionId));
  if (!clean.length) return [];
  // ability before the answer (decision log), else the student's overall ability
  const pre = new Map<string, number>();
  for (const part of chunks(clean.map((a) => a.id), 1000)) for (const l of await repo.findMany("AdaptiveDecisionLog", { attemptId: { in: part } }, { select: ["attemptId", "previousTheta"] })) if (l.previousTheta !== null && l.previousTheta !== undefined) pre.set(s(l.attemptId), Number(l.previousTheta));
  const need = [...new Set(clean.map((a) => s(a.studentId)))].filter((id) => !abilityCache.has(id));
  for (const part of chunks(need, 500)) {
    const rows = await repo.findMany("StudentAbility", { studentId: { in: part }, scope: "GLOBAL" }, { select: ["studentId", "theta", "responses"] });
    for (const id of part) { const r = rows.find((x) => s(x.studentId) === id); abilityCache.set(id, r && Number(r.responses) > 0 ? Number(r.theta) : null); }
  }
  await fillLevels(repo, schoolId, [...new Set(clean.map((a) => s(a.studentId)))], gradeOf, levelCache, now);

  const groups = new Map<string, { qid: string; grade: number; rs: Response[] }>();
  for (const a of clean) {
    const sid = s(a.studentId), qid = s(a.questionId), grade = gradeOf.get(sid) ?? 0;
    const ability = pre.get(s(a.id)) ?? abilityCache.get(sid) ?? null;
    const level = levelCache.get(sid) ?? null;
    const onLevel = level ? level === "ON" : ability !== null && ability > -0.75 && ability < 0.75;
    const v = json<{ value?: unknown } | null>(a.response, null)?.value;
    const r: Response = { studentId: sid, correct: Boolean(a.isCorrect), ms: Number(a.responseMs) || 0, chosen: typeof v === "string" ? v.toUpperCase() : null, ability, onLevel, nonAdaptive: s(sessions.get(s(a.sessionId))?.mode) !== "ADAPTIVE_PRACTICE", at: time(a.createdAt) };
    const k = `${qid}|${grade}`;
    let g = groups.get(k); if (!g) groups.set(k, (g = { qid, grade, rs: [] }));
    g.rs.push(r);
  }
  const out: Entry[] = [];
  for (const g of groups.values()) {
    const wrong = options.filter((o) => s(o.questionId) === g.qid && !o.isCorrect).map((o) => s(o.label).toUpperCase());
    const stat = gradeStat(g.rs, wrong);
    const row = { responses: stat.responses, correct: stat.correct, pct: stat.pct, responsesOnLevel: stat.responsesOnLevel, pctOnLevel: stat.pctOnLevel, optionShares: stat.optionShares, discrimination: stat.discrimination, medianMs: stat.medianMs };
    await repo.upsert("QuestionGradeStat", { questionId: g.qid, grade: g.grade }, { questionId: g.qid, grade: g.grade, ...row }, row);
    // a resolved alert re-opens only when the answers given AFTER it was resolved show the problem again
    const sinceResolved = new Map<string, GradeStat>();
    for (const al of resolved.filter((x) => s(x.questionId) === g.qid && Number(x.grade) === g.grade)) sinceResolved.set(s(al.kind), gradeStat(g.rs.filter((r) => r.at > time(al.resolvedAt)), wrong));
    out.push({ questionId: g.qid, grade: g.grade, stat, sinceResolved });
  }
  return out;
}

/** Each student's current level (the platform's evidence level); null when there is no data (θ is used instead). */
async function fillLevels(repo: Repo, schoolId: string, ids: string[], gradeOf: Map<string, number>, cache: Map<string, Level | null>, now: Date): Promise<void> {
  const need = ids.filter((id) => !cache.has(id));
  if (!need.length) return;
  const { evidenceLevels } = await import("../curriculum-map/evidence-level");
  const byGrade = new Map<number, string[]>();
  for (const id of need) byGrade.set(gradeOf.get(id) ?? 0, [...(byGrade.get(gradeOf.get(id) ?? 0) ?? []), id]);
  for (const [grade, list] of byGrade) for (const part of chunks(list, 500)) {
    const ev = await evidenceLevels(repo, schoolId, part, grade, {}, now).catch((e) => { log("error", "reclassify.levels.failed", { schoolId, error: e }); return new Map(); });
    for (const id of part) { const x = ev.get(id); cache.set(id, x && x.from !== "NO_DATA" ? (x.level as Level) : null); }
  }
}

/** The skills of this school's curricula (a question belongs to the school of its skill). */
async function schoolSkillIds(repo: Repo, gradeRows: Row[]): Promise<Set<string>> {
  if (!gradeRows.length) return new Set();
  const curs = await repo.findMany("Curriculum", { gradeId: { in: gradeRows.map((g) => s(g.id)) } }, { select: ["id"] });
  const skills = curs.length ? await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => s(c.id)) } }, { select: ["id"] }) : [];
  return new Set(skills.map((k) => s(k.id)));
}

/** The median time of this school's questions of the same type and grade (3+ questions with 30+ answers), per "typeId|grade". */
async function slowReferences(repo: Repo, grades: number[], mySkills: Set<string>): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!grades.length) return out;
  const all = (await repo.findMany("QuestionGradeStat", { grade: { in: grades }, responses: { gte: MIN_RESPONSES } }, { select: ["questionId", "grade", "medianMs"] })).filter((x) => x.medianMs !== null && x.medianMs !== undefined);
  const typeOf = new Map<string, string>();
  for (const part of chunks([...new Set(all.map((x) => s(x.questionId)))], 1000)) for (const q of await repo.findMany("Question", { id: { in: part } }, { select: ["id", "typeId", "skillId"] })) if (mySkills.has(s(q.skillId))) typeOf.set(s(q.id), s(q.typeId));
  const stats = all.filter((x) => typeOf.has(s(x.questionId)));
  const lists = new Map<string, number[]>();
  for (const x of stats) { const k = `${typeOf.get(s(x.questionId)) ?? ""}|${Number(x.grade)}`; lists.set(k, [...(lists.get(k) ?? []), Number(x.medianMs)]); }
  for (const [k, xs] of lists) if (xs.length >= 3) out.set(k, median(xs)!);
  return out;
}

async function decidePage(repo: Repo, schoolId: string, ids: string[], byQ: Map<string, Entry[]>, slowRef: Map<string, number>, now: Date): Promise<{ changed: number; suggested: number; mapSuggested: number; newAlerts: number; holds: boolean }> {
  const out = { changed: 0, suggested: 0, mapSuggested: 0, newAlerts: 0, holds: false };
  const [qs, alerts, open, changes, links] = await Promise.all([
    repo.findMany("Question", { id: { in: ids }, deletedAt: null }),
    repo.findMany("QuestionAlert", { questionId: { in: ids } }),
    repo.findMany("AiSuggestion", { schoolId, tool: "INTEL", status: "SUGGESTED", questionId: { in: ids } }, { select: ["questionId", "kind"] }),
    repo.findMany("QuestionLevelChange", { questionId: { in: ids }, createdAt: { gte: new Date(now.getTime() - CHANGE_EVERY_DAYS * DAY) } }, { select: ["questionId"] }),
    repo.findMany("QuestionMapLink", { questionId: { in: ids } }, { select: ["questionId", "nodeId"] }),
  ]);
  const own = await ownGrades(repo, qs);
  const pending = new Set(open.map((o) => `${s(o.questionId)}|${s(o.kind)}`));
  const recent = new Set(changes.map((c) => s(c.questionId)));
  const nodes = links.length ? await repo.findMany("CurriculumMapNode", { id: { in: [...new Set(links.map((l) => s(l.nodeId)))] } }, { select: ["id", "parentId", "level", "title"] }) : [];
  const siblings = nodes.some((n) => n.level && n.parentId) ? await repo.findMany("CurriculumMapNode", { parentId: { in: [...new Set(nodes.filter((n) => n.level && n.parentId).map((n) => s(n.parentId)))] }, acceptsQuestions: true }, { select: ["id", "parentId", "level", "title"] }) : [];

  for (const q of qs) {
    const qid = s(q.id);
    // ⚠️ alerts, every grade
    for (const e of byQ.get(qid) ?? []) {
      for (const a of alertsFor(e.stat, e.grade, slowRef.get(`${s(q.typeId)}|${e.grade}`) ?? null)) {
        const ex = alerts.find((x) => s(x.questionId) === qid && Number(x.grade) === e.grade && s(x.kind) === a.kind);
        const hold = HOLD_KINDS.has(a.kind);
        if (!ex) {
          await repo.create("QuestionAlert", { questionId: qid, grade: e.grade, kind: a.kind, detail: a.detail.slice(0, 400), data: a.data, status: "OPEN", heldBack: hold, resolvedById: null, resolvedAt: null, createdAt: now });
          out.newAlerts++; out.holds ||= hold;
        } else if (s(ex.status) === "OPEN") {
          await repo.updateMany("QuestionAlert", { id: ex.id }, { detail: a.detail.slice(0, 400), data: { ...json<Record<string, unknown>>(ex.data, {}), ...a.data } });
        } else if (s(ex.status) === "RESOLVED") {
          const after = e.sinceResolved.get(a.kind);
          if (after && alertsFor(after, e.grade, slowRef.get(`${s(q.typeId)}|${e.grade}`) ?? null).some((x) => x.kind === a.kind)) {
            await repo.updateMany("QuestionAlert", { id: ex.id }, { status: "OPEN", heldBack: hold, resolvedAt: null, resolvedById: null, detail: a.detail.slice(0, 400), data: { ...a.data, reopenedAt: now.toISOString() } });
            out.newAlerts++; out.holds ||= hold;
          }
        } // DISMISSED stays dismissed
      }
    }
    // 🔁 the level: the question's OWN grade only
    const grade = own.get(qid) ?? 0;
    const e = (byQ.get(qid) ?? []).find((x) => x.grade === grade);
    const b = e ? basisOf(e.stat) : null;
    if (!e || !b) continue;
    const d = Number(q.difficultyLevel) || 4;
    const from = levelOfDifficulty(d);
    const next = decide(d, b.pct);
    const reason = changeReason({ from, to: next.level, fromD: d, toD: next.difficulty, pct: b.pct, responses: b.responses, basis: b.basis, grade });
    if (next.difficulty !== d && !recent.has(qid)) {
      if (isManualLevel(q)) {
        if (next.level !== from && !pending.has(`${qid}|DIFFICULTY`)) {
          await repo.create("AiSuggestion", {
            schoolId, jobId: null, tool: "INTEL", kind: "DIFFICULTY", questionId: qid, passageId: null, severity: 2,
            detail: `${reason}. The level was set by a person, so it is not changed automatically. Approve = use level ${next.difficulty} (${LEVEL_NAME[next.level]}).`,
            data: { from: d, to: next.difficulty, fromLevel: from, toLevel: next.level, pct: b.pct, responses: b.responses, basis: b.basis, grade, source: "DATA" }, status: "SUGGESTED", createdAt: now,
          });
          pending.add(`${qid}|DIFFICULTY`); out.suggested++;
        }
      } else {
        const calibrated = Boolean(q.calibrated);
        await repo.updateMany("Question", { id: qid }, { difficultyLevel: next.difficulty, ...(calibrated ? {} : { irtB: LEVEL_TO_B[next.difficulty], difficultySource: "DATA" }) });
        await repo.create("QuestionLevelChange", { questionId: qid, grade, fromLevel: from, toLevel: next.level, fromDifficulty: d, toDifficulty: next.difficulty, pct: b.pct, responses: b.responses, basis: b.basis, source: "AUTO", reason, approvedById: null, createdAt: now });
        await audit(repo, { actorId: null, action: "question.reclassify", entityType: "Question", entityId: qid, before: { difficultyLevel: d, level: from }, after: { difficultyLevel: next.difficulty, level: next.level, pct: b.pct, responses: b.responses, basis: b.basis }, at: now });
        recent.add(qid); out.changed++;
      }
    }
    // 🗺 Curriculum Map level sections: a suggestion only, never moved automatically
    if (pending.has(`${qid}|MAP_LEVEL`)) continue;
    for (const l of links.filter((x) => s(x.questionId) === qid)) {
      const node = nodes.find((n) => n.id === l.nodeId);
      if (!node?.level || !node.parentId) continue;
      const cur = s(node.level) as Level;
      const want = nextLevel(cur, b.pct);
      if (want === cur) continue;
      const to = siblings.find((n) => s(n.parentId) === s(node.parentId) && s(n.level) === want);
      if (!to) continue;
      const who = b.basis === "ON_LEVEL_STUDENTS" ? `${b.responses} on-level Grade ${grade} students` : `${b.responses} Grade ${grade} students (assigned sets, Weekly Checks and tests only)`;
      await repo.create("AiSuggestion", {
        schoolId, jobId: null, tool: "INTEL", kind: "MAP_LEVEL", questionId: qid, passageId: null, severity: 3,
        detail: `In the Curriculum Map section “${s(node.title)}” (${LEVEL_NAME[cur]}), but ${Math.round(b.pct)}% of ${who} answered right on their first try → it fits ${LEVEL_NAME[want]}. Approve = move it to “${s(to.title)}”.`,
        data: { from: cur, to: want, fromNodeId: s(node.id), toNodeId: s(to.id), pct: b.pct, responses: b.responses, basis: b.basis, grade, source: "DATA" }, status: "SUGGESTED", createdAt: now,
      });
      pending.add(`${qid}|MAP_LEVEL`); out.mapSuggested++;
      break;
    }
  }
  return out;
}

// ------------------------------------------------------------------ approval (AI Tools → Review)

/** Applies an approved data suggestion (called from src/server/ai/jobs.ts apply()). Logs QuestionLevelChange APPROVED. */
export async function applyDataSuggestion(repo: Repo, actor: Actor, sg: Row, now = new Date()): Promise<void> {
  const d = json<Record<string, unknown>>(sg.data, {});
  const qid = s(sg.questionId);
  const q = qid ? await repo.findUnique("Question", { id: qid }) : null;
  if (!q) return;
  if (s(sg.kind) === "MAP_LEVEL") {
    const toNode = d.toNodeId ? await repo.findUnique("CurriculumMapNode", { id: s(d.toNodeId) }) : null;
    if (!toNode) return;
    await repo.deleteMany("QuestionMapLink", { questionId: qid, nodeId: s(d.fromNodeId) });
    await repo.upsert("QuestionMapLink", { questionId: qid, nodeId: s(toNode.id) }, { questionId: qid, nodeId: s(toNode.id), createdById: actor.userId, createdAt: now }, {});
    bumpBankVersion();
    return;
  }
  const to = Number(d.to), fromD = Number(q.difficultyLevel);
  if (!(to >= 1 && to <= 7) || to === fromD) return;
  await repo.updateMany("Question", { id: qid }, { difficultyLevel: to, ...(q.calibrated ? {} : { irtB: LEVEL_TO_B[to] }) });
  await repo.create("QuestionLevelChange", {
    questionId: qid, grade: Number(d.grade) || 0, fromLevel: levelOfDifficulty(fromD), toLevel: levelOfDifficulty(to), fromDifficulty: fromD, toDifficulty: to,
    pct: Number(d.pct) || 0, responses: Number(d.responses) || 0, basis: s(d.basis) === "ALL_STUDENTS" ? "ALL_STUDENTS" : "ON_LEVEL_STUDENTS", source: "APPROVED",
    reason: `Approved: ${s(sg.detail).split(". The level was set by a person")[0]}`.slice(0, 400), approvedById: actor.userId, createdAt: now,
  });
  bumpBankVersion();
}

// ------------------------------------------------------------------ admin actions on alerts

async function alertInSchool(repo: Repo, actor: Actor, id: string): Promise<Row> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only school admins can review question alerts.");
  const al = await repo.findUnique("QuestionAlert", { id });
  if (!al) throw new ForbiddenError("Not found.");
  const q = await repo.findUnique("Question", { id: s(al.questionId) });
  const k = q ? await repo.findUnique("Skill", { id: s(q.skillId) }) : null;
  const c = k ? await repo.findUnique("Curriculum", { id: s(k.curriculumId) }) : null;
  const g = c ? await repo.findUnique("Grade", { id: s(c.gradeId) }) : null;
  if (!g || s(g.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Not found.");
  return al;
}

/** Resolve (fixed) or dismiss (not a problem) an alert; both release the hold. */
export async function setAlertStatus(repo: Repo, actor: Actor, id: string, status: "RESOLVED" | "DISMISSED", now = new Date()): Promise<void> {
  const al = await alertInSchool(repo, actor, id);
  await repo.updateMany("QuestionAlert", { id }, { status, heldBack: false, resolvedById: actor.userId, resolvedAt: now });
  await audit(repo, { actorId: actor.userId, action: `question.alert.${status.toLowerCase()}`, entityType: "QuestionAlert", entityId: id, after: { questionId: s(al.questionId), kind: s(al.kind) }, at: now });
  bumpBankVersion();
}

/** Puts the question back into adaptive practice while the alert stays open. */
export async function releaseHold(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<void> {
  const al = await alertInSchool(repo, actor, id);
  await repo.updateMany("QuestionAlert", { id }, { heldBack: false });
  await audit(repo, { actorId: actor.userId, action: "question.alert.release", entityType: "QuestionAlert", entityId: id, after: { questionId: s(al.questionId), kind: s(al.kind) }, at: now });
  bumpBankVersion();
}

// ------------------------------------------------------------------ the daily step

/** Weekly: one notification to the school admins with the number of new alerts since the last one. */
async function weeklyNotice(repo: Repo, schoolId: string, newAlerts: number, now: Date): Promise<boolean> {
  const v = (await setting(repo, schoolId, NOTICE_KEY)) ?? { at: now.toISOString(), count: 0 };
  const count = Number(v.count ?? 0) + newAlerts;
  if (now.getTime() - time(v.at) < 7 * DAY) { await saveSetting(repo, schoolId, NOTICE_KEY, { at: v.at, count }); return false; }
  if (count > 0) {
    const admins = await repo.findMany("User", { schoolId, role: "SCHOOL_ADMIN", isActive: true }, { select: ["id"] });
    for (const a of admins) await repo.create("Notification", { userId: a.id, type: "REPORT_APPROVAL", title: "⚠️ Question alerts this week", body: `${count} new question alert${count === 1 ? "" : "s"} from students' answers (possible wrong keys, misleading options, too easy or slow questions). Review them in Question Quality → Alerts.`, link: "/admin/item-quality?tab=alerts", readAt: null, createdAt: now });
  }
  await saveSetting(repo, schoolId, NOTICE_KEY, { at: now.toISOString(), count: 0 });
  return count > 0;
}

/** The IRT calibration (weekly worker) also runs from the daily job, at most once a week for the platform. */
async function weeklyCalibration(repo: Repo, schoolId: string, now: Date): Promise<boolean> {
  const marks = await repo.findMany("SchoolSetting", { key: CALIBRATION_KEY }, { select: ["value"] });
  if (marks.some((m) => now.getTime() - time(json<Record<string, unknown>>(m.value, {}).at) < 7 * DAY)) return false;
  await saveSetting(repo, schoolId, CALIBRATION_KEY, { at: now.toISOString() });
  const { runItemAnalysis } = await import("../jobs/item-analysis");
  const r = await runItemAnalysis(repo, {}, now);
  await saveSetting(repo, schoolId, CALIBRATION_KEY, { at: now.toISOString(), ...r });
  return true;
}

/** The daily step: re-classify, then (weekly) calibrate and tell the admins. A failing part never stops the others. */
export async function questionDataDaily(repo: Repo, schoolId: string, now = new Date()): Promise<ReclassifyResult & { calibrated: boolean; notified: boolean }> {
  const r = await runReclassify(repo, schoolId, now);
  const calibrated = await weeklyCalibration(repo, schoolId, now).catch((e) => { log("error", "reclassify.calibration.failed", { schoolId, error: e }); return false; });
  const notified = await weeklyNotice(repo, schoolId, r.newAlerts, now).catch((e) => { log("error", "reclassify.notice.failed", { schoolId, error: e }); return false; });
  return { ...r, calibrated, notified };
}

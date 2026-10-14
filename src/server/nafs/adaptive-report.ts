/**
 * 🇸🇦 NAFS center → Adaptive → REPORT (owner r69): a clear, organised analysis of every adaptive practice of the
 * teacher's Grade 6 classes (an admin: the school's) —
 *   - summary: practices, students who practised, answers, accuracy, skills mastered, time;
 *   - per class: who practised, accuracy, mastery;
 *   - per standard / skill: students, answers, accuracy, mastered, the level reached (Easy / Medium / Hard), time per answer;
 *   - per student: practices, answers, accuracy, skills mastered, the hardest level reached, time, the trend (accuracy
 *     practice by practice), strengths (mastered) and what to work on (tried, not mastered, low accuracy).
 * Light: two bounded reads (the practices, their runs) — the per-target numbers are read from each run's saved adaptive
 * state, never from the answer table. NAFS tables only (the platform's levels are never read).
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { assertNafs } from "../teacher/nafs-access";
import { safeIfBehind } from "../db/schema-errors";
import { MOE_BY_CODE, SKILL_BY_CODE, type Difficulty } from "./framework";
import { json, nafsClasses } from "./tests";
import { averageOf, cellOf, classLine, roundPct, strengthsWeaknesses, WEAKNESS_BELOW, type Cell, type ClassLine, type NoneWhy } from "./strengths";
import type { RunState } from "./practice";

const s = (v: unknown) => String(v ?? "");
const ms = (v: unknown): number => { const t = (v instanceof Date ? v : new Date(s(v))).getTime(); return Number.isFinite(t) ? t : 0; };

export const MAX_ADAPTIVE_PRACTICES = 300;
export const MAX_ADAPTIVE_RUNS = 6000;
/** Under this accuracy (with at least 2 answers) a standard / skill is "to work on" — the ONE NAFS rule (strengths.ts). */
export const WORK_ON_BELOW = WEAKNESS_BELOW;

export type Reached = 0 | Difficulty;
export interface TargetRow { code: string; short: string; name: string; students: number; answers: number; pct: number | null; mastered: number; reached: Record<Reached, number>; secPerAnswer: number | null }
/**
 * r70: score = right ÷ answers; wrong = answers − right; finishedAll = every practice the student started is finished;
 * strengths (≥ 80 %) / workOn (< 60 %) per standard or skill with at least 2 answers (strengths.ts — never "mastered
 * only": a student at 88 % shows the standard as a strength).
 */
export interface StudentRow { id: string; name: string; classId: string; className: string; practices: number; finished: number; finishedAll: boolean; answers: number; right: number; wrong: number; pct: number | null; mastered: number; tried: number; best: Reached; seconds: number; trend: (number | null)[]; strengths: string[]; workOn: string[]; strengthWhy: NoneWhy | null; weaknessWhy: NoneWhy | null }
/** pct = all the class's answers pooled; average = the mean of the students' scores (each student once). */
export interface ClassRow { id: string; name: string; students: number; practised: number; answers: number; right: number; wrong: number; pct: number | null; average: number | null; finished: number; masteryPct: number | null; strongest: string | null; weakest: string | null; strongestWhy: NoneWhy | null; weakestWhy: NoneWhy | null }
export interface AdaptiveReport {
  classId: string | null;
  summary: { practices: number; students: number; runs: number; finished: number; answers: number; right: number; wrong: number; pct: number | null; average: number | null; finishedStudents: number; strongest: string | null; weakest: string | null; mastered: number; targetRuns: number; seconds: number };
  classes: ClassRow[]; targets: TargetRow[]; students: StudentRow[];
  /** r70: the class line of everything shown (finished = students who finished every practice they started) */
  cls: ClassLine;
}

const shortOf = (code: string) => MOE_BY_CODE.get(code)?.short ?? SKILL_BY_CODE.get(code)?.name ?? code;
const nameOf = (code: string) => MOE_BY_CODE.get(code)?.text ?? SKILL_BY_CODE.get(code)?.name ?? code;

/** The report from the practices and their runs (pure: the tests build it from rows). */
export function buildAdaptiveReport(practices: Row[], runs: Row[], classes: { id: string; name: string; students: { id: string; name: string }[] }[], classId: string | null): AdaptiveReport {
  const pDate = new Map(practices.map((p) => [s(p.id), ms(p.createdAt)]));
  const nameOfStudent = new Map(classes.flatMap((c) => c.students.map((x) => [x.id, x.name] as const)));
  const classOfStudent = new Map(classes.flatMap((c) => c.students.map((x) => [x.id, c] as const)));
  const tAcc = new Map<string, { students: Set<string>; n: number; right: number; mastered: Set<string>; best: Map<string, Reached>; ms: number }>();
  const sAcc = new Map<string, { runs: Row[]; n: number; right: number; mastered: Set<string>; tried: Map<string, { n: number; right: number; mastered: boolean }>; best: Reached; seconds: number; finished: number }>();
  let answers = 0, right = 0, finished = 0, mastered = 0, targetRuns = 0, seconds = 0;
  for (const r of runs) {
    const sid = s(r.studentId);
    const st = json<RunState | null>(r.state, null);
    const asked = Number(r.asked ?? 0), correct = Number(r.correct ?? 0), sec = Number(r.seconds ?? 0);
    answers += asked; right += correct; seconds += sec; if (r.finishedAt) finished++;
    const me = sAcc.get(sid) ?? { runs: [] as Row[], n: 0, right: 0, mastered: new Set<string>(), tried: new Map(), best: 0 as Reached, seconds: 0, finished: 0 };
    me.runs.push(r); me.n += asked; me.right += correct; me.seconds += sec; if (r.finishedAt) me.finished++;
    for (const [code, x] of Object.entries(st?.targets ?? {})) {
      if (!x || !Number(x.n)) continue;
      targetRuns++; if (x.mastered) mastered++;
      const ta = tAcc.get(code) ?? { students: new Set<string>(), n: 0, right: 0, mastered: new Set<string>(), best: new Map<string, Reached>(), ms: 0 };
      ta.students.add(sid); ta.n += Number(x.n); ta.right += Number(x.right); ta.ms += Number(x.ms ?? 0);
      if (x.mastered) ta.mastered.add(sid);
      const reached = ([0, 1, 2, 3].includes(Number(x.reached)) ? Number(x.reached) : 0) as Reached;
      if (reached > (ta.best.get(sid) ?? 0)) ta.best.set(sid, reached); else if (!ta.best.has(sid)) ta.best.set(sid, reached);
      tAcc.set(code, ta);
      const tr = me.tried.get(code) ?? { n: 0, right: 0, mastered: false };
      tr.n += Number(x.n); tr.right += Number(x.right); tr.mastered ||= Boolean(x.mastered);
      me.tried.set(code, tr);
      if (x.mastered) me.mastered.add(code);
      if (reached > me.best) me.best = reached;
    }
    sAcc.set(sid, me);
  }
  const targets: TargetRow[] = [...tAcc].map(([code, x]) => {
    const reached = { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<Reached, number>;
    for (const v of x.best.values()) reached[v]++;
    return { code, short: shortOf(code), name: nameOf(code), students: x.students.size, answers: x.n, pct: roundPct(x.right, x.n), mastered: x.mastered.size, reached, secPerAnswer: x.n ? Math.round(x.ms / 1000 / x.n) : null };
  }).sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || b.answers - a.answers || a.code.localeCompare(b.code));
  const students: StudentRow[] = [...sAcc].map(([id, x]) => {
    const c = classOfStudent.get(id);
    const ordered = [...x.runs].sort((a, b) => (pDate.get(s(a.practiceId)) ?? ms(a.startedAt)) - (pDate.get(s(b.practiceId)) ?? ms(b.startedAt)));
    const tried = [...x.tried];
    const sw = strengthsWeaknesses(tried.map(([k, t]) => [k, cellOf(t.right, t.n)] as [string, Cell]));
    return {
      id, name: nameOfStudent.get(id) ?? "Student", classId: c?.id ?? s(x.runs[0]?.classId), className: c?.name ?? "", practices: x.runs.length, finished: x.finished, finishedAll: x.runs.length > 0 && x.finished === x.runs.length,
      answers: x.n, right: x.right, wrong: x.n - x.right, pct: roundPct(x.right, x.n), mastered: x.mastered.size, tried: tried.length, best: x.best, seconds: x.seconds,
      trend: ordered.filter((r) => Number(r.asked ?? 0) > 0).slice(-8).map((r) => roundPct(Number(r.correct ?? 0), Number(r.asked ?? 0))),
      strengths: sw.strengths, workOn: sw.weaknesses, strengthWhy: sw.topWhy, weaknessWhy: sw.weakWhy,
    };
  }).sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
  const shown = classId ? classes.filter((c) => c.id === classId) : classes;
  // pooled per standard / skill (answers of the students shown) for the strongest / weakest of a class and of all
  const pooled = (ids: Set<string>): Map<string, Cell> => {
    const m = new Map<string, { right: number; n: number }>();
    for (const [sid, x] of sAcc) if (ids.has(sid)) for (const [code, t] of x.tried) { const a = m.get(code) ?? { right: 0, n: 0 }; a.right += t.right; a.n += t.n; m.set(code, a); }
    return new Map([...m].map(([k, a]) => [k, cellOf(a.right, a.n)]));
  };
  const classRows: ClassRow[] = shown.map((c) => {
    const mine = students.filter((x) => x.classId === c.id);
    const n = mine.reduce((a, x) => a + x.answers, 0);
    const r = mine.reduce((a, x) => a + x.right, 0);
    const tried = mine.reduce((a, x) => a + x.tried, 0), mast = mine.reduce((a, x) => a + x.mastered, 0);
    const cl = classLine(mine.map((x) => ({ pct: x.pct, finished: x.finishedAll })), pooled(new Set(mine.map((x) => x.id))), c.students.length);
    return { id: c.id, name: c.name, students: c.students.length, practised: mine.length, answers: n, right: r, wrong: n - r, pct: roundPct(r, n), average: cl.average, finished: cl.finished, masteryPct: roundPct(mast, tried), strongest: cl.strongest, weakest: cl.weakest, strongestWhy: cl.strongestWhy, weakestWhy: cl.weakestWhy };
  });
  const all = classLine(students.map((x) => ({ pct: x.pct, finished: x.finishedAll })), pooled(new Set(students.map((x) => x.id))), Math.max(students.length, shown.reduce((a, c) => a + c.students.length, 0)));
  return {
    classId,
    summary: { practices: practices.length, students: sAcc.size, runs: runs.length, finished, answers, right, wrong: answers - right, pct: roundPct(right, answers), average: averageOf(students.map((x) => x.pct)), finishedStudents: all.finished, strongest: all.strongest, weakest: all.weakest, mastered, targetRuns, seconds },
    classes: classRows, targets, students, cls: all,
  };
}

/** The Adaptive report of one Grade 6 class or all the actor's Grade 6 classes. Two bounded reads. */
export async function nafsAdaptiveReport(repo: Repo, actor: Actor, classId: string | null = null): Promise<AdaptiveReport> {
  await assertNafs(repo, actor);
  const all = await nafsClasses(repo, actor);
  const classes = classId ? all.filter((c) => c.id === classId) : all;
  if (classId && !classes.length) throw new ForbiddenError("Class not found.");
  if (!classes.length || !actor.schoolId) return buildAdaptiveReport([], [], classes, classId);
  const practices = await safeIfBehind("nafs.adaptive", repo.findMany("NafsPractice", { schoolId: actor.schoolId, classId: { in: classes.map((c) => c.id) }, deletedAt: null }, { select: ["id", "classId", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take: MAX_ADAPTIVE_PRACTICES }), [] as Row[]);
  const runs = practices.length ? await safeIfBehind("nafs.adaptive", repo.findMany("NafsPracticeRun", { practiceId: { in: practices.map((p) => s(p.id)) } }, { select: ["practiceId", "studentId", "classId", "state", "asked", "correct", "seconds", "startedAt", "finishedAt"], take: MAX_ADAPTIVE_RUNS }), [] as Row[]) : [];
  return buildAdaptiveReport(practices, runs, classes, classId);
}

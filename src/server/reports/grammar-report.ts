/**
 * 🔤 Grammar results (Update 39C, readiness I-23): what each class and student knows of the grade's grammar and
 * mechanics skills (curriculum skills of category GRAMMAR or MECHANICS, including the grammar-workbook skills).
 *
 * Definitions (one each, used by the page and the exports)
 *   mastery        the engine's current mastery score of the skill (StudentSkillMastery, 0–100) and band
 *   answers        saved answers on the skill in the window (QuestionAttempt, every source)
 *   accuracy       correct ÷ careful answers in the window — rapid guesses are left out (they say nothing about
 *                  grammar knowledge) and counted separately
 *   error types    the misconception recorded on each wrong answer (src/insights/misconceptions.ts)
 *   needs reteach  a student with 5+ careful answers on the skill in the window and accuracy under 60 % — or under
 *                  70 % while the engine's mastery is still under 40 (Developing or below, the WEAK_SKILL line). Current
 *                  accuracy leads: mastery lags (it needs many answers), so a student answering well now is not flagged
 *                  for an old mastery score
 *   reteach        a skill where 2+ students (or 30 %+ of those who practised) need reteach — with the most common
 *                  error and its teaching move
 */
import type { Repo, Row } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { misconceptionLabel, MISCONCEPTION_BY_CODE } from "../../insights/misconceptions";
import { studentNames } from "../insights/student-data";
import { avg, DAY, findIn, gradeSkills, pct, reportClass, reportSchool, reportStudent, s, time } from "./report-access";

export const GRAMMAR_CATEGORIES = new Set(["GRAMMAR", "MECHANICS"]);
export const RETEACH_PCT = 60;
export const RETEACH_PCT_LOW_MASTERY = 70;
export const RETEACH_LOW_MASTERY = 40;
export const RETEACH_MIN_ANSWERS = 5;

export interface GrammarCell { answers: number; careful: number; correct: number; rapid: number; accuracy: number | null; mastery: number | null; band: string | null; reteach: boolean }
export interface GrammarSkillRow { skillId: string; name: string; category: string; practised: number; answers: number; accuracy: number | null; rapid: number; avgMastery: number | null; reteach: string[]; topError: { code: string; label: string; fix: string; count: number } | null }
export interface GrammarStudentRow { studentId: string; name: string; answers: number; accuracy: number | null; avgMastery: number | null; skillsPractised: number; reteach: number; topError: string | null }
export interface ErrorRow { code: string; label: string; fix: string; count: number; students: number }
export interface ClassGrammarReport {
  classId: string; className: string; grade: number; days: number; from: string;
  summary: { students: number; practised: number; answers: number; accuracy: number | null; rapid: number; avgMastery: number | null; reteachSkills: number };
  skills: GrammarSkillRow[]; students: GrammarStudentRow[]; errors: ErrorRow[];
  /** student × skill */
  cells: Record<string, Record<string, GrammarCell>>;
  reteach: { skillId: string; name: string; students: { id: string; name: string }[]; error: string | null; move: string | null }[];
}

interface Raw { attempts: Row[]; mastery: Row[] }
async function load(repo: Repo, ids: string[], skillIds: string[], from: Date): Promise<Raw> {
  if (!ids.length || !skillIds.length) return { attempts: [], mastery: [] };
  const [attempts, mastery] = await Promise.all([
    findIn(repo, "QuestionAttempt", "studentId", ids, { skillId: { in: skillIds }, createdAt: { gte: from } }, ["studentId", "skillId", "questionId", "isCorrect", "rapidGuess", "misconception", "createdAt"]),
    findIn(repo, "StudentSkillMastery", "studentId", ids, { skillId: { in: skillIds } }, ["studentId", "skillId", "score", "band"]),
  ]);
  return { attempts, mastery };
}

function cellOf(list: Row[], m: Row | undefined): GrammarCell {
  const careful = list.filter((a) => !a.rapidGuess);
  const correct = careful.filter((a) => a.isCorrect).length;
  const accuracy = pct(correct, careful.length);
  const mastery = m ? Math.round(Number(m.score)) : null;
  const reteach = careful.length >= RETEACH_MIN_ANSWERS && accuracy !== null && (accuracy < RETEACH_PCT || (accuracy < RETEACH_PCT_LOW_MASTERY && (mastery ?? 100) < RETEACH_LOW_MASTERY));
  return { answers: list.length, careful: careful.length, correct, rapid: list.length - careful.length, accuracy, mastery, band: m ? s(m.band) : null, reteach };
}

function errorRows(attempts: Row[]): ErrorRow[] {
  const by = new Map<string, { count: number; students: Set<string> }>();
  for (const a of attempts) {
    if (a.isCorrect || a.rapidGuess || !a.misconception) continue;
    const e = by.get(s(a.misconception)) ?? { count: 0, students: new Set<string>() };
    e.count++; e.students.add(s(a.studentId)); by.set(s(a.misconception), e);
  }
  return [...by].map(([code, e]) => ({ code, label: misconceptionLabel(code), fix: MISCONCEPTION_BY_CODE.get(code)?.fix ?? "", count: e.count, students: e.students.size })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** A class's grammar results over the last `days` days. */
export async function classGrammarReport(repo: Repo, actor: Actor, classId: string, opts: { days?: number; now?: Date } = {}): Promise<ClassGrammarReport> {
  const now = opts.now ?? new Date(), days = opts.days ?? 30;
  const { klass, grade, ids } = await reportClass(repo, actor, classId);
  const from = new Date(now.getTime() - days * DAY);
  const skills = (await gradeSkills(repo, s(klass.gradeId))).filter((k) => GRAMMAR_CATEGORIES.has(s(k.category))).sort((a, b) => Number(a.sequence ?? 0) - Number(b.sequence ?? 0) || s(a.name).localeCompare(s(b.name)));
  const skillIds = skills.map((k) => s(k.id));
  const [raw, names] = await Promise.all([load(repo, ids, skillIds, from), studentNames(repo, ids)]);
  const nameOf = (id: string) => names.get(id)?.name ?? "Student";
  const cells: ClassGrammarReport["cells"] = {};
  for (const id of ids) {
    cells[id] = {};
    for (const k of skillIds) {
      const list = raw.attempts.filter((a) => s(a.studentId) === id && s(a.skillId) === k);
      const m = raw.mastery.find((x) => s(x.studentId) === id && s(x.skillId) === k);
      if (list.length || m) cells[id][k] = cellOf(list, m);
    }
  }
  const skillRows: GrammarSkillRow[] = skills.map((k) => {
    const id = s(k.id);
    const list = raw.attempts.filter((a) => s(a.skillId) === id);
    const careful = list.filter((a) => !a.rapidGuess);
    const practised = ids.filter((st) => (cells[st][id]?.answers ?? 0) > 0);
    const masteries = ids.map((st) => cells[st][id]?.mastery).filter((v): v is number => v !== null && v !== undefined);
    const err = errorRows(list)[0] ?? null;
    return {
      skillId: id, name: s(k.name), category: s(k.category), practised: practised.length, answers: list.length, accuracy: pct(careful.filter((a) => a.isCorrect).length, careful.length),
      rapid: list.length - careful.length, avgMastery: avg(masteries), reteach: ids.filter((st) => cells[st][id]?.reteach), topError: err ? { code: err.code, label: err.label, fix: err.fix, count: err.count } : null,
    };
  });
  const studentRows: GrammarStudentRow[] = ids.map((id) => {
    const cs = Object.values(cells[id]);
    const careful = cs.reduce((t, c) => t + c.careful, 0), correct = cs.reduce((t, c) => t + c.correct, 0);
    const err = errorRows(raw.attempts.filter((a) => s(a.studentId) === id))[0];
    return {
      studentId: id, name: nameOf(id), answers: cs.reduce((t, c) => t + c.answers, 0), accuracy: pct(correct, careful),
      avgMastery: avg(cs.map((c) => c.mastery).filter((v): v is number => v !== null)), skillsPractised: cs.filter((c) => c.answers > 0).length,
      reteach: cs.filter((c) => c.reteach).length, topError: err ? err.label : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const reteach = skillRows
    .filter((r) => r.reteach.length >= 2 || (r.practised > 0 && r.reteach.length / r.practised >= 0.3 && r.reteach.length > 0))
    .sort((a, b) => b.reteach.length - a.reteach.length || (a.accuracy ?? 100) - (b.accuracy ?? 100))
    .map((r) => ({ skillId: r.skillId, name: r.name, students: r.reteach.map((id) => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name)), error: r.topError?.label ?? null, move: r.topError?.fix || null }));
  const careful = raw.attempts.filter((a) => !a.rapidGuess);
  return {
    classId, className: s(klass.name), grade, days, from: from.toISOString().slice(0, 10),
    summary: {
      students: ids.length, practised: studentRows.filter((r) => r.answers > 0).length, answers: raw.attempts.length, accuracy: pct(careful.filter((a) => a.isCorrect).length, careful.length),
      rapid: raw.attempts.length - careful.length, avgMastery: avg(studentRows.map((r) => r.avgMastery).filter((v): v is number => v !== null)), reteachSkills: reteach.length,
    },
    skills: skillRows, students: studentRows, errors: errorRows(raw.attempts), cells, reteach,
  };
}

export interface StudentGrammarReport {
  studentId: string; name: string; grade: number; days: number;
  skills: (GrammarCell & { skillId: string; name: string; category: string })[];
  errors: ErrorRow[];
  recent: { at: string; skill: string; stem: string; correct: boolean; rapid: boolean; error: string | null }[];
  summary: { answers: number; accuracy: number | null; rapid: number; avgMastery: number | null; reteach: number };
}

/** One student's grammar results (staff only). */
export async function studentGrammarReport(repo: Repo, actor: Actor, studentId: string, opts: { days?: number; now?: Date } = {}): Promise<StudentGrammarReport> {
  const now = opts.now ?? new Date(), days = opts.days ?? 30;
  const st = await reportStudent(repo, actor, studentId);
  const g = await repo.findUnique("Grade", { id: st.gradeId });
  const skills = (await gradeSkills(repo, s(st.gradeId))).filter((k) => GRAMMAR_CATEGORIES.has(s(k.category)));
  const skillIds = skills.map((k) => s(k.id));
  const raw = await load(repo, [studentId], skillIds, new Date(now.getTime() - days * DAY));
  const rows = skills.map((k) => ({ skillId: s(k.id), name: s(k.name), category: s(k.category), ...cellOf(raw.attempts.filter((a) => s(a.skillId) === s(k.id)), raw.mastery.find((m) => s(m.skillId) === s(k.id))) }))
    .filter((r) => r.answers > 0 || r.mastery !== null).sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || a.name.localeCompare(b.name));
  const recentRows = [...raw.attempts].sort((a, b) => time(b.createdAt) - time(a.createdAt)).slice(0, 15);
  const qs = recentRows.length ? await repo.findMany("Question", { id: { in: [...new Set(recentRows.map((a) => s(a.questionId)))] } }, { select: ["id", "stem"] }) : [];
  const careful = raw.attempts.filter((a) => !a.rapidGuess);
  return {
    studentId, name: (await studentNames(repo, [studentId])).get(studentId)?.name ?? "Student", grade: Number(g?.level ?? 0), days,
    skills: rows, errors: errorRows(raw.attempts),
    recent: recentRows.map((a) => ({ at: new Date(time(a.createdAt)).toISOString().slice(0, 10), skill: s(skills.find((k) => k.id === a.skillId)?.name), stem: s(qs.find((q) => q.id === a.questionId)?.stem).slice(0, 140), correct: Boolean(a.isCorrect), rapid: Boolean(a.rapidGuess), error: a.misconception ? misconceptionLabel(s(a.misconception)) : null })),
    summary: { answers: raw.attempts.length, accuracy: pct(careful.filter((a) => a.isCorrect).length, careful.length), rapid: raw.attempts.length - careful.length, avgMastery: avg(rows.map((r) => r.mastery).filter((v): v is number => v !== null)), reteach: rows.filter((r) => r.reteach).length },
  };
}

export interface SchoolGrammarRow { classId: string; name: string; grade: number; students: number; practised: number; answers: number; accuracy: number | null; avgMastery: number | null; reteachSkills: number }
/** The admin's school view: one row per class (the same numbers as each class report). */
export async function schoolGrammarReport(repo: Repo, actor: Actor, opts: { days?: number; now?: Date } = {}): Promise<SchoolGrammarRow[]> {
  const schoolId = reportSchool(actor);
  const classes = await repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id"] });
  const out: SchoolGrammarRow[] = [];
  for (const c of classes) {
    const r = await classGrammarReport(repo, actor, s(c.id), opts);
    out.push({ classId: r.classId, name: r.className, grade: r.grade, students: r.summary.students, practised: r.summary.practised, answers: r.summary.answers, accuracy: r.summary.accuracy, avgMastery: r.summary.avgMastery, reteachSkills: r.summary.reteachSkills });
  }
  return out.sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
}

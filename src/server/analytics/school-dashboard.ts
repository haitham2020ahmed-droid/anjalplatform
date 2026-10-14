/**
 * 📊 School Analytics as one dashboard (owner, r67): KPI cards, two small charts, a card per class, the standards
 * lowest-first — all from ONE pass over the period's answers (read a few students at a time, never the whole school's
 * year at once), and kept while nothing it reads changes (keptWhileUnchanged), so the next visit costs no database work.
 *
 * Same rules as the school's reports (src/server/analytics/reports.ts): rapid guesses do not count; a standard is shown
 * from 5 answers; accuracy = correct / answered.
 */
import type { Period } from "../../analytics/periods";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import type { Repo, Row } from "../seeding/repo";
import { keptWhileUnchanged } from "../cache/kept";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const ms = (v: unknown) => (v instanceof Date ? v.getTime() : new Date(s(v)).getTime());
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);
const DAY = 86_400_000;
const STUDENT_CHUNK = 150;
const WEEKS = 10;

export interface DashKpis { students: number; activeWeek: number; answers: number; accuracy: number | null; mastered: number; avgMastery: number | null }
export interface DashClass { classId: string; name: string; grade: number; students: number; activeWeek: number; answers: number; accuracy: number | null; avgMastery: number | null }
export interface DashStandard { code: string; short: string; description: string; answers: number; students: number; accuracy: number }
export interface SchoolDashboard {
  period: string;
  kpis: DashKpis;
  /** answers per week, oldest first (the last WEEKS weeks) */
  weeks: { label: string; answers: number }[];
  /** accuracy by grade */
  grades: { grade: number; students: number; accuracy: number | null }[];
  classes: DashClass[];
  standards: DashStandard[];
  notAssessed: number;
}

export async function schoolDashboard(repo: Repo, actor: Actor, period: Period, now = new Date()): Promise<SchoolDashboard> {
  assertCan(actor, "analytics:school");
  if (!actor.schoolId) throw new ForbiddenError("No school selected.");
  const schoolId = actor.schoolId;
  const day = Math.floor(now.getTime() / DAY);
  return keptWhileUnchanged(repo, `school-dash:${schoolId}:${period.name}:${period.from.toISOString()}:${day}`,
    ["QuestionAttempt", "StudentSkillMastery", "ClassMembership", "Class", "Student", "Grade", "Question", "Standard"], 120_000,
    () => build(repo, schoolId, period, now));
}

async function build(repo: Repo, schoolId: string, period: Period, now: Date): Promise<SchoolDashboard> {
  const [students, grades, classes] = await Promise.all([
    repo.findMany("Student", { schoolId, deletedAt: null }, { select: ["id", "gradeId"] }),
    repo.findMany("Grade", { schoolId }, { select: ["id", "level"] }),
    repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id", "name", "gradeId"] }),
  ]);
  const members = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["classId", "studentId"] }) : [];
  const levelOf = new Map(grades.map((g) => [s(g.id), Number(g.level ?? 0)]));
  const ids = students.map((x) => s(x.id));
  const gradeOfStudent = new Map(students.map((x) => [s(x.id), levelOf.get(s(x.gradeId)) ?? 0]));

  // one pass over the period's answers, a few students at a time
  const weekStart = now.getTime() - 7 * DAY;
  const firstWeek = now.getTime() - WEEKS * 7 * DAY;
  const per = new Map<string, { answers: number; correct: number; lastAt: number }>();
  const weekly = new Array<number>(WEEKS).fill(0);
  const byQuestion = new Map<string, { answers: number; correct: number; students: Set<string> }>();
  const masteryOf = new Map<string, number[]>();
  let mastered = 0;
  for (let i = 0; i < ids.length; i += STUDENT_CHUNK) {
    const part = ids.slice(i, i + STUDENT_CHUNK);
    const [rows, mast] = await Promise.all([
      repo.findMany("QuestionAttempt", { studentId: { in: part }, createdAt: { gte: period.from, lte: period.to } }, { select: ["studentId", "questionId", "isCorrect", "rapidGuess", "createdAt"] }),
      repo.findMany("StudentSkillMastery", { studentId: { in: part } }, { select: ["studentId", "score", "isMastered"] }),
    ]);
    for (const a of rows) {
      if (a.rapidGuess) continue;
      const at = ms(a.createdAt);
      if (at < period.from.getTime() || at > period.to.getTime()) continue;
      const sid = s(a.studentId);
      const p = per.get(sid) ?? per.set(sid, { answers: 0, correct: 0, lastAt: 0 }).get(sid)!;
      p.answers++; if (a.isCorrect) p.correct++; if (at > p.lastAt) p.lastAt = at;
      if (at >= firstWeek) { const w = Math.min(WEEKS - 1, Math.floor((at - firstWeek) / (7 * DAY))); weekly[w]++; }
      const q = byQuestion.get(s(a.questionId)) ?? byQuestion.set(s(a.questionId), { answers: 0, correct: 0, students: new Set() }).get(s(a.questionId))!;
      q.answers++; if (a.isCorrect) q.correct++; q.students.add(sid);
    }
    for (const m of mast) {
      const sid = s(m.studentId);
      (masteryOf.get(sid) ?? masteryOf.set(sid, []).get(sid)!).push(Number(m.score ?? 0));
      if (m.isMastered) mastered++;
    }
  }

  // standards: each answered question's standard (1,000 questions per read)
  const qids = [...byQuestion.keys()];
  const stdOf = new Map<string, string>();
  for (let i = 0; i < qids.length; i += 1000) for (const q of await repo.findMany("Question", { id: { in: qids.slice(i, i + 1000) } }, { select: ["id", "standardId"] })) if (q.standardId) stdOf.set(s(q.id), s(q.standardId));
  const byStd = new Map<string, { answers: number; correct: number; students: Set<string> }>();
  for (const [qid, g] of byQuestion) {
    const sid = stdOf.get(qid);
    if (!sid) continue;
    const t = byStd.get(sid) ?? byStd.set(sid, { answers: 0, correct: 0, students: new Set() }).get(sid)!;
    t.answers += g.answers; t.correct += g.correct; for (const x of g.students) t.students.add(x);
  }
  const levels = [...new Set(grades.map((g) => Number(g.level ?? 0)))];
  const [stds, all] = await Promise.all([
    byStd.size ? repo.findMany("Standard", { id: { in: [...byStd.keys()] } }, { select: ["id", "code", "description"] }) : Promise.resolve([] as Row[]),
    levels.length ? repo.findMany("Standard", { framework: "CCSS_ELA", gradeLevel: { in: levels } }, { select: ["id"] }) : Promise.resolve([] as Row[]),
  ]);
  const standards = [...byStd].filter(([, g]) => g.answers >= 5).map(([sid, g]) => {
    const st = stds.find((x) => s(x.id) === sid);
    return { code: s(st?.code), short: s(st?.code).replace("CCSS.ELA-LITERACY.", ""), description: s(st?.description).slice(0, 140), answers: g.answers, students: g.students.size, accuracy: Math.round((100 * g.correct) / g.answers) };
  }).filter((x) => x.code).sort((a, b) => a.accuracy - b.accuracy || a.code.localeCompare(b.code));

  const sum = (list: string[]) => {
    let answers = 0, correct = 0, activeWeek = 0;
    const m: number[] = [];
    for (const id of list) { const p = per.get(id); if (p) { answers += p.answers; correct += p.correct; if (p.lastAt >= weekStart) activeWeek++; } const ms2 = masteryOf.get(id); if (ms2?.length) m.push(ms2.reduce((a, b) => a + b, 0) / ms2.length); }
    return { answers, correct, activeWeek, avgMastery: m.length ? Math.round(m.reduce((a, b) => a + b, 0) / m.length) : null };
  };
  const whole = sum(ids);
  const byClass = new Map<string, string[]>();
  for (const mm of members) (byClass.get(s(mm.classId)) ?? byClass.set(s(mm.classId), []).get(s(mm.classId))!).push(s(mm.studentId));
  const classRows: DashClass[] = classes.map((c) => {
    const list = byClass.get(s(c.id)) ?? [];
    const x = sum(list);
    return { classId: s(c.id), name: s(c.name), grade: levelOf.get(s(c.gradeId)) ?? 0, students: list.length, activeWeek: x.activeWeek, answers: x.answers, accuracy: pct(x.correct, x.answers), avgMastery: x.avgMastery };
  }).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
  const gradeRows = [...new Set([...gradeOfStudent.values()])].filter(Boolean).sort((a, b) => a - b).map((g) => {
    const list = ids.filter((id) => gradeOfStudent.get(id) === g);
    const x = sum(list);
    return { grade: g, students: list.length, accuracy: pct(x.correct, x.answers) };
  });
  const weekLabel = (i: number) => new Date(firstWeek + i * 7 * DAY).toISOString().slice(5, 10);
  return {
    period: period.label,
    kpis: { students: ids.length, activeWeek: whole.activeWeek, answers: whole.answers, accuracy: pct(whole.correct, whole.answers), mastered, avgMastery: whole.avgMastery },
    weeks: weekly.map((n, i) => ({ label: weekLabel(i), answers: n })),
    grades: gradeRows,
    classes: classRows,
    standards,
    notAssessed: all.filter((x) => !byStd.has(s(x.id))).length,
  };
}

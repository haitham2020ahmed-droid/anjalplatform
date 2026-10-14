/**
 * 🏫 The head of department's weekly summary: every class side by side (practice this week, accuracy, work done
 * and late, MAP on track / at risk, alerts open and handled), the weakest skills of each grade, and the totals.
 * Printable (PDF) and as Excel.
 */
import type { Repo } from "../seeding/repo";
import { isHiddenSkill } from "../skills/master";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { practiceStats, type PracticeStats } from "./student-data";
import { gradeSummary } from "./progress";
import { alertStats, weekKey } from "./alerts";
import { coordinatorGrades } from "../teacher/coordinators";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;

export interface DeptClass { classId: string; className: string; grade: number; teacher: string; students: number; activeWeek: number; activePct: number; answersWeek: number; minutesWeek: number; accuracy: number | null; done: number; late: number; tested: number; onTrack: number; atRisk: number; alertsOpen: number; alertsHandled: number; oldestOpenDays: number | null }
export interface WeakSkill { skillId: string; name: string; answers: number; accuracy: number; students: number }
export interface DeptSummary { week: string; from: string; to: string; classes: DeptClass[]; weakest: { grade: number; skills: WeakSkill[] }[]; totals: { students: number; active: number; answers: number; minutes: number; alertsOpen: number; alertsHandled: number } }

export async function departmentSummary(repo: Repo, actor: Actor, now = new Date()): Promise<DeptSummary> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN" && !(actor.role === "TEACHER" && (await coordinatorGrades(repo, actor)).length)) throw new ForbiddenError("The department summary is for the head of department and grade coordinators.");
  // ⚡ Update 57: the grade summary and the alerts side by side; every class's students in one read; the practice of
  // every student and the weakest skills of every grade side by side (before: 2 reads one after another per class)
  const [grades, alerts] = await Promise.all([gradeSummary(repo, actor, "READING", now), alertStats(repo, actor.schoolId!)]);
  const allClassIds = grades.flatMap((g) => g.classes.map((c) => c.classId));
  const members = allClassIds.length ? await repo.findMany("ClassMembership", { classId: { in: allClassIds }, leftAt: null }, { select: ["classId", "studentId"] }) : [];
  const membersOf = new Map<string, string[]>();
  for (const m of members) { const k = s(m.classId); const l = membersOf.get(k); if (l) l.push(s(m.studentId)); else membersOf.set(k, [s(m.studentId)]); }
  const gradeIdsOf = grades.map((g) => [...new Set(g.classes.flatMap((c) => membersOf.get(c.classId) ?? []))]);
  const [practice, weakestByGrade] = await Promise.all([
    practiceStats(repo, [...new Set(gradeIdsOf.flat())], now),
    Promise.all(gradeIdsOf.map((ids) => weakestSkills(repo, ids, now))),
  ]);
  const classes: DeptClass[] = [];
  const weakest: DeptSummary["weakest"] = [];
  for (const [gi, g] of grades.entries()) {
    for (const c of g.classes) {
      const ids = membersOf.get(c.classId) ?? [];
      const p = new Map<string, PracticeStats>();
      for (const id of ids) { const v = practice.get(id); if (v) p.set(id, v); }
      const answersWeek = [...p.values()].reduce((t, x) => t + x.week.answers, 0), minutesWeek = [...p.values()].reduce((t, x) => t + x.week.minutes, 0);
      const a = alerts.get(c.classId) ?? { open: 0, handled: 0, oldestOpenDays: null };
      classes.push({ classId: c.classId, className: c.className, grade: g.grade, teacher: c.teacher, students: c.students, activeWeek: c.activeWeek, activePct: c.students ? Math.round((100 * c.activeWeek) / c.students) : 0, answersWeek, minutesWeek, accuracy: c.accuracy, done: c.done, late: c.late, tested: c.tested, onTrack: c.onTrack, atRisk: c.atRisk, alertsOpen: a.open, alertsHandled: a.handled, oldestOpenDays: a.oldestOpenDays });
    }
    weakest.push({ grade: g.grade, skills: weakestByGrade[gi] });
  }
  const sum = (f: (c: DeptClass) => number) => classes.reduce((t, c) => t + f(c), 0);
  const from = new Date(now.getTime() - 7 * DAY);
  return { week: weekKey(now), from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10), classes, weakest, totals: { students: sum((c) => c.students), active: sum((c) => c.activeWeek), answers: sum((c) => c.answersWeek), minutes: sum((c) => c.minutesWeek), alertsOpen: sum((c) => c.alertsOpen), alertsHandled: sum((c) => c.alertsHandled) } };
}

/** The skills these students find hardest (last 30 days, 20+ answers, careful answers only). */
export async function weakestSkills(repo: Repo, studentIds: string[], now = new Date(), n = 5): Promise<WeakSkill[]> {
  if (!studentIds.length) return [];
  const at = await repo.findMany("QuestionAttempt", { studentId: { in: studentIds }, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }, { select: ["skillId", "studentId", "isCorrect", "rapidGuess"] });
  const by = new Map<string, { n: number; ok: number; who: Set<string> }>();
  for (const a of at) { if (a.rapidGuess) continue; const v = by.get(s(a.skillId)) ?? { n: 0, ok: 0, who: new Set<string>() }; v.n++; if (a.isCorrect) v.ok++; v.who.add(s(a.studentId)); by.set(s(a.skillId), v); }
  const all = [...by].filter(([, v]) => v.n >= 20).map(([id, v]) => ({ skillId: id, answers: v.n, accuracy: Math.round((100 * v.ok) / v.n), students: v.who.size })).sort((a, b) => a.accuracy - b.accuracy);
  // the hidden “Unclassified (Curriculum Map)” skill is never listed (readiness I-18)
  const names = all.length ? (await repo.findMany("Skill", { id: { in: all.slice(0, n + 3).map((x) => x.skillId) } }, { select: ["id", "name", "code"] })).filter((k) => !isHiddenSkill(k.code)) : [];
  const list = all.filter((x) => names.some((k) => k.id === x.skillId)).slice(0, n);
  return list.map((x) => ({ ...x, name: s(names.find((k) => k.id === x.skillId)?.name) || "Skill" }));
}

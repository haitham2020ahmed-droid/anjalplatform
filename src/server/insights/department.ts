/**
 * 🏫 The head of department's weekly summary: every class side by side (practice this week, accuracy, work done
 * and late, MAP on track / at risk, alerts open and handled), the weakest skills of each grade, and the totals.
 * Round 4: the practice numbers are the grade summary's own (one read); the weakest skills are counted by skill KEY
 * from the star sources, 25 students at a time.
 * Printable (PDF) and as Excel.
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import type { PracticeStats } from "./student-data";
import { gradeSummaryWithRows } from "./progress";
import { loadAnswers, STAR_SOURCES } from "../analytics/practice";
import { skillKeyIndex } from "../skills/status";
import { schoolOfStudents } from "../skills/star-read";
import { isHiddenSkill } from "../skills/master";
import { idsKey, sharedRead } from "../lib/shared-read";
import { alertStats, weekKey } from "./alerts";
import { coordinatorGrades } from "../teacher/coordinators";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;

export interface DeptClass { classId: string; className: string; grade: number; teacher: string; students: number; activeWeek: number; activePct: number; answersWeek: number; minutesWeek: number; accuracy: number | null; done: number; late: number; tested: number; onTrack: number; atRisk: number; alertsOpen: number; alertsHandled: number; oldestOpenDays: number | null }
export interface WeakSkill { skillId: string; name: string; answers: number; accuracy: number; students: number }
export interface DeptSummary { week: string; from: string; to: string; classes: DeptClass[]; weakest: { grade: number; skills: WeakSkill[] }[]; totals: { students: number; active: number; answers: number; minutes: number; alertsOpen: number; alertsHandled: number } }

export async function departmentSummary(repo: Repo, actor: Actor, now = new Date()): Promise<DeptSummary> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN" && !(actor.role === "TEACHER" && (await coordinatorGrades(repo, actor)).length)) throw new ForbiddenError("The department summary is for the head of department and grade coordinators.");
  // ⚡ Update 57: the grade summary and the alerts side by side; every class's students in one read.
  // 📏 round 4: the week's answers / minutes are the grade summary's OWN numbers (each student's practiceStats, read
  // once) — no second read of every student's practice; the weakest skills of each grade are read 25 students at a time
  const [{ grades, rows }, alerts] = await Promise.all([gradeSummaryWithRows(repo, actor, "READING", now), alertStats(repo, actor.schoolId!)]);
  const allClassIds = grades.flatMap((g) => g.classes.map((c) => c.classId));
  const members = allClassIds.length ? await repo.findMany("ClassMembership", { classId: { in: allClassIds }, leftAt: null }, { select: ["classId", "studentId"] }) : [];
  const membersOf = new Map<string, string[]>();
  for (const m of members) { const k = s(m.classId); const l = membersOf.get(k); if (l) l.push(s(m.studentId)); else membersOf.set(k, [s(m.studentId)]); }
  const gradeIdsOf = grades.map((g) => [...new Set(g.classes.flatMap((c) => membersOf.get(c.classId) ?? []))]);
  const practice = new Map<string, PracticeStats>([...rows].map(([id, r]) => [id, r.practice]));
  const weakestByGrade: WeakSkill[][] = [];
  for (const ids of gradeIdsOf) weakestByGrade.push(await weakestSkills(repo, ids, now));
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
  // r72 audit: the school totals count each student ONCE (a student in two classes was counted twice)
  const everyone = [...new Set(gradeIdsOf.flat())];
  const weekAgo = now.getTime() - 7 * DAY;
  const one = (f: (p: PracticeStats) => number) => Math.round(everyone.reduce((t, id) => { const p = practice.get(id); return t + (p ? f(p) : 0); }, 0));
  const totals = {
    students: everyone.length, active: everyone.filter((id) => { const l = practice.get(id)?.lastActive; return !!l && new Date(l).getTime() >= weekAgo; }).length,
    answers: one((p) => p.week.answers), minutes: one((p) => p.week.minutes), alertsOpen: sum((c) => c.alertsOpen), alertsHandled: sum((c) => c.alertsHandled),
  };
  return { week: weekKey(now), from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10), classes, weakest, totals };
}

/**
 * The skills these students find hardest (last 30 days, 20+ careful answers), one row per shared skill KEY (copies of a
 * skill are one skill), the hidden holder skill left out. 📏 Answers = the star sources of practice-totals.ts (skill
 * practice + NAFS + ReadRise), rapid guesses out. Read 25 students at a time, date-bounded; only per-key counters kept.
 */
export async function weakestSkills(repo: Repo, studentIds: string[], now = new Date(), n = 5): Promise<WeakSkill[]> {
  if (!studentIds.length) return [];
  const ids = [...new Set(studentIds)];
  // ⚡ the same grade asked again while pages are built (department → term report): read once (fresh after any write)
  return sharedRead(repo, `weakestSkills|${n}|${Math.floor(now.getTime() / 60_000)}|${idsKey(ids)}`, ["QuestionAttempt", "NafsPracticeAnswer", "SkillEvidence", "PracticeSession", "Skill"], 20_000, () => weakestUncached(repo, ids, now, n));
}

async function weakestUncached(repo: Repo, ids: string[], now: Date, n: number): Promise<WeakSkill[]> {
  const ix = await skillKeyIndex(repo, await schoolOfStudents(repo, ids));
  const keyOf = (id: string) => ix.keyOf.get(id) ?? `skill:${id}`;
  const from = new Date(now.getTime() - 30 * DAY);
  const hiddenOf = new Map<string, boolean>();
  const by = new Map<string, { n: number; ok: number; who: Set<string>; skillId: string }>();
  for (let i = 0; i < ids.length; i += 25) {
    const answers = (await loadAnswers(repo, ids.slice(i, i + 25), from, now)).filter((a) => STAR_SOURCES.includes(a.source) && !a.rapid && a.skillId);
    const unknown = [...new Set(answers.map((a) => a.skillId).filter((id) => !hiddenOf.has(id)))];
    for (let j = 0; j < unknown.length; j += 500) for (const k of await repo.findMany("Skill", { id: { in: unknown.slice(j, j + 500) } }, { select: ["id", "code"] })) hiddenOf.set(s(k.id), isHiddenSkill(k.code));
    for (const a of answers) {
      if (hiddenOf.get(a.skillId) !== false) continue; // the hidden “Unclassified (Curriculum Map)” skill is never listed (readiness I-18)
      const k = keyOf(a.skillId);
      const v = by.get(k) ?? { n: 0, ok: 0, who: new Set<string>(), skillId: a.skillId };
      v.n++; if (a.correct) v.ok++; v.who.add(a.studentId); by.set(k, v);
    }
  }
  return [...by].filter(([, v]) => v.n >= 20)
    .map(([k, v]) => ({ skillId: v.skillId, name: ix.nameOf.get(k) ?? "Skill", answers: v.n, accuracy: Math.round((100 * v.ok) / v.n), students: v.who.size }))
    .sort((a, b) => a.accuracy - b.accuracy || a.name.localeCompare(b.name)).slice(0, n);
}

/**
 * School performance summary for admins: teachers, classes and students at a glance.
 * Everything is read in a fixed number of batched queries (no per-teacher or per-class loops).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { refreshQuestionSets, refreshSkillAssignments } from "../teacher/assign";

const s = (v: unknown) => String(v ?? "");
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null);

export interface PerformanceSummary {
  totals: { teachers: number; classes: number; students: number; activeThisWeek: number; avgMastery: number | null; assignments: number; completion: number | null; overdue: number };
  teachers: { name: string; classes: string[]; students: number; assignments: number; completion: number | null; overdue: number; avgMastery: number | null }[];
  classes: { name: string; grade: number; teachers: string[]; students: number; activeThisWeek: number; avgMastery: number | null; completion: number | null; overdue: number }[];
  weakSkills: { name: string; grade: number; avgMastery: number; students: number }[];
  attention: { name: string; className: string; avgMastery: number | null; overdue: number; lastActive: string | null }[];
}

export async function schoolPerformance(repo: Repo, actor: Actor, now = new Date()): Promise<PerformanceSummary> {
  assertCan(actor, "analytics:school");
  const schoolId = actor.schoolId!;
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [classes, grades] = await Promise.all([repo.findMany("Class", { schoolId, deletedAt: null }), repo.findMany("Grade", { schoolId }, { select: ["id", "level"] })]);
  const classIds = classes.map((c) => c.id);
  const [links, members, assignments] = classIds.length ? await Promise.all([
    repo.findMany("ClassTeacher", { classId: { in: classIds } }),
    repo.findMany("ClassMembership", { classId: { in: classIds }, leftAt: null }, { select: ["classId", "studentId"] }),
    repo.findMany("Assignment", { classId: { in: classIds }, deletedAt: null }),
  ]) : [[], [], []] as Row[][];
  await Promise.all([refreshSkillAssignments(repo, assignments, null, now), refreshQuestionSets(repo, assignments, null, now)]);
  const studentIds = [...new Set(members.map((m) => s(m.studentId)))];
  const teacherIds = [...new Set(links.map((l) => s(l.teacherId)))];
  const [rows, teachers, students, mastery, recent] = await Promise.all([
    assignments.length ? repo.findMany("AssignmentStudent", { assignmentId: { in: assignments.map((a) => a.id) } }, { select: ["assignmentId", "studentId", "status"] }) : Promise.resolve([] as Row[]),
    teacherIds.length ? repo.findMany("Teacher", { id: { in: teacherIds } }, { select: ["id", "userId"] }) : Promise.resolve([] as Row[]),
    studentIds.length ? repo.findMany("Student", { id: { in: studentIds } }, { select: ["id", "userId"] }) : Promise.resolve([] as Row[]),
    studentIds.length ? repo.findMany("StudentSkillMastery", { studentId: { in: studentIds } }, { select: ["studentId", "skillId", "score"] }) : Promise.resolve([] as Row[]),
    studentIds.length ? repo.findMany("PracticeSession", { studentId: { in: studentIds }, startedAt: { gte: weekAgo } }, { select: ["studentId", "startedAt"] }) : Promise.resolve([] as Row[]),
  ]);
  const userIds = [...teachers.map((t) => t.userId), ...students.map((x) => x.userId)];
  const [users, skills] = await Promise.all([
    userIds.length ? repo.findMany("User", { id: { in: userIds } }, { select: ["id", "displayName"] }) : Promise.resolve([] as Row[]),
    mastery.length ? repo.findMany("Skill", { id: { in: [...new Set(mastery.map((m) => s(m.skillId)))] } }, { select: ["id", "name", "curriculumId"] }) : Promise.resolve([] as Row[]),
  ]);
  const curs = skills.length ? await repo.findMany("Curriculum", { id: { in: [...new Set(skills.map((k) => s(k.curriculumId)))] } }, { select: ["id", "gradeId"] }) : [];
  const nameOfUser = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  const teacherName = new Map(teachers.map((t) => [s(t.id), nameOfUser.get(s(t.userId)) ?? "Teacher"]));
  const studentName = new Map(students.map((x) => [s(x.id), nameOfUser.get(s(x.userId)) ?? "Student"]));
  const level = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  const classOfStudent = new Map(members.map((m) => [s(m.studentId), s(m.classId)]));
  // per student: average mastery, overdue count, last activity
  const studentScores = new Map<string, number[]>();
  for (const m of mastery) (studentScores.get(s(m.studentId)) ?? studentScores.set(s(m.studentId), []).get(s(m.studentId))!).push(Number(m.score ?? 0));
  const studentAvg = new Map([...studentScores].map(([id, xs]) => [id, avg(xs)]));
  const active = new Set(recent.map((r) => s(r.studentId)));
  const lastActive = new Map<string, string>();
  for (const r of recent) { const t = new Date(String(r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt)).toISOString(); if (t > (lastActive.get(s(r.studentId)) ?? "")) lastActive.set(s(r.studentId), t); }
  const classOfAssignment = new Map(assignments.map((a) => [s(a.id), s(a.classId)]));
  const overdueByStudent = new Map<string, number>();
  for (const r of rows) if (r.status === "OVERDUE") overdueByStudent.set(s(r.studentId), (overdueByStudent.get(s(r.studentId)) ?? 0) + 1);
  const statsFor = (classSet: Set<string>) => {
    const mine = rows.filter((r) => classSet.has(classOfAssignment.get(s(r.assignmentId)) ?? ""));
    const studs = members.filter((m) => classSet.has(s(m.classId))).map((m) => s(m.studentId));
    return {
      students: new Set(studs).size, assignments: assignments.filter((a) => classSet.has(s(a.classId))).length,
      completion: pct(mine.filter((r) => r.status === "COMPLETED").length, mine.length), overdue: mine.filter((r) => r.status === "OVERDUE").length,
      avgMastery: avg(studs.map((id) => studentAvg.get(id)).filter((x): x is number => x !== null && x !== undefined)),
      activeThisWeek: studs.filter((id) => active.has(id)).length,
    };
  };
  const teachersOut = teacherIds.map((tid) => {
    const mineClasses = new Set(links.filter((l) => s(l.teacherId) === tid).map((l) => s(l.classId)));
    const st = statsFor(mineClasses);
    return { name: teacherName.get(tid) ?? "Teacher", classes: classes.filter((c) => mineClasses.has(s(c.id))).map((c) => s(c.name)).sort(), students: st.students, assignments: st.assignments, completion: st.completion, overdue: st.overdue, avgMastery: st.avgMastery };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const classesOut = classes.map((c) => {
    const st = statsFor(new Set([s(c.id)]));
    return { name: s(c.name), grade: level.get(s(c.gradeId)) ?? 0, teachers: links.filter((l) => l.classId === c.id).map((l) => teacherName.get(s(l.teacherId)) ?? "Teacher"), ...st };
  }).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
  // skills with the lowest average mastery (at least 3 students practised them)
  const bySkill = new Map<string, number[]>();
  for (const m of mastery) (bySkill.get(s(m.skillId)) ?? bySkill.set(s(m.skillId), []).get(s(m.skillId))!).push(Number(m.score ?? 0));
  const gradeOfCur = new Map(curs.map((c) => [s(c.id), level.get(s(c.gradeId)) ?? 0]));
  const weakSkills = [...bySkill].filter(([, xs]) => xs.length >= 3).map(([id, xs]) => {
    const k = skills.find((x) => x.id === id);
    return { name: s(k?.name ?? "Skill"), grade: gradeOfCur.get(s(k?.curriculumId)) ?? 0, avgMastery: avg(xs)!, students: xs.length };
  }).sort((a, b) => a.avgMastery - b.avgMastery).slice(0, 8);
  const attention = studentIds.map((id) => ({ id, a: studentAvg.get(id) ?? null, o: overdueByStudent.get(id) ?? 0 }))
    .filter((x) => x.o >= 2 || (x.a !== null && x.a < 40))
    .sort((x, y) => y.o - x.o || (x.a ?? 101) - (y.a ?? 101)).slice(0, 15)
    .map((x) => ({ name: studentName.get(x.id) ?? "Student", className: s(classes.find((c) => c.id === classOfStudent.get(x.id))?.name), avgMastery: x.a, overdue: x.o, lastActive: lastActive.get(x.id) ?? null }));
  const all = statsFor(new Set(classIds.map(s)));
  return {
    totals: { teachers: teacherIds.length, classes: classes.length, students: studentIds.length, activeThisWeek: all.activeThisWeek, avgMastery: all.avgMastery, assignments: assignments.length, completion: all.completion, overdue: all.overdue },
    teachers: teachersOut, classes: classesOut, weakSkills, attention,
  };
}

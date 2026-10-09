/**
 * 🏫 Classes at a glance (admin and teacher homes): for every class the teacher(s), students, who practised this
 * week, MAP Reading (average RIT and the Below / On / Above split by percentile), MAP plans sent, open alerts —
 * every number a door to the page behind it.
 */
import type { Repo, Row } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { readableClasses } from "../teacher/coordinators";
import { mapProfiles } from "../map/map-plan";

const s = (v: unknown) => String(v ?? "");
export interface ClassRow {
  id: string; name: string; grade: number; teachers: string[]; students: number; active: number;
  map: { scored: number; avg: number | null; below: number; on: number; above: number };
  plans: { sent: number; drafts: number }; alerts: number;
}

export async function classesAtAGlance(repo: Repo, actor: Actor, now = new Date()): Promise<ClassRow[]> {
  const classes = (await readableClasses(repo, actor)).filter((c) => !c.deletedAt);
  if (!classes.length || !actor.schoolId) return [];
  const ids = classes.map((c) => s(c.id));
  const [members, cts, grades] = await Promise.all([
    repo.findMany("ClassMembership", { classId: { in: ids }, leftAt: null }, { select: ["classId", "studentId"] }),
    repo.findMany("ClassTeacher", { classId: { in: ids } }, { select: ["classId", "teacherId"] }),
    repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id", "level"] }),
  ]);
  const studentIds = [...new Set(members.map((m) => s(m.studentId)))];
  const teacherRows = cts.length ? await repo.findMany("Teacher", { id: { in: [...new Set(cts.map((c) => s(c.teacherId)))] } }, { select: ["id", "userId"] }) : [];
  const [tUsers, sessions, plans, alerts, profiles] = await Promise.all([
    teacherRows.length ? repo.findMany("User", { id: { in: teacherRows.map((t) => t.userId) } }, { select: ["id", "displayName"] }) : Promise.resolve([] as Row[]),
    studentIds.length ? repo.findMany("PracticeSession", { studentId: { in: studentIds }, startedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } }, { select: ["studentId"] }) : Promise.resolve([] as Row[]),
    repo.findMany("MapPlan", { classId: { in: ids } }, { select: ["classId", "status", "studentId", "subject"] }),
    studentIds.length ? repo.findMany("StudentAlert", { studentId: { in: studentIds }, status: "OPEN" }, { select: ["studentId"] }).catch(() => [] as Row[]) : Promise.resolve([] as Row[]),
    mapProfiles(repo, actor.schoolId, studentIds, "READING"),
  ]);
  const active = new Set(sessions.map((x) => s(x.studentId)));
  const alerted = new Set(alerts.map((x) => s(x.studentId)));
  const teacherName = (tid: string) => s(tUsers.find((u) => u.id === teacherRows.find((t) => t.id === tid)?.userId)?.displayName);
  return classes.map((c) => {
    const mine = members.filter((m) => m.classId === c.id).map((m) => s(m.studentId));
    const scored = mine.map((id) => profiles.get(id)).filter((p) => p?.overall);
    const pcts = scored.map((p) => p!.overall!.percentile);
    const cp = plans.filter((p) => p.classId === c.id);
    return {
      id: s(c.id), name: s(c.name), grade: Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0),
      teachers: cts.filter((x) => x.classId === c.id).map((x) => teacherName(s(x.teacherId))).filter(Boolean),
      students: mine.length, active: mine.filter((id) => active.has(id)).length,
      map: { scored: scored.length, avg: scored.length ? Math.round(scored.reduce((t, p) => t + p!.overall!.rit, 0) / scored.length) : null, below: pcts.filter((p) => p !== null && p <= 40).length, on: pcts.filter((p) => p !== null && p > 40 && p <= 60).length, above: pcts.filter((p) => p !== null && p > 60).length },
      plans: { sent: cp.filter((p) => p.status === "SENT").length, drafts: cp.filter((p) => p.status === "DRAFT").length },
      alerts: mine.filter((id) => alerted.has(id)).length,
    };
  }).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
}

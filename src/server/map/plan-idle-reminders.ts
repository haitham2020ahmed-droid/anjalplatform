/**
 * 🗺️ Nightly (daily.ts): a teacher alert when a student's SENT MAP plan sits fully untouched — every one of its
 * assignments still NOT_STARTED — MAP_PLAN_IDLE_DAYS+ days after it was sent. Delivered through the platform's
 * existing Notification mechanism, to the student's class teacher(s) (same channel teacherDigests and the NAFS
 * practice reminder already use — never a new one). Deduped by the plan's own link, so a plan gets at most one
 * such alert ever, not one every night the job runs, and a plan the student HAS opened (even one answer) never
 * alerts at all.
 */
import type { Repo } from "../seeding/repo";
import { studentNames } from "../insights/student-data";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown): number => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const DAY = 86_400_000;
export const MAP_PLAN_IDLE_DAYS = 5;

/** One school's nightly pass. Returns how many fresh teacher alerts it sent. */
export async function mapPlanIdleReminders(repo: Repo, schoolId: string, now = new Date()): Promise<number> {
  const cutoff = now.getTime() - MAP_PLAN_IDLE_DAYS * DAY;
  const plans = await repo.findMany("MapPlan", { schoolId, status: "SENT" }, { select: ["id", "classId", "studentId", "subject", "sentAt", "assignmentIds"] });
  const idle = plans.filter((p) => p.sentAt && time(p.sentAt) <= cutoff && Array.isArray(p.assignmentIds) && (p.assignmentIds as unknown[]).length);
  if (!idle.length) return 0;
  const assignmentIds = [...new Set(idle.flatMap((p) => (p.assignmentIds as unknown[]).map(s)))];
  const rows = assignmentIds.length ? await repo.findMany("AssignmentStudent", { assignmentId: { in: assignmentIds } }, { select: ["assignmentId", "studentId", "status"] }) : [];
  const statusOf = new Map(rows.map((r) => [`${s(r.assignmentId)}|${s(r.studentId)}`, s(r.status)]));
  // untouched = every assignment of the plan is still NOT_STARTED for this student (one real answer anywhere → no alert)
  const untouched = idle.filter((p) => (p.assignmentIds as unknown[]).map(s).every((aId) => (statusOf.get(`${aId}|${s(p.studentId)}`) ?? "NOT_STARTED") === "NOT_STARTED"));
  if (!untouched.length) return 0;
  const classIds = [...new Set(untouched.map((p) => s(p.classId)))];
  const teacherLinks = await repo.findMany("ClassTeacher", { classId: { in: classIds } }, { select: ["classId", "teacherId"] });
  const teacherIds = [...new Set(teacherLinks.map((t) => s(t.teacherId)))];
  const teachers = teacherIds.length ? await repo.findMany("Teacher", { id: { in: teacherIds } }, { select: ["id", "userId"] }) : [];
  const userOfTeacher = new Map(teachers.map((t) => [s(t.id), s(t.userId)]));
  const names = await studentNames(repo, [...new Set(untouched.map((p) => s(p.studentId)))]);
  let sent = 0;
  for (const p of untouched) {
    const link = `/teacher/map-plans?classId=${s(p.classId)}&subject=${s(p.subject)}&plan=${s(p.id)}`;
    const forClass = [...new Set(teacherLinks.filter((t) => s(t.classId) === s(p.classId)).map((t) => s(t.teacherId)))];
    const name = names.get(s(p.studentId))?.name ?? "A student";
    for (const tId of forClass) {
      const userId = userOfTeacher.get(tId);
      if (!userId) continue;
      // at most one alert per plan per teacher, ever
      if ((await repo.findMany("Notification", { userId, link }, { select: ["id"] })).length) continue;
      await repo.create("Notification", {
        userId, type: "INTERVENTION_ALERT", title: "🗺️ A MAP plan hasn't been started",
        body: `${name} hasn't opened their ${p.subject === "READING" ? "Reading" : "Language Usage"} MAP plan yet, ${MAP_PLAN_IDLE_DAYS}+ days after it was sent.`,
        link, readAt: null, createdAt: now,
      });
      sent++;
    }
  }
  return sent;
}

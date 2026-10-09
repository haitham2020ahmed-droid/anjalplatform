/**
 * 🎯 School goals, set by the admin and shown on every teacher's home page: practice minutes a week, plan parts a
 * week, and unit targets (“80% of Grade 4 finish Unit 1 by 15 November”). The admin can also send the full
 * curriculum plan to every class of a grade at once.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { sendCurriculumPlan } from "../curriculum-map/curriculum-plan";
import { weekStart } from "../student/weekly";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(s(v)) : null);
const KEY = "school.goals";
export interface UnitTarget { grade: number; unit: string; pct: number; by: string }
export interface SchoolGoals { weeklyMinutes: number; weeklyParts: number; units: UnitTarget[] }
export const DEFAULT_GOALS: SchoolGoals = { weeklyMinutes: 60, weeklyParts: 3, units: [] };

export async function schoolGoals(repo: Repo, schoolId: string): Promise<SchoolGoals> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: KEY }))[0];
  const v = (typeof row?.value === "string" ? JSON.parse(s(row.value)) : row?.value) as Partial<SchoolGoals> | undefined;
  return { weeklyMinutes: Number(v?.weeklyMinutes) || DEFAULT_GOALS.weeklyMinutes, weeklyParts: Number(v?.weeklyParts) || DEFAULT_GOALS.weeklyParts, units: Array.isArray(v?.units) ? v!.units.filter((u) => u && u.unit && /^\d{4}-\d{2}-\d{2}$/.test(s(u.by))) : [] };
}

export async function saveSchoolGoals(repo: Repo, actor: Actor, g: SchoolGoals, now = new Date()): Promise<void> {
  assertCan(actor, "settings:school");
  const weeklyMinutes = Math.round(g.weeklyMinutes), weeklyParts = Math.round(g.weeklyParts);
  if (!(weeklyMinutes >= 10 && weeklyMinutes <= 600)) throw new ValidationError("Minutes a week: from 10 to 600.");
  if (!(weeklyParts >= 1 && weeklyParts <= 20)) throw new ValidationError("Parts a week: from 1 to 20.");
  const units = g.units.filter((u) => u.unit.trim()).map((u) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(u.by)) throw new ValidationError(`${u.unit}: choose the date.`);
    const pct = Math.round(u.pct); if (!(pct >= 10 && pct <= 100)) throw new ValidationError(`${u.unit}: the share of students is 10–100%.`);
    return { grade: Math.round(u.grade), unit: u.unit.trim().slice(0, 120), pct, by: u.by };
  });
  const value = { weeklyMinutes, weeklyParts, units };
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId, key: KEY }, { value, updatedBy: actor.userId }, { schoolId: actor.schoolId, key: KEY, value, updatedBy: actor.userId });
  await audit(repo, { actorId: actor.userId, action: "settings.update", entityType: "SchoolSetting", entityId: `${actor.schoolId}:${KEY}`, after: value, at: now });
}

export interface ClassGoalRow { classId: string; className: string; grade: number; students: number; minutes: number; parts: number; units: { unit: string; pct: number; target: number; by: string; done: number; daysLeft: number }[] }

/** How each class is doing on the school goals this week (and on its grade's unit targets). */
export async function goalProgress(repo: Repo, actor: Actor, classes: Row[], now = new Date()): Promise<{ goals: SchoolGoals; rows: ClassGoalRow[] }> {
  assertCan(actor, "reports:read");
  const goals = await schoolGoals(repo, s(actor.schoolId));
  const since = weekStart(now);
  const rows: ClassGoalRow[] = [];
  for (const c of classes) {
    const grade = Number((await repo.findUnique("Grade", { id: c.gradeId }))?.level ?? 0);
    const ids = (await repo.findMany("ClassMembership", { classId: c.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
    const n = ids.length || 1;
    const attempts = ids.length ? await repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: since } }, { select: ["responseMs"] }) : [];
    const minutes = Math.round(attempts.reduce((t, a) => t + Math.min(Number(a.responseMs ?? 0), 180_000), 0) / 60_000 / n);
    const done = ids.length ? (await repo.findMany("AssignmentStudent", { studentId: { in: ids }, status: "COMPLETED" }, { select: ["assignmentId", "completedAt"] })).filter((r) => { const t = d(r.completedAt); return t && t >= since; }) : [];
    const planAids = done.length ? new Set((await repo.findMany("Assignment", { id: { in: done.map((r) => s(r.assignmentId)) } }, { select: ["id", "curriculumPlanId"] })).filter((a) => a.curriculumPlanId && s(a.curriculumPlanId) !== "WEEKLY_CHECK").map((a) => s(a.id))) : new Set<string>();
    const parts = Math.round((10 * done.filter((r) => planAids.has(s(r.assignmentId))).length) / n) / 10;
    // unit targets: share of students who finished every part of the unit in the class's curriculum plan
    const plan = (await repo.findMany("SkillPlan", { classId: c.id, kind: "CURRICULUM" }))[0];
    const items = plan ? await repo.findMany("SkillPlanItem", { planId: plan.id }) : [];
    const units = [];
    for (const u of goals.units.filter((x) => x.grade === grade)) {
      const inUnit = items.filter((it) => s(it.label).split(" · ")[0].toLowerCase().startsWith(u.unit.toLowerCase()));
      const aids = inUnit.flatMap((it) => { const v = typeof it.assignmentIds === "string" ? JSON.parse(s(it.assignmentIds)) : it.assignmentIds; return Array.isArray(v) ? v.map(String) : []; });
      const rowsU = aids.length ? await repo.findMany("AssignmentStudent", { assignmentId: { in: aids }, status: "COMPLETED" }, { select: ["assignmentId", "studentId"] }) : [];
      const finished = inUnit.length ? ids.filter((id) => inUnit.every((it) => { const v = typeof it.assignmentIds === "string" ? JSON.parse(s(it.assignmentIds)) : it.assignmentIds; const set = new Set(Array.isArray(v) ? v.map(String) : []); return rowsU.some((r) => s(r.studentId) === id && set.has(s(r.assignmentId))); })).length : 0;
      units.push({ unit: u.unit, pct: Math.round((100 * finished) / n), target: u.pct, by: u.by, done: finished, daysLeft: Math.ceil((new Date(`${u.by}T23:59:59`).getTime() - now.getTime()) / 86_400_000) });
    }
    rows.push({ classId: s(c.id), className: s(c.name), grade, students: ids.length, minutes, parts, units });
  }
  return { goals, rows };
}

/** 📘 Admin: the full curriculum plan for every class of a grade (new classes get it; existing plans are updated). */
export async function sendPlanToGrade(repo: Repo, actor: Actor, grade: number, targetCorrect: number): Promise<{ classes: number; created: number; skipped: string[] }> {
  assertCan(actor, "assignments:create");
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("School admins only.");
  const g = (await repo.findMany("Grade", { schoolId: actor.schoolId, level: grade }))[0];
  if (!g) throw new ValidationError(`Grade ${grade} does not exist.`);
  const classes = await repo.findMany("Class", { schoolId: actor.schoolId, gradeId: g.id, deletedAt: null });
  let created = 0; const skipped: string[] = [];
  for (const c of classes) {
    try { const r = await sendCurriculumPlan(repo, actor, { classId: s(c.id), targetCorrect }); if (r.created) created++; }
    catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) skipped.push(`${s(c.name)}: ${e.message}`); else throw e; }
  }
  return { classes: classes.length, created, skipped };
}

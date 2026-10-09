/**
 * 🧑‍🏫 Admin: teacher follow-up. For each teacher — classes, students, last sign-in, assignments made (30 days),
 * how often they open their students' results (30 days), whether their at-risk students got help (an
 * assignment after they became at risk), % of students active this week and % on track. Warnings follow the
 * school's rules (editable): no sign-in for N days, no assignment for N days, at-risk students without help.
 * Every warning shows its context (number of classes and students) so the admin can judge fairly.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { mapSummaries, practiceStats } from "./student-data";
import { statusOf } from "./progress";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => (v ? new Date(v instanceof Date ? v.toISOString() : s(v)).getTime() : 0);
const DAY = 86_400_000;

export interface FollowupRules { noLoginDays: number; noAssignmentDays: number; atRiskDays: number }
export const DEFAULT_FOLLOWUP: FollowupRules = { noLoginDays: 7, noAssignmentDays: 14, atRiskDays: 7 };
const KEY = "followup.rules";

export async function followupRules(repo: Repo, schoolId: string | null): Promise<FollowupRules> {
  if (!schoolId) return DEFAULT_FOLLOWUP;
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: KEY }))[0];
  let v: unknown = row?.value ?? null;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const out = { ...DEFAULT_FOLLOWUP };
  if (v && typeof v === "object") for (const k of Object.keys(out) as (keyof FollowupRules)[]) { const n = Number((v as Record<string, unknown>)[k]); if (Number.isInteger(n) && n >= 1 && n <= 90) out[k] = n; }
  return out;
}

export async function setFollowupRules(repo: Repo, actor: Actor, input: Partial<FollowupRules>, now = new Date()): Promise<FollowupRules> {
  assertCan(actor, "settings:school");
  const v = { ...(await followupRules(repo, actor.schoolId)) };
  for (const k of Object.keys(v) as (keyof FollowupRules)[]) {
    if (input[k] === undefined) continue;
    const n = Number(input[k]);
    if (!(Number.isInteger(n) && n >= 1 && n <= 90)) throw new ValidationError("Days must be a whole number from 1 to 90.");
    v[k] = n;
  }
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId!, key: KEY }, { value: v, updatedById: actor.userId, updatedAt: now }, { value: v, updatedById: actor.userId, updatedAt: now });
  return v;
}

export interface TeacherFollowup {
  userId: string; name: string; classes: string[]; students: number; lastLogin: string | null; assignments30: number; lastAssignment: string | null;
  resultViews30: number; atRisk: number; atRiskHelped: number; activePct: number | null; onTrackPct: number | null; warnings: string[];
}

export async function teacherFollowup(repo: Repo, actor: Actor, now = new Date()): Promise<{ rules: FollowupRules; rows: TeacherFollowup[] }> {
  assertCan(actor, "analytics:school");
  const rules = await followupRules(repo, actor.schoolId);
  const users = (await repo.findMany("User", { schoolId: actor.schoolId, role: "TEACHER" }, { select: ["id", "displayName", "lastLoginAt", "deletedAt"] })).filter((u) => !u.deletedAt);
  if (!users.length) return { rules, rows: [] };
  const teachers = await repo.findMany("Teacher", { userId: { in: users.map((u) => u.id) } }, { select: ["id", "userId"] });
  const links = teachers.length ? await repo.findMany("ClassTeacher", { teacherId: { in: teachers.map((t) => t.id) } }) : [];
  const classes = links.length ? (await repo.findMany("Class", { id: { in: [...new Set(links.map((l) => s(l.classId)))] }, deletedAt: null }, { select: ["id", "name", "gradeId"] })) : [];
  const members = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["classId", "studentId"] }) : [];
  const studentIds = [...new Set(members.map((m) => s(m.studentId)))];
  const grades = classes.length ? await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] }) : [];
  const gradeOf = new Map(members.map((m) => [s(m.studentId), Number(grades.find((g) => g.id === classes.find((c) => c.id === m.classId)?.gradeId)?.level ?? 0)]));
  const [maps, practice, assignments, views, asgStudents] = await Promise.all([
    mapSummaries(repo, studentIds, "READING", gradeOf), practiceStats(repo, studentIds, now),
    teachers.length ? repo.findMany("Assignment", { createdById: { in: teachers.map((t) => t.id) }, deletedAt: null }, { select: ["id", "createdById", "createdAt", "classId"] }) : Promise.resolve([] as Row[]),
    repo.findMany("AuditLog", { action: "results.view", actorId: { in: users.map((u) => u.id) } }, { select: ["actorId", "createdAt"] }),
    studentIds.length ? repo.findMany("AssignmentStudent", { studentId: { in: studentIds } }, { select: ["studentId", "assignmentId"] }) : Promise.resolve([] as Row[]),
  ]);
  const assignmentAt = new Map(assignments.map((a) => [s(a.id), time(a.createdAt)]));
  const rows: TeacherFollowup[] = users.map((u) => {
    const t = teachers.find((x) => x.userId === u.id);
    const myClassIds = links.filter((l) => t && l.teacherId === t.id).map((l) => s(l.classId));
    const myClasses = classes.filter((c) => myClassIds.includes(s(c.id)));
    const myStudents = [...new Set(members.filter((m) => myClassIds.includes(s(m.classId))).map((m) => s(m.studentId)))];
    const mine = assignments.filter((a) => t && a.createdById === t.id);
    const last = mine.reduce((m, a) => Math.max(m, time(a.createdAt)), 0);
    const atRiskIds = myStudents.filter((id) => { const st = statusOf(maps.get(id), practice.get(id)).status; return st === "AT_RISK" || st === "MISSED"; });
    // “helped” = the student got an assignment from this teacher in the last atRiskDays days
    const recent = now.getTime() - rules.atRiskDays * DAY;
    const helped = atRiskIds.filter((id) => asgStudents.some((r) => s(r.studentId) === id && mine.some((a) => a.id === r.assignmentId) && (assignmentAt.get(s(r.assignmentId)) ?? 0) >= recent));
    const active = myStudents.filter((id) => time(practice.get(id)?.lastActive) >= now.getTime() - 7 * DAY).length;
    const onTrack = myStudents.filter((id) => { const st = statusOf(maps.get(id), practice.get(id)).status; return st === "ON_TRACK" || st === "MET"; }).length;
    const withStatus = myStudents.filter((id) => statusOf(maps.get(id), practice.get(id)).status !== "NO_DATA").length;
    const lastLogin = time(u.lastLoginAt);
    const ctx = `${myClasses.length} class${myClasses.length === 1 ? "" : "es"}, ${myStudents.length} students`;
    const warnings: string[] = [];
    if (myStudents.length) {
      if (!lastLogin || lastLogin < now.getTime() - rules.noLoginDays * DAY) warnings.push(`No sign-in for ${lastLogin ? Math.floor((now.getTime() - lastLogin) / DAY) : "many"} days (${ctx}).`);
      if (!last || last < now.getTime() - rules.noAssignmentDays * DAY) warnings.push(`No new assignment for ${rules.noAssignmentDays}+ days (${ctx}).`);
      if (atRiskIds.length > helped.length) warnings.push(`${atRiskIds.length - helped.length} at-risk student(s) without new work in ${rules.atRiskDays} days (${ctx}).`);
    }
    return {
      userId: s(u.id), name: s(u.displayName), classes: myClasses.map((c) => s(c.name)).sort(), students: myStudents.length,
      lastLogin: lastLogin ? new Date(lastLogin).toISOString() : null, assignments30: mine.filter((a) => time(a.createdAt) >= now.getTime() - 30 * DAY).length, lastAssignment: last ? new Date(last).toISOString() : null,
      resultViews30: views.filter((v) => v.actorId === u.id && time(v.createdAt) >= now.getTime() - 30 * DAY).length,
      atRisk: atRiskIds.length, atRiskHelped: helped.length,
      activePct: myStudents.length ? Math.round((active / myStudents.length) * 100) : null, onTrackPct: withStatus ? Math.round((onTrack / withStatus) * 100) : null, warnings,
    };
  }).sort((a, b) => b.warnings.length - a.warnings.length || a.name.localeCompare(b.name));
  return { rules, rows };
}

/** Records that a teacher opened their students' results (for the follow-up page). */
export async function recordResultsView(repo: Repo, actor: Actor, now = new Date()): Promise<void> {
  if (actor.role !== "TEACHER") return;
  await repo.create("AuditLog", { actorId: actor.userId, action: "results.view", entityType: "User", entityId: actor.userId, before: null, after: null, createdAt: now });
}

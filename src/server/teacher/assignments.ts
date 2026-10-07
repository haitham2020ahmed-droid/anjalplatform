/**
 * Assignments: a teacher assigns skills (or a whole unit) to a class with a due date
 * and a target mastery. Each enrolled student gets an AssignmentStudent row and a
 * notification. Progress = share of target skills at or above the target mastery.
 */
import type { Repo, Row } from "../seeding/repo";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { refreshSkillAssignment, refreshSkillAssignments } from "./assign";

export interface NewAssignment {
  classId: string;
  title: string;
  target: "SKILL" | "UNIT";
  skillIds?: string[];
  unitId?: string;
  dueAt: Date | null;
  targetMastery?: number;
}

/** Teacher of the class, or an admin of the class's school. */
export async function assertClassAccess(repo: Repo, actor: Actor, classId: string): Promise<Row> {
  const klass = await repo.findUnique("Class", { id: classId });
  if (!klass || klass.deletedAt) throw new ForbiddenError("Class not found.");
  if (actor.role === "SUPER_ADMIN") return klass;
  if (actor.role === "SCHOOL_ADMIN" && actor.schoolId === klass.schoolId) return klass;
  // defence in depth (Phase 12): a teaching assignment never crosses schools, even if one were created by mistake
  if (actor.role === "TEACHER" && actor.schoolId !== null && actor.schoolId === klass.schoolId) {
    const t = await repo.findUnique("Teacher", { userId: actor.userId });
    if (t && (await repo.findUnique("ClassTeacher", { classId, teacherId: t.id }))) return klass;
  }
  throw new ForbiddenError("You do not teach this class.");
}

async function targetSkills(repo: Repo, a: Row): Promise<string[]> {
  if (a.target === "UNIT" && a.unitId) return (await repo.findMany("UnitSkill", { unitId: a.unitId })).map((l) => String(l.skillId));
  return ((a.skillIds as string[] | null) ?? []).map(String);
}

export async function createAssignment(repo: Repo, actor: Actor, input: NewAssignment, now = new Date()): Promise<Row> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const title = input.title.replace(/\s+/g, " ").trim();
  if (!title || title.length > 191) throw new ValidationError("Give the assignment a title (under 191 characters).");
  if (input.dueAt && input.dueAt.getTime() < now.getTime() - 60_000) throw new ValidationError("The due date is in the past.");
  const targetMastery = input.targetMastery ?? 75;
  if (targetMastery < 40 || targetMastery > 100) throw new ValidationError("Target mastery must be between 40 and 100.");
  const cur = (await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }))[0];
  let skillIds: string[] | null = null;
  let unitId: string | null = null;
  if (input.target === "UNIT") {
    const u = input.unitId ? await repo.findUnique("Unit", { id: input.unitId }) : null;
    if (!u || u.curriculumId !== cur.id) throw new ValidationError("Choose a unit from this class's book.");
    unitId = String(u.id);
  } else {
    const ids = [...new Set(input.skillIds ?? [])];
    if (!ids.length) throw new ValidationError("Choose at least one skill.");
    const found = await repo.findMany("Skill", { id: { in: ids } });
    if (found.length !== ids.length || found.some((k) => k.curriculumId !== cur.id)) throw new ValidationError("All skills must come from this class's book.");
    skillIds = ids;
  }
  const teacher = await repo.findUnique("Teacher", { userId: actor.userId });
  if (!teacher) throw new ForbiddenError("Only teachers can create assignments.");
  const a = await repo.create("Assignment", {
    classId: klass.id, createdById: teacher.id, title, target: input.target, unitId, skillIds, dueAt: input.dueAt, targetMastery, createdAt: now,
  });
  const members = await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null });
  for (const m of members) {
    await repo.create("AssignmentStudent", { assignmentId: a.id, studentId: m.studentId, status: "NOT_STARTED", progress: 0 });
    const st = (await repo.findUnique("Student", { id: m.studentId }))!;
    await repo.create("Notification", {
      userId: st.userId, type: "NEW_ASSIGNMENT", title: `New assignment: ${title}`,
      body: input.dueAt ? `Due ${input.dueAt.toISOString().slice(0, 10)}.` : "No due date.", link: "/student", createdAt: now,
    });
  }
  await audit(repo, { actorId: actor.userId, action: "assignment.create", entityType: "Assignment", entityId: String(a.id), after: { title, target: input.target, students: members.length } });
  await refreshAssignmentProgress(repo, String(a.id), now);
  return a;
}

/** Recompute every student's status/progress for one assignment from current mastery. */
export async function refreshAssignmentProgress(repo: Repo, assignmentId: string, now = new Date()): Promise<void> {
  const a = (await repo.findUnique("Assignment", { id: assignmentId }))!;
  // single-skill assignments (⭐ Assign) count only practice done for the assignment
  if (a.skillId) return refreshSkillAssignment(repo, a, null, now);
  const skills = await targetSkills(repo, a);
  const rows = await repo.findMany("AssignmentStudent", { assignmentId });
  const mastery = skills.length && rows.length ? await repo.findMany("StudentSkillMastery", { studentId: { in: rows.map((r) => r.studentId) }, skillId: { in: skills } }) : [];
  const target = Number(a.targetMastery ?? 75);
  const due = a.dueAt ? new Date(String(a.dueAt instanceof Date ? a.dueAt.toISOString() : a.dueAt)) : null;
  for (const r of rows) {
    const mine = mastery.filter((m) => m.studentId === r.studentId);
    const reached = mine.filter((m) => Number(m.score) >= target).length;
    const progress = skills.length ? reached / skills.length : 0;
    const started = mine.some((m) => Number(m.attempts) > 0);
    const status = progress >= 1 ? "COMPLETED" : due && now > due ? "OVERDUE" : started ? "IN_PROGRESS" : "NOT_STARTED";
    await repo.updateMany("AssignmentStudent", { assignmentId, studentId: r.studentId }, {
      status, progress: Math.round(progress * 1000) / 1000, completedAt: status === "COMPLETED" ? (r.completedAt ?? now) : null,
    });
  }
}

export interface AssignmentSummary {
  id: string;
  title: string;
  dueAt: string | null;
  targetMastery: number;
  skills: number;
  counts: Record<"NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE", number>;
}

export async function classAssignments(repo: Repo, actor: Actor, classId: string, now = new Date()): Promise<AssignmentSummary[]> {
  await assertClassAccess(repo, actor, classId);
  const list = (await repo.findMany("Assignment", { classId, deletedAt: null })).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  // batched: skill assignments refreshed together; older multi-skill ones keep their own refresh
  await refreshSkillAssignments(repo, list.filter((a) => a.skillId), null, now);
  for (const a of list.filter((x) => !x.skillId)) await refreshAssignmentProgress(repo, String(a.id), now);
  const allRows = list.length ? await repo.findMany("AssignmentStudent", { assignmentId: { in: list.map((a) => a.id) } }, { select: ["assignmentId", "status"] }) : [];
  const out: AssignmentSummary[] = [];
  for (const a of list) {
    const counts = { NOT_STARTED: 0, IN_PROGRESS: 0, COMPLETED: 0, OVERDUE: 0 };
    for (const r of allRows) if (r.assignmentId === a.id) counts[r.status as keyof typeof counts]++;
    out.push({
      id: String(a.id), title: String(a.title), dueAt: a.dueAt ? new Date(String(a.dueAt instanceof Date ? a.dueAt.toISOString() : a.dueAt)).toISOString() : null,
      targetMastery: Number(a.targetMastery ?? 75), skills: a.skillId ? 1 : (await targetSkills(repo, a)).length, counts,
    });
  }
  return out;
}

/** For the student's recommendations: skill → days until the nearest open assignment is due. */
export async function assignedSkillsForStudent(repo: Repo, studentId: string, now = new Date()): Promise<Map<string, number>> {
  const rows = (await repo.findMany("AssignmentStudent", { studentId })).filter((r) => r.status !== "COMPLETED");
  const out = new Map<string, number>();
  for (const r of rows) {
    const a = await repo.findUnique("Assignment", { id: r.assignmentId });
    if (!a || a.deletedAt) continue;
    const days = a.dueAt ? Math.ceil((new Date(String(a.dueAt instanceof Date ? a.dueAt.toISOString() : a.dueAt)).getTime() - now.getTime()) / 86_400_000) : 14;
    for (const s of await targetSkills(repo, a)) out.set(s, Math.min(out.get(s) ?? Infinity, days));
  }
  return out;
}

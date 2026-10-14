/**
 * Assignments: a teacher assigns skills (or a whole unit) to a class with a due date
 * and a target mastery. Each enrolled student gets an AssignmentStudent row and a
 * notification. Progress = share of target skills at or above the target mastery.
 */
import type { Repo, Row } from "../seeding/repo";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { refreshQuestionSets, refreshSkillAssignments } from "./assign";

export interface NewAssignment {
  classId: string;
  title: string;
  target: "SKILL" | "UNIT";
  skillIds?: string[];
  unitId?: string;
  dueAt: Date | null;
  /** r68: students see it from this day (null: at once) */
  startAt?: Date | null;
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

/** Every curriculum of every grade of the school (content is open to all teachers). */
async function schoolCurriculumIds(repo: Repo, schoolId: unknown): Promise<string[]> {
  const grades = await repo.findMany("Grade", { schoolId }, { select: ["id"] });
  return grades.length ? (await repo.findMany("Curriculum", { gradeId: { in: grades.map((g) => g.id) } }, { select: ["id"] })).map((c) => String(c.id)) : [];
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
  // access rules (UI reorg): units and skills of ANY grade of this school may be assigned to the teacher's own class
  const schoolCurricula = new Set((await schoolCurriculumIds(repo, klass.schoolId)));
  let skillIds: string[] | null = null;
  let unitId: string | null = null;
  if (input.target === "UNIT") {
    const u = input.unitId ? await repo.findUnique("Unit", { id: input.unitId }) : null;
    if (!u || u.deletedAt || !schoolCurricula.has(String(u.curriculumId))) throw new ValidationError("Choose a unit of the curriculum.");
    unitId = String(u.id);
  } else {
    const ids = [...new Set(input.skillIds ?? [])];
    if (!ids.length) throw new ValidationError("Choose at least one skill.");
    const found = await repo.findMany("Skill", { id: { in: ids } });
    if (found.length !== ids.length || found.some((k) => k.deletedAt || !schoolCurricula.has(String(k.curriculumId)))) throw new ValidationError("Choose skills of the school's curriculum.");
    skillIds = ids;
  }
  const teacher = await repo.findUnique("Teacher", { userId: actor.userId });
  if (!teacher) throw new ForbiddenError("Only teachers can create assignments.");
  const a = await repo.create("Assignment", {
    classId: klass.id, createdById: teacher.id, title, target: input.target, unitId, skillIds, dueAt: input.dueAt, ...(input.startAt ? { startAt: input.startAt } : {}), targetMastery, createdAt: now,
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

/**
 * Recompute every student's status/progress for one assignment from current mastery.
 * Readiness fix C-1: question sets (assessmentId) are owned by refreshQuestionSets; an assignment with no
 * target skills is never recomputed from mastery (it would read as 0 % and wipe finished work); a row that
 * is already COMPLETED / has completedAt is never moved back; only rows whose values change are written.
 */
export async function refreshAssignmentProgress(repo: Repo, assignmentId: string, now = new Date()): Promise<void> {
  const a = await repo.findUnique("Assignment", { id: assignmentId });
  if (!a || a.deletedAt) return;
  await refreshAssignmentsBatch(repo, [a], now);
}

/** Batched refresh for every kind of assignment; writes only rows whose status/progress changed. */
export async function refreshAssignmentsBatch(repo: Repo, list: Row[], now = new Date()): Promise<void> {
  const live = list.filter((a) => !a.deletedAt);
  const skill = live.filter((a) => a.skillId);
  const sets = live.filter((a) => !a.skillId && a.assessmentId);
  const legacy = live.filter((a) => !a.skillId && !a.assessmentId);
  await Promise.all([refreshSkillAssignments(repo, skill, null, now), refreshQuestionSets(repo, sets, null, now), refreshMultiSkill(repo, legacy, now)]);
}

/** Older multi-skill / unit assignments: progress = share of target skills at the target mastery. */
async function refreshMultiSkill(repo: Repo, list: Row[], now: Date): Promise<void> {
  const withSkills: { a: Row; skills: string[] }[] = [];
  for (const a of list) {
    const skills = await targetSkills(repo, a);
    if (skills.length) withSkills.push({ a, skills }); // no target skills ⇒ progress is tracked elsewhere: never touch
  }
  if (!withSkills.length) return;
  const rows = await repo.findMany("AssignmentStudent", { assignmentId: { in: withSkills.map((x) => x.a.id) } });
  if (!rows.length) return;
  const allSkills = [...new Set(withSkills.flatMap((x) => x.skills))];
  const mastery = await repo.findMany("StudentSkillMastery", { studentId: { in: [...new Set(rows.map((r) => String(r.studentId)))] }, skillId: { in: allSkills } }, { select: ["studentId", "skillId", "score", "attempts"] });
  const byKey = new Map(mastery.map((m) => [`${String(m.studentId)}|${String(m.skillId)}`, m]));
  const byId = new Map(withSkills.map((x) => [String(x.a.id), x]));
  const writes: Promise<unknown>[] = [];
  for (const r of rows) {
    const x = byId.get(String(r.assignmentId));
    if (!x) continue;
    if (r.status === "COMPLETED" || r.completedAt) continue; // finished work is never moved back
    const { a, skills } = x;
    const target = Number(a.targetMastery ?? 75);
    const due = a.dueAt ? new Date(String(a.dueAt instanceof Date ? a.dueAt.toISOString() : a.dueAt)) : null;
    const mine = skills.map((k) => byKey.get(`${String(r.studentId)}|${k}`)).filter(Boolean) as Row[];
    const reached = mine.filter((m) => Number(m.score) >= target).length;
    const progress = Math.round((reached / skills.length) * 1000) / 1000;
    const started = mine.some((m) => Number(m.attempts) > 0);
    const status = progress >= 1 ? "COMPLETED" : due && now > due ? "OVERDUE" : started ? "IN_PROGRESS" : "NOT_STARTED";
    if (status === r.status && Math.abs(progress - Number(r.progress ?? 0)) <= 0.0005) continue;
    writes.push(repo.updateMany("AssignmentStudent", { assignmentId: a.id, studentId: r.studentId }, { status, progress, completedAt: status === "COMPLETED" ? now : null }));
  }
  await Promise.all(writes);
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
  const list = (await repo.findMany("Assignment", { classId, deletedAt: null })).filter((a) => !a.curriculumPlanId).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  // C-1: one batched refresh per kind; only rows whose values changed are written, finished work is never reset
  await refreshAssignmentsBatch(repo, list, now);
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

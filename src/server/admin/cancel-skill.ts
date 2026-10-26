/**
 * 🧰 Admin override: cancel one skill from a student's My Work — any grade, any class of the school, even one the
 * teacher cannot reach (a very old assignment outside their Assigned page's read window; see assigned.ts SKILL_TAKE).
 *
 * A safety valve, not a second way to cancel: the lookup reuses searchStudents (student-file.ts) and
 * assignedWorkOfClasses — the SAME "r78: ONE source of what was assigned" function the teacher's Assigned page and
 * Student Skills read — and the cancel itself calls cancelAssignment (teacher/assigned.ts) directly, for one student,
 * exactly the per-student "Remove" a teacher already has. Nothing here writes an AssignmentCancel row on its own.
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, canAccessStudent, assertCan, type Actor } from "../auth/rbac";
import { searchStudents, type FoundStudent } from "../insights/student-file";
import { accessibleClasses } from "../teacher/assign";
import { assignedWorkOfClasses, cancelAssignment, type AssignedKind } from "../teacher/assigned";
import { ValidationError } from "../curriculum-admin";
import { memoryHigh } from "../monitoring/memory";
import { inJobSlot } from "../jobs/runner";
import { log } from "../monitoring/log";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";

/** Only skill work (never a test, a plan or anything else) is offered here. */
const SKILL_KINDS: readonly AssignedKind[] = ["SKILL", "PROGRESS_CHECK"];

export interface AdminFoundStudent extends FoundStudent {}

/** Students matching the admin's search, scoped to their own school (SUPER_ADMIN: any school they are acting on). */
export async function adminFindStudents(repo: Repo, actor: Actor, q: string): Promise<AdminFoundStudent[]> {
  if (!isAdmin(actor)) throw new ForbiddenError("Admins only.");
  return searchStudents(repo, actor, q);
}

export interface AdminAssignedSkill { kind: AssignedKind; id: string; title: string; detail: string | null; classNames: string[]; done: boolean }
export interface AdminStudentSkills { student: { id: string; name: string; number: string; grade: number; className: string }; skills: AdminAssignedSkill[] }

/** One student's currently-assigned skills (every class they are in, any grade) — what cancelAssignment can act on. */
export async function adminStudentSkills(repo: Repo, actor: Actor, studentId: string): Promise<AdminStudentSkills> {
  assertCan(actor, "assignments:read");
  if (!isAdmin(actor)) throw new ForbiddenError("Admins only.");
  const id = s(studentId);
  const st = await repo.findUnique("Student", { id });
  if (!st || !canAccessStudent(actor, { studentId: id, schoolId: s(st.schoolId) })) throw new ForbiddenError("Student not found.");
  const [user, grade, memberships] = await Promise.all([
    repo.findUnique("User", { id: st.userId }),
    st.gradeId ? repo.findUnique("Grade", { id: st.gradeId }) : Promise.resolve(null),
    repo.findMany("ClassMembership", { studentId: id, leftAt: null }, { select: ["classId"] }),
  ]);
  const classIds = [...new Set(memberships.map((m) => s(m.classId)))];
  const classes = classIds.length ? await repo.findMany("Class", { id: { in: classIds } }, { select: ["id", "name"] }) : [];
  const classNameOf = new Map(classes.map((c) => [s(c.id), s(c.name)]));
  const items = classIds.length ? await assignedWorkOfClasses(repo, s(st.schoolId), classIds, { kinds: SKILL_KINDS, studentId: id }) : [];
  const skills: AdminAssignedSkill[] = items
    .filter((it) => it.students.has(id))
    .map((it) => ({
      kind: it.kind, id: it.id, title: it.title, detail: it.detail,
      classNames: it.classIds.map((c) => classNameOf.get(c) ?? "").filter(Boolean),
      done: it.links.some((l) => s(l.studentId) === id && s(l.status) === "COMPLETED"),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
  return {
    student: { id, name: s(user?.displayName) || "Student", number: s(st.studentNumber), grade: Number(grade?.level ?? 0), className: classes.map((c) => s(c.name)).join(", ") },
    skills,
  };
}

/** Every live (not yet fully-cancelled) skill/progress-check item of the whole school, every grade and class. */
async function allAssignedSkillItems(repo: Repo, actor: Actor) {
  if (!isAdmin(actor)) throw new ForbiddenError("Admins only.");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  const classIds = (await accessibleClasses(repo, actor)).map((c) => s(c.id));
  return classIds.length ? await assignedWorkOfClasses(repo, actor.schoolId, classIds, { kinds: SKILL_KINDS }) : [];
}

/** Every live skill/progress-check item of ONE class only (must be a class of this actor's school). */
async function assignedSkillItemsOfClass(repo: Repo, actor: Actor, classId: string) {
  if (!isAdmin(actor)) throw new ForbiddenError("Admins only.");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  const classes = await accessibleClasses(repo, actor);
  if (!classes.some((c) => s(c.id) === classId)) throw new ForbiddenError("Not a class of this school.");
  return assignedWorkOfClasses(repo, actor.schoolId, [classId], { kinds: SKILL_KINDS });
}

export interface AdminClass { id: string; name: string; grade: number }

/** Every class of the school (for the "cancel in this class" picker), grade then name. */
export async function adminClasses(repo: Repo, actor: Actor): Promise<AdminClass[]> {
  if (!isAdmin(actor)) throw new ForbiddenError("Admins only.");
  const classes = await accessibleClasses(repo, actor);
  const gradeIds = [...new Set(classes.map((c) => s(c.gradeId)))];
  const grades = gradeIds.length ? await repo.findMany("Grade", { id: { in: gradeIds } }, { select: ["id", "level"] }) : [];
  const levelOf = new Map(grades.map((g) => [s(g.id), Number(g.level ?? 0)]));
  return classes.map((c) => ({ id: s(c.id), name: s(c.name), grade: levelOf.get(s(c.gradeId)) ?? 0 })).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
}

export interface AdminSkillGroup { kind: AssignedKind; title: string; itemIds: string[]; classNames: string[]; students: number }

/** Groups items by kind+title (one row per skill name), with the class names and student count of each. */
async function groupedByTitle(repo: Repo, actor: Actor, items: Awaited<ReturnType<typeof allAssignedSkillItems>>, needle: string): Promise<AdminSkillGroup[]> {
  const classes = await accessibleClasses(repo, actor);
  const classNameOf = new Map(classes.map((c) => [s(c.id), s(c.name)]));
  const groups = new Map<string, AdminSkillGroup>();
  for (const it of items) {
    if (needle && !it.title.toLowerCase().includes(needle)) continue;
    const key = `${it.kind}:${it.title}`;
    const g = groups.get(key) ?? { kind: it.kind, title: it.title, itemIds: [], classNames: [], students: 0 };
    g.itemIds.push(it.id);
    for (const c of it.classIds) { const n = classNameOf.get(c); if (n && !g.classNames.includes(n)) g.classNames.push(n); }
    g.students += it.students.size;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/** Every currently-assigned skill/progress-check whose title matches the search, grouped (one row per skill name) across the whole school. */
export async function adminFindAssignedSkills(repo: Repo, actor: Actor, q: string): Promise<AdminSkillGroup[]> {
  assertCan(actor, "assignments:read");
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return groupedByTitle(repo, actor, await allAssignedSkillItems(repo, actor), needle);
}

/** Every currently-assigned skill/progress-check of ONE class, optionally filtered by name (empty: every skill of that class). */
export async function adminFindAssignedSkillsInClass(repo: Repo, actor: Actor, classId: string, q = ""): Promise<AdminSkillGroup[]> {
  assertCan(actor, "assignments:read");
  return groupedByTitle(repo, actor, await assignedSkillItemsOfClass(repo, actor, classId), q.trim().toLowerCase());
}

/**
 * 🛟 r90 (stability audit, Oct 2026): before this fix, these 4 school-wide "cancel everything" actions ran an
 * unbounded number of sequential cancelAssignment calls (one DB read + write each) inside a SINGLE HTTP request,
 * with no memory check and no protection against two such actions (or one of these overlapping the nightly/manual
 * learning-engine run) racing at the same time on this 512 MB web server — exactly the class of problem r89 fixed
 * for the "Update now" button, just in this admin surface instead. Now: (1) a busy server defers the whole action
 * immediately (same message style as "Update now"); (2) the batch runs through the school's own job slot, so two
 * admin clicks (or a click landing mid-way through another one for the same school) can never run concurrently —
 * the second simply waits its turn; (3) items are cancelled in small concurrent chunks instead of one at a time,
 * so a large school's "cancel all" finishes in a fraction of the wall-clock time without ever firing more than
 * CHUNK cancelAssignment calls at once.
 */
const CHUNK = 20;
async function cancelItems(repo: Repo, actor: Actor, schoolId: string, items: { kind: AssignedKind; id: string }[]): Promise<number> {
  if (memoryHigh()) {
    log("warn", "admin.cancel_skill.deferred_memory", { schoolId, count: items.length });
    throw new ValidationError("The server is busy right now — please try again in a few minutes.");
  }
  return inJobSlot(`cancel-skill|${schoolId}`, async () => {
    let done = 0;
    for (let i = 0; i < items.length; i += CHUNK) {
      const part = items.slice(i, i + CHUNK);
      await Promise.all(part.map((it) => cancelAssignment(repo, actor, it.kind, it.id, null)));
      done += part.length;
    }
    return done;
  });
}

/** Cancel every live assignment of this exact skill title, for every student, in every class of the school. Returns how many items were cancelled. */
export async function adminCancelSkillEverywhere(repo: Repo, actor: Actor, kind: AssignedKind, title: string): Promise<number> {
  assertCan(actor, "assignments:create");
  const items = (await allAssignedSkillItems(repo, actor)).filter((it) => it.kind === kind && it.title === title);
  return cancelItems(repo, actor, actor.schoolId!, items);
}

/** Cancel EVERY currently-assigned skill/progress-check, for every student, in every grade and class of the school. Returns how many items were cancelled. */
export async function adminCancelAllAssignedSkills(repo: Repo, actor: Actor): Promise<number> {
  assertCan(actor, "assignments:create");
  const items = await allAssignedSkillItems(repo, actor);
  return cancelItems(repo, actor, actor.schoolId!, items);
}

/** Cancel every live assignment of this exact skill title, for every student, in ONE class only. Returns how many items were cancelled. */
export async function adminCancelSkillInClass(repo: Repo, actor: Actor, kind: AssignedKind, title: string, classId: string): Promise<number> {
  assertCan(actor, "assignments:create");
  const items = (await assignedSkillItemsOfClass(repo, actor, classId)).filter((it) => it.kind === kind && it.title === title);
  return cancelItems(repo, actor, actor.schoolId!, items);
}

/** Cancel EVERY currently-assigned skill/progress-check of ONE class only (every student in it). Returns how many items were cancelled. */
export async function adminCancelAllAssignedSkillsInClass(repo: Repo, actor: Actor, classId: string): Promise<number> {
  assertCan(actor, "assignments:create");
  const items = await assignedSkillItemsOfClass(repo, actor, classId);
  return cancelItems(repo, actor, actor.schoolId!, items);
}

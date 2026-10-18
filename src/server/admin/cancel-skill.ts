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
import { assignedWorkOfClasses, type AssignedKind } from "../teacher/assigned";

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

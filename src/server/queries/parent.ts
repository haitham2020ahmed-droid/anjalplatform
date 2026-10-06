/**
 * A parent's linked children (for the parent home page and report downloads).
 * Only the children linked to this parent are returned: the list comes from the
 * actor's own ParentStudent links, never from a request parameter.
 */
import { ForbiddenError, type Actor } from "../auth/rbac";
import type { Repo } from "../seeding/repo";

export interface ChildSummary {
  studentId: string;
  name: string;
  grade: number;
  className: string | null;
}

export async function parentChildren(repo: Repo, actor: Actor): Promise<ChildSummary[]> {
  if (actor.role !== "PARENT") throw new ForbiddenError("Parents only.");
  const ids = [...(actor.parentChildIds ?? [])];
  if (!ids.length) return [];
  const students = (await repo.findMany("Student", { id: { in: ids } })).filter((s) => !s.deletedAt);
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((s) => s.userId) } }) : [];
  const grades = students.length ? await repo.findMany("Grade", { id: { in: students.map((s) => s.gradeId) } }) : [];
  const members = students.length ? await repo.findMany("ClassMembership", { studentId: { in: students.map((s) => s.id) }, leftAt: null }) : [];
  const classes = members.length ? await repo.findMany("Class", { id: { in: members.map((m) => m.classId) } }) : [];
  return students
    .map((s) => {
      const m = members.find((x) => x.studentId === s.id);
      return {
        studentId: String(s.id),
        name: String(users.find((u) => u.id === s.userId)?.displayName ?? ""),
        grade: Number(grades.find((g) => g.id === s.gradeId)?.level ?? 0),
        className: m ? String(classes.find((c) => c.id === m.classId)?.name ?? "") || null : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Builds the request Actor (role + scope) from the database, once per request.
 * The scope sets drive row-level access (canAccessStudent): a teacher's students
 * are those currently enrolled in classes the teacher teaches; a parent's are
 * the linked children; a student's is only themself.
 */
import type { Repo, Row } from "../seeding/repo";
import type { Actor, Permission, Role } from "./rbac";

export async function resolveActor(repo: Repo, user: Row): Promise<Actor> {
  const role = String(user.role) as Role;
  const actor: Actor = { userId: String(user.id), role, schoolId: user.schoolId ? String(user.schoolId) : null };

  // the permission grants and the role's scope are independent: read them at the same time (this runs
  // on every page, so each saved database round trip counts)
  const scope = async () => {
    if (role === "STUDENT") {
      const st = await repo.findUnique("Student", { userId: user.id });
      if (st) actor.studentId = String(st.id);
    } else if (role === "TEACHER") {
      const t = await repo.findUnique("Teacher", { userId: user.id });
      const classIds = t ? (await repo.findMany("ClassTeacher", { teacherId: t.id }, { select: ["classId"] })).map((c) => String(c.classId)) : [];
      const members = classIds.length ? await repo.findMany("ClassMembership", { classId: { in: classIds }, leftAt: null }, { select: ["studentId"] }) : [];
      actor.teacherStudentIds = new Set(members.map((m) => String(m.studentId)));
    } else if (role === "PARENT") {
      const p = await repo.findUnique("Parent", { userId: user.id });
      const links = p ? await repo.findMany("ParentStudent", { parentId: p.id }, { select: ["studentId"] }) : [];
      actor.parentChildIds = new Set(links.map((l) => String(l.studentId)));
    }
  };
  const [grants] = await Promise.all([repo.findMany("RolePermission", { role }, { select: ["permission"] }), scope()]);
  if (grants.length) actor.extraPermissions = grants.map((g) => String(g.permission) as Permission);
  return actor;
}

/** Which student ids may this actor list? (null = all within school / unrestricted) */
export function visibleStudentIds(actor: Actor): ReadonlySet<string> | null {
  switch (actor.role) {
    case "SUPER_ADMIN":
    case "SCHOOL_ADMIN":
      return null; // filtered by schoolId in queries
    case "TEACHER":
      return actor.teacherStudentIds ?? new Set();
    case "PARENT":
      return actor.parentChildIds ?? new Set();
    case "STUDENT":
      return new Set(actor.studentId ? [actor.studentId] : []);
  }
}

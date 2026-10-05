/**
 * Role-based access control.
 *
 * Two layers, both enforced on the SERVER for every request:
 *  1. Permission  — may this role perform this action at all?   (can)
 *  2. Scope       — may this user touch THIS record?            (canAccessStudent)
 * UI hiding is a convenience only; never the security boundary.
 */

export type Role = "SUPER_ADMIN" | "SCHOOL_ADMIN" | "TEACHER" | "STUDENT" | "PARENT";

export const PERMISSIONS = [
  "curriculum:read",
  "curriculum:edit",
  "questions:read",
  "questions:edit",
  "questions:publish",
  "practice:take",
  "students:read",
  "students:manage",
  "teachers:manage",
  "classes:manage",
  "assignments:create",
  "assignments:read",
  "reports:read",
  "reports:export",
  "analytics:class",
  "analytics:school",
  "imports:run",
  "settings:engine",
  "settings:school", // calendar, branding (Arabic name, logo)
  "adaptive:audit",
  "schools:manage",
  "audit:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  SUPER_ADMIN: ALL,
  SCHOOL_ADMIN: new Set(PERMISSIONS.filter((p) => p !== "schools:manage")),
  TEACHER: new Set<Permission>([
    "curriculum:read",
    "questions:read",
    "questions:edit", // drafts only; publish needs an explicit grant
    "students:read",
    "assignments:create",
    "assignments:read",
    "reports:read",
    "reports:export",
    "analytics:class",
    "adaptive:audit",
  ]),
  STUDENT: new Set<Permission>(["curriculum:read", "practice:take", "assignments:read"]),
  PARENT: new Set<Permission>(["assignments:read", "reports:read"]),
};

export interface Actor {
  userId: string;
  role: Role;
  schoolId: string | null;
  /** Extra grants from RolePermission / per-user overrides (e.g. a lead teacher may publish). */
  extraPermissions?: Permission[];
  /** Resolved server-side from the database for this request. */
  studentId?: string; // when role = STUDENT
  teacherStudentIds?: ReadonlySet<string>; // students in classes this teacher teaches
  parentChildIds?: ReadonlySet<string>; // when role = PARENT
}

export function can(actor: Actor, permission: Permission): boolean {
  return ROLE_PERMISSIONS[actor.role].has(permission) || (actor.extraPermissions ?? []).includes(permission);
}

export interface StudentRecordRef {
  studentId: string;
  schoolId: string;
}

/** Row-level scope: who may see a given student's data. */
export function canAccessStudent(actor: Actor, target: StudentRecordRef): boolean {
  switch (actor.role) {
    case "SUPER_ADMIN":
      return true;
    case "SCHOOL_ADMIN":
      return actor.schoolId !== null && actor.schoolId === target.schoolId;
    case "TEACHER":
      return actor.schoolId === target.schoolId && (actor.teacherStudentIds?.has(target.studentId) ?? false);
    case "STUDENT":
      return actor.studentId === target.studentId;
    case "PARENT":
      return actor.parentChildIds?.has(target.studentId) ?? false;
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You do not have access to this resource.") {
    super(message);
  }
}

/** Throwing guards for server actions / route handlers. */
export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) throw new ForbiddenError(`Missing permission: ${permission}`);
}

export function assertStudentAccess(actor: Actor, target: StudentRecordRef): void {
  if (!canAccessStudent(actor, target)) throw new ForbiddenError();
}

/** Human-readable matrix for docs / the admin "Roles" page. */
export function permissionMatrix(): Record<Permission, Record<Role, boolean>> {
  const roles: Role[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "STUDENT", "PARENT"];
  return Object.fromEntries(
    PERMISSIONS.map((p) => [p, Object.fromEntries(roles.map((r) => [r, ROLE_PERMISSIONS[r].has(p)]))]),
  ) as Record<Permission, Record<Role, boolean>>;
}

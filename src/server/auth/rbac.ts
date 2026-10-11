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
  "questions:review", // approve / reject AI-drafted questions (teachers and admins)
  "questions:generate", // request AI-drafted questions (admins)
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
    "questions:review", // may review AI-drafted questions
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
  /** the permission that was missing (for logs and tests; never shown to users) */
  permission?: Permission;
  constructor(message = "You do not have access to this resource.", permission?: Permission) {
    super(message);
    if (permission) this.permission = permission;
  }
}

/** What each permission lets a person do, as words for "You don't have permission to …". */
const PERMISSION_ACTION: Record<Permission, string> = {
  "curriculum:read": "see the curriculum", "curriculum:edit": "change the curriculum",
  "questions:read": "see the questions", "questions:edit": "edit questions", "questions:publish": "publish",
  "questions:review": "review questions", "questions:generate": "create questions with AI",
  "practice:take": "practise", "students:read": "see students", "students:manage": "manage students",
  "teachers:manage": "manage teachers", "classes:manage": "manage classes",
  "assignments:create": "create assignments", "assignments:read": "see assignments",
  "reports:read": "see reports", "reports:export": "export reports",
  "analytics:class": "see class analytics", "analytics:school": "see school analytics",
  "imports:run": "import files", "settings:engine": "change these settings", "settings:school": "change the school settings",
  "adaptive:audit": "see the adaptive audit", "schools:manage": "manage schools", "audit:read": "see the audit log",
};

/** The sentence a person sees when a permission is missing (never the raw permission code). */
export function permissionMessage(permission: Permission): string {
  return `You don't have permission to ${PERMISSION_ACTION[permission] ?? "do this"}. Ask an admin.`;
}

/** A message safe to show: an old "Missing permission: x:y" text becomes the friendly sentence. */
export function friendlyForbidden(message: string): string {
  const m = /Missing permission:\s*([a-z]+:[a-z]+)/i.exec(message);
  return m ? permissionMessage(m[1] as Permission) : message;
}

/** Throwing guards for server actions / route handlers. */
export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) throw new ForbiddenError(permissionMessage(permission), permission);
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

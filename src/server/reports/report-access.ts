/**
 * Shared access rules and small helpers for the Update 39C reports (grammar, games, RTI weekly plan, Below/On/Above
 * distribution, ReadMaster, ReadRise export). One rule each, used by the pages AND the exports:
 *   class view      the class's teacher, a grade coordinator of its grade, a school admin (assertClassRead)
 *   student view    staff who can see the student (canAccessStudent) — never another student or a parent
 *   school view     analytics:school (school admins)
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import { assertClassRead } from "../teacher/coordinators";

export const DAY = 86_400_000;
export const s = (v: unknown) => String(v ?? "");
export const time = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : new Date(v instanceof Date ? v.toISOString() : s(v)).getTime());
export const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((100 * n) / d) : null);
export const avg = (xs: number[]): number | null => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
export const isStaff = (a: Actor) => a.role === "TEACHER" || a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";

/** Report windows offered on the pages (days). */
export const WINDOWS = [7, 30, 90, 365] as const;
export const windowOf = (v: unknown, def = 30): number => (WINDOWS as readonly number[]).includes(Number(v)) ? Number(v) : def;

export async function reportClass(repo: Repo, actor: Actor, classId: string): Promise<{ klass: Row; grade: number; ids: string[] }> {
  if (!isStaff(actor)) throw new ForbiddenError("You cannot open this class.");
  const klass = await assertClassRead(repo, actor, classId);
  const [g, members] = await Promise.all([repo.findUnique("Grade", { id: klass.gradeId }), repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] })]);
  return { klass, grade: Number(g?.level ?? 0), ids: [...new Set(members.map((m) => s(m.studentId)))] };
}

export async function reportStudent(repo: Repo, actor: Actor, studentId: string): Promise<Row> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || st.deletedAt || !isStaff(actor) || !canAccessStudent(actor, { studentId, schoolId: s(st.schoolId) })) throw new ForbiddenError("Student not found.");
  return st;
}

export function reportSchool(actor: Actor): string {
  assertCan(actor, "analytics:school");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  return actor.schoolId;
}

/** The grade's active curriculum skills (id → name, code, category). */
export async function gradeSkills(repo: Repo, gradeId: string): Promise<Row[]> {
  const curs = await repo.findMany("Curriculum", { gradeId, isActive: true }, { select: ["id"] });
  return curs.length ? (await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "name", "code", "category", "isActive", "sequence"] })).filter((k) => k.isActive !== false) : [];
}

/** Chunked `in` read (MySQL placeholder limits; bounded memory). */
export async function findIn(repo: Repo, model: string, field: string, ids: string[], extra: Record<string, unknown> = {}, select?: readonly string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += 500) out.push(...(await repo.findMany(model, { [field]: { in: ids.slice(i, i + 500) }, ...extra }, select ? { select } : undefined)));
  return out;
}

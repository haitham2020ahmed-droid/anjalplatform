/**
 * 🧑‍🏫 Grade coordinators. A coordinator is a teacher the admin puts in charge of one or more grades
 * (Settings → Grade coordinators). Besides their own classes, they can READ every class of those grades
 * (progress, MAP, Respond to Reading tracking, the grade summary). They cannot assign work to, or change,
 * classes they do not teach. Stored as a school setting: reversible, no new role.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { accessibleClasses } from "./assign";

const KEY = "coordinators";
const s = (v: unknown) => String(v ?? "");

export async function coordinatorMap(repo: Repo, schoolId: string | null): Promise<Record<string, number[]>> {
  if (!schoolId) return {};
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: KEY }))[0];
  let v: unknown = row?.value ?? null;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const out: Record<string, number[]> = {};
  if (v && typeof v === "object") for (const [k, g] of Object.entries(v as Record<string, unknown>)) if (Array.isArray(g)) out[k] = g.map(Number).filter((n) => Number.isInteger(n));
  return out;
}

/** The grades this person may see in full: admins every grade; coordinators theirs; others none. */
export async function coordinatorGrades(repo: Repo, actor: Actor): Promise<number[]> {
  if (actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") return (await repo.findMany("Grade", { schoolId: actor.schoolId })).map((g) => Number(g.level)).sort((a, b) => a - b);
  if (actor.role !== "TEACHER") return [];
  return ((await coordinatorMap(repo, actor.schoolId))[actor.userId] ?? []).sort((a, b) => a - b);
}

/** Classes this person may READ: their own + every class of the grades they coordinate. */
export async function readableClasses(repo: Repo, actor: Actor): Promise<Row[]> {
  const own = await accessibleClasses(repo, actor);
  if (actor.role !== "TEACHER") return own;
  const grades = await coordinatorGrades(repo, actor);
  if (!grades.length) return own;
  const gradeRows = (await repo.findMany("Grade", { schoolId: actor.schoolId })).filter((g) => grades.includes(Number(g.level)));
  const more = gradeRows.length ? await repo.findMany("Class", { schoolId: actor.schoolId, gradeId: { in: gradeRows.map((g) => g.id) }, deletedAt: null }) : [];
  const seen = new Set(own.map((c) => s(c.id)));
  return [...own, ...more.filter((c) => !seen.has(s(c.id)))];
}

export async function assertClassRead(repo: Repo, actor: Actor, classId: string): Promise<Row> {
  const c = (await readableClasses(repo, actor)).find((k) => s(k.id) === classId);
  if (!c) throw new ForbiddenError("You cannot open this class.");
  return c;
}

/** Admin: who coordinates which grades (an empty list removes the teacher). */
export async function setCoordinators(repo: Repo, actor: Actor, entries: { userId: string; grades: number[] }[], now = new Date()): Promise<number> {
  assertCan(actor, "settings:school");
  const teachers = await repo.findMany("User", { schoolId: actor.schoolId, role: "TEACHER" }, { select: ["id"] });
  const ok = new Set(teachers.map((t) => s(t.id)));
  const v: Record<string, number[]> = {};
  for (const e of entries) {
    if (!ok.has(e.userId)) throw new ValidationError("Only teachers of this school can be coordinators.");
    const g = [...new Set(e.grades.map(Number))].filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
    if (g.length) v[e.userId] = g.sort((a, b) => a - b);
  }
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId!, key: KEY }, { value: v, updatedById: actor.userId, updatedAt: now }, { value: v, updatedById: actor.userId, updatedAt: now });
  return Object.keys(v).length;
}

/**
 * 🧭 Program work: the student's assigned work of ONE program (MAP / RTI / NAFS / Curriculum / Grammar / Custom).
 * The same rows as My Work (myWorkItems), filtered by their source tag — so an item shows in My Work AND in its
 * program's page (/student/map, /student/rti, /student/nafs, /student/curriculum). Read only; nothing is assigned,
 * scored or moved here. The engine is not touched.
 */
import { ForbiddenError, type Actor } from "../auth/rbac";
import type { Repo } from "../seeding/repo";
import { myWorkItems, type MyWorkItem } from "../plans/wizard";
import type { SourceKey } from "../../lib/source-tags";

export type ProgramKey = SourceKey;
export const PROGRAMS: readonly ProgramKey[] = ["CURRICULUM", "MAP", "NAFS", "RTI", "GRAMMAR", "CUSTOM"];

const s = (v: unknown) => String(v ?? "");

/** Pure: the rows of one program, in My Work order (unknown program → none). */
export function filterProgramWork<T extends Pick<MyWorkItem, "sourceKey">>(items: readonly T[], program: string): T[] {
  const p = s(program).toUpperCase();
  if (!PROGRAMS.includes(p as ProgramKey)) return [];
  return items.filter((i) => i.sourceKey === p);
}

/** The student's own actor (for reads that take an actor): the user, school and student of this student row. */
export async function studentActorFor(repo: Repo, studentId: string): Promise<Actor> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st) throw new ForbiddenError("Not found.");
  return { userId: s(st.userId), role: "STUDENT", schoolId: st.schoolId ? s(st.schoolId) : null, studentId };
}

/**
 * The student's work of one program (same rows, statuses and links as My Work). Pages call it with the signed-in
 * student's own id (actor.studentId), so a student only ever reads their own work.
 */
export async function programWork(repo: Repo, studentId: string, program: ProgramKey | string, now = new Date()): Promise<MyWorkItem[]> {
  const actor = await studentActorFor(repo, studentId);
  return filterProgramWork(await myWorkItems(repo, actor, now), program);
}

/** "3 of 5 done": the progress line of a list of work rows. */
export function workProgress(items: readonly Pick<MyWorkItem, "status">[]): { done: number; total: number; pct: number } {
  const total = items.length, done = items.filter((i) => i.status === "Done").length;
  return { done, total, pct: total ? Math.round((100 * done) / total) : 0 };
}

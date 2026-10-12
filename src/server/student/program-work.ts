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

/**
 * ✅ My Work, as the page shows it — ONE source for the list, the progress line, the badge and the Continue button,
 * so the numbers always match the rows: `open` (not done, in order) and `done` rows, "X of Y done" over exactly these
 * rows, the to-do badge = open rows, and Continue = the last activity (a lesson, an article, a practice …) unless it
 * is work already Done (then the first open row; nothing to continue → no Continue button).
 */
export function myWorkView<T extends Pick<MyWorkItem, "status" | "href" | "skill" | "skillId">>(rows: readonly T[], last: { href: string; title: string } | null): {
  open: T[]; done: T[]; progress: { done: number; total: number; pct: number }; toDo: number; cont: { href: string; title: string } | null; allDone: boolean;
} {
  const open = rows.filter((r) => r.status !== "Done");
  const done = rows.filter((r) => r.status === "Done");
  const progress = workProgress(rows);
  const path = (h: string) => h.split(/[?#]/)[0];
  // a finished skill's practice (Done) is never "continued"; its row links to the report
  const lastIsDone = last ? done.some((r) => (r.skillId && path(last.href) === `/practice/${encodeURIComponent(r.skillId)}`) || path(r.href) === path(last.href)) && !open.some((r) => path(r.href) === path(last.href)) : false;
  const cont = last && !lastIsDone ? { href: last.href, title: last.title } : open[0] ? { href: open[0].href, title: open[0].skill } : null;
  return { open, done, progress, toDo: open.length, cont, allDone: progress.total > 0 && progress.done === progress.total };
}

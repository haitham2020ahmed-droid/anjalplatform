/**
 * 🇸🇦 Who sees NAFS (owner's spec, Update 15): NAFS is the Grade 6 national test, so the NAFS plan and NAFS views are
 * shown only to the school admins and to teachers who teach at least one Grade 6 class. Every NAFS page and action
 * asks here (pages refuse others; the menu's "Find a page" lists NAFS only for them). Two small bounded reads.
 */
import { cache } from "react";
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";

export const NAFS_GRADE = 6;
export const NAFS_REFUSED = "NAFS is for Grade 6 teachers only.";

export async function canSeeNafs(repo: Repo, actor: Actor): Promise<boolean> {
  if (actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN") return true;
  if (actor.role !== "TEACHER" || !actor.schoolId) return false;
  const t = await repo.findUnique("Teacher", { userId: actor.userId });
  if (!t) return false;
  const links = await repo.findMany("ClassTeacher", { teacherId: t.id }, { select: ["classId"] });
  if (!links.length) return false;
  const classes = await repo.findMany("Class", { id: { in: links.map((l) => l.classId) }, deletedAt: null }, { select: ["gradeId"] });
  if (!classes.length) return false;
  return (await repo.count("Grade", { id: { in: [...new Set(classes.map((c) => c.gradeId))] }, level: NAFS_GRADE })) > 0;
}

/** Once per request (the shell and the page ask the same question). */
export const canSeeNafsCached = cache(canSeeNafs);

export async function assertNafs(repo: Repo, actor: Actor): Promise<void> {
  if (!(await canSeeNafs(repo, actor))) throw new ForbiddenError(NAFS_REFUSED);
}

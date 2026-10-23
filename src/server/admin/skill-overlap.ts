/**
 * 👥 Internal admin report: skills that are weak in TWO OR MORE classes of the school at once — a pattern worth a
 * dean/supervisor coordinating a shared intervention for, not just one class's own problem. "Weak for a class"
 * reuses the Skills Grid's own rule (src/server/skills/skills-grid.ts isWeakForClass): fewer than half the class
 * has mastered it — the same threshold every class report, by source and Class report already use.
 * Admin-only (it reads across every teacher's classes, school-wide); never shown to students, parents or inside a
 * single teacher's own class pages.
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { readableClasses } from "../teacher/coordinators";
import { classSkills, isSupportStar, isWeakForClass, skillCounts } from "../skills/skills-grid";

const s = (v: unknown) => String(v ?? "");

/** At most this many classes are scanned (a bounded, occasional admin report — never run on every page load). */
export const MAX_CLASSES = 80;
/** A skill must be weak in at least this many classes to be "an overlap" worth surfacing. */
export const MIN_OVERLAP_CLASSES = 2;

export interface OverlapClassRow { classId: string; className: string; teacherName: string; weakStudents: number; totalStudents: number }
export interface SkillOverlapRow { key: string; name: string; classes: OverlapClassRow[] }

/** Every teacher of each class, named (the same lookup as insights/overview.ts classesAtAGlance). */
async function teacherNamesOf(repo: Repo, classIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!classIds.length) return out;
  const cts = await repo.findMany("ClassTeacher", { classId: { in: classIds } }, { select: ["classId", "teacherId"] });
  if (!cts.length) return out;
  const teacherRows = await repo.findMany("Teacher", { id: { in: [...new Set(cts.map((c) => s(c.teacherId)))] } }, { select: ["id", "userId"] });
  const users = teacherRows.length ? await repo.findMany("User", { id: { in: teacherRows.map((t) => s(t.userId)) } }, { select: ["id", "displayName"] }) : [];
  const userIdOfTeacher = new Map(teacherRows.map((t) => [s(t.id), s(t.userId)]));
  const nameOfUser = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  for (const classId of classIds) {
    const names = cts.filter((c) => s(c.classId) === classId).map((c) => nameOfUser.get(userIdOfTeacher.get(s(c.teacherId)) ?? "") ?? "").filter(Boolean);
    out.set(classId, [...new Set(names)].join(", ") || "—");
  }
  return out;
}

/** Skills weak (isWeakForClass) in 2+ classes of the school at once, most-shared first. Admin only (school-wide). */
export async function weakSkillOverlap(repo: Repo, actor: Actor, opts: { minClasses?: number } = {}): Promise<SkillOverlapRow[]> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only admins see the school-wide skill overlap.");
  const classes = (await readableClasses(repo, actor)).filter((c) => !c.deletedAt).slice(0, MAX_CLASSES);
  if (classes.length < 2) return [];
  const teacherOf = await teacherNamesOf(repo, classes.map((c) => s(c.id)));
  const names = new Map<string, string>();
  const byKey = new Map<string, OverlapClassRow[]>();
  for (const c of classes) {
    const classId = s(c.id);
    const d = await classSkills(repo, actor, { classId }).catch(() => null);
    if (!d || !d.students.length) continue;
    for (const sk of d.skills) {
      const counts = skillCounts(d, sk.key);
      if (!counts.total || !isWeakForClass(counts.mastered, counts.total)) continue;
      const weakStudents = d.students.filter((st) => isSupportStar(d.stars[st.id]?.[sk.key])).length;
      names.set(sk.key, sk.name);
      const list = byKey.get(sk.key) ?? [];
      list.push({ classId, className: s(c.name), teacherName: teacherOf.get(classId) ?? "—", weakStudents, totalStudents: counts.total });
      byKey.set(sk.key, list);
    }
  }
  const minClasses = Math.max(MIN_OVERLAP_CLASSES, opts.minClasses ?? MIN_OVERLAP_CLASSES);
  const rows: SkillOverlapRow[] = [...byKey.entries()]
    .filter(([, list]) => list.length >= minClasses)
    .map(([key, list]) => ({ key, name: names.get(key) ?? key, classes: list.sort((a, b) => b.weakStudents - a.weakStudents || a.className.localeCompare(b.className)) }));
  rows.sort((a, b) => b.classes.length - a.classes.length || b.classes.reduce((t, x) => t + x.weakStudents, 0) - a.classes.reduce((t, x) => t + x.weakStudents, 0) || a.name.localeCompare(b.name));
  return rows;
}

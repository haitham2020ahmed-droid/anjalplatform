/**
 * The page frame's data (menu numbers + a student's menu flags), once per request.
 * requireActor() starts it as soon as the person is known, so it is read AT THE SAME TIME as the page's own data
 * instead of after it (the frame is drawn last); AppShell then gets the same promise. Both parts are the same
 * short-lived per-person caches as before (15 s), so nothing shown changes.
 */
import { cache } from "react";
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { navCountsCached, type NavCount } from "../teacher/week-plan";
import { studentMenuFlagsCached, type StudentMenuFlags } from "../student/menu-flags";

export const shellData = cache(async (repo: Repo, actor: Actor): Promise<[Record<string, NavCount> | null, StudentMenuFlags | null]> => {
  const sid = actor.role === "STUDENT" ? actor.studentId : undefined;
  return Promise.all([
    navCountsCached(repo, actor).catch(() => null),
    sid ? studentMenuFlagsCached(repo, sid).catch(() => null) : Promise.resolve(null),
  ]);
});

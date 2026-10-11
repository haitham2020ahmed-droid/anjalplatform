/**
 * Per-user interface settings: the interface language (English | Arabic, for parents) and whether the
 * first-login tour has been shown. Each user can only change their OWN row (the actor is the session user).
 */
import type { Actor } from "@/server/auth/rbac";
import type { Repo, Row } from "@/server/seeding/repo";
import { isLang, type Lang } from "@/i18n";

/** Remember the interface language for this user (and only this user). */
export async function saveUiLang(repo: Repo, actor: Actor, lang: Lang): Promise<void> {
  if (!isLang(lang)) throw new Error("Unknown language.");
  await repo.updateMany("User", { id: actor.userId }, { uiLang: lang });
}

/** Roles that get the first-login tour. */
export const TOUR_ROLES = ["STUDENT", "TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as const;

/** The tour shows once: until the user finishes or skips it (stored on the user, so every device agrees). */
export function needsTour(user: Row | null | undefined, role: string): boolean {
  if (!user || !(TOUR_ROLES as readonly string[]).includes(role)) return false;
  return user.tourSeenAt === null || user.tourSeenAt === undefined;
}

/** Finished or skipped: never show it again automatically (the “Tour” button can still replay it). */
export async function markTourSeen(repo: Repo, actor: Actor, now = new Date()): Promise<void> {
  await repo.updateMany("User", { id: actor.userId, tourSeenAt: null }, { tourSeenAt: now });
}

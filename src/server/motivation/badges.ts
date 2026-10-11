/**
 * 🏅 Badges for Games Part 3: evaluation hooks, the favorite badge (emblem) and the Live Challenge hooks.
 * Badges are earned automatically (src/server/student/badges.ts works them out from the student's own records);
 * here they are re-checked on the events that can earn them (Question of the Day, Live Challenge, the rewards sync,
 * the daily job) — one bounded evaluation per event.
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { studentBadges, type StudentBadge } from "../student/badges";
import { awardCoins, COINS, forgetChip, rewardChip } from "./coins";
import { badgeByCode } from "../../lib/badge-catalog";

/** Re-checks every badge for one student; returns the codes earned just now. */
export async function evaluateBadges(repo: Repo, studentId: string, now = new Date()): Promise<string[]> {
  const all = await studentBadges(repo, studentId, now);
  const at = now.toISOString();
  return all.filter((b) => b.earned && b.earnedAt === at).map((b) => b.code);
}

export interface BadgeShelf { badges: StudentBadge[]; favorite: string | null }
/** All badges (earned in colour, locked faded) and the chosen favorite. */
export async function badgeShelf(repo: Repo, actor: Actor, now = new Date()): Promise<BadgeShelf> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const [badges, chip] = await Promise.all([studentBadges(repo, actor.studentId, now), rewardChip(repo, actor.studentId, now.getTime())]);
  return { badges, favorite: chip.favoriteBadge };
}

/** The student picks ONE favorite badge (must be earned); null clears it. */
export async function setFavoriteBadge(repo: Repo, actor: Actor, code: string | null): Promise<string | null> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  const sid = actor.studentId;
  if (code !== null) {
    if (!badgeByCode(code)) throw new ValidationError("Unknown badge.");
    const def = (await repo.findMany("Badge", { code }, { select: ["id"], take: 1 }))[0];
    const held = def ? await repo.count("StudentBadge", { studentId: sid, badgeId: def.id }) : 0;
    if (!held) throw new ValidationError("Earn this badge first.");
  }
  await repo.upsert("StudentReward", { studentId: sid }, { studentId: sid, favoriteBadge: code }, { favoriteBadge: code });
  forgetChip(sid);
  return code;
}

// ------------------------------------------------------------------ hooks for games / Live Challenge (GFOUND)

/** A student took part in a Live Challenge (once per game): a few coins for effort, then badges re-checked. */
export async function recordLiveChallengePlayed(repo: Repo, studentId: string, gameId: string, now = new Date()): Promise<{ coins: number; badges: string[] }> {
  const r = await awardCoins(repo, studentId, "live", COINS.live, gameId, { now });
  return { coins: r.awarded, badges: r.duplicate ? [] : await evaluateBadges(repo, studentId, now) };
}

/** The winner of a Live Challenge (once per game): coins + the Game Champion badge (unlocks the Champion Crown). */
export async function recordLiveChallengeWin(repo: Repo, studentId: string, gameId: string, now = new Date()): Promise<{ coins: number; badges: string[] }> {
  const r = await awardCoins(repo, studentId, "live.win", COINS.liveWin, gameId, { now });
  return { coins: r.awarded, badges: r.duplicate ? [] : await evaluateBadges(repo, studentId, now) };
}

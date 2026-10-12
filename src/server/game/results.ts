/**
 * 🎲 Games Part 1 — results and ratings.
 *
 * ONE short row per play (GamePlay: student, skill, game, correct, incorrect, points, date). Games NEVER call the
 * adaptive engine: no QuestionAttempt, no mastery, no level change — the row is all a game leaves behind. Points
 * (luck, power-ups) are game points only; reports and Reteach read correct / incorrect.
 *
 * Ratings: 1–5 stars per student and game (the latest counts). The usage report lists the most played and the
 * best rated games (a teacher sees plays of their own classes' students; an admin the whole school).
 */
import type { Repo } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { readableClasses } from "../teacher/coordinators";
import { GAMES, gameMeta } from "../../games/registry";
import { takeRound } from "./questions";
import { awardCoins, COINS } from "../motivation/coins";
import { recordGameMisses } from "../second-chance/service";

const s = (v: unknown) => String(v ?? "");
const int = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

export interface PlayRow { schoolId: string; studentId: string; skillId: string; gameId: string; mode: "SOLO" | "LIVE"; correct: number; incorrect: number; points: number; liveGameId?: string | null }

/** Saves one result row (internal: solo results go through recordSoloResult, Live Challenge through the room). */
export async function savePlay(repo: Repo, row: PlayRow, now = new Date()): Promise<string> {
  const r = await repo.create("GamePlay", { ...row, liveGameId: row.liveGameId ?? null, gameId: row.gameId.slice(0, 32), correct: int(row.correct, 500), incorrect: int(row.incorrect, 500), points: int(row.points, 10_000_000), createdAt: now });
  return s(r.id);
}

/** A solo round's result (only for a round the server really handed out to this student; once). */
export async function recordSoloResult(repo: Repo, actor: Actor, input: { roundId: string; correct: number; incorrect: number; points: number; missed?: unknown }, now = new Date()): Promise<string> {
  return (await recordSoloPlay(repo, actor, input, now)).id;
}

/**
 * The result row + the game coins (Games integration): a finished round with at least one answer pays COINS.game
 * (effort counts — right or wrong), refId = the play id, inside the shared 25-coins-a-day game cap. A coin problem
 * never loses the result row. Coins never change levels, scores or reports.
 */
export async function recordSoloPlay(repo: Repo, actor: Actor, input: { roundId: string; correct: number; incorrect: number; points: number; missed?: unknown }, now = new Date()): Promise<{ id: string; coins: number }> {
  if (actor.role !== "STUDENT" || !actor.studentId || !actor.schoolId) throw new ForbiddenError("Students play games.");
  const round = takeRound(s(input.roundId), actor.studentId);
  if (!round) throw new ValidationError("This round has ended. Press Play again.");
  const correct = int(input.correct, round.n), incorrect = int(input.incorrect, round.n - correct);
  const id = await savePlay(repo, { schoolId: actor.schoolId, studentId: actor.studentId, skillId: round.skillId, gameId: round.gameId, mode: "SOLO", correct, incorrect, points: int(input.points, 100_000) }, now);
  // ⭐ every question missed in the round waits in Second Chance (only questions this round really served; never
  // levels, mastery or attempts — games never feed the engine)
  const served = new Set(round.ids);
  const missed = [...new Set((Array.isArray(input.missed) ? input.missed : []).map(s))].filter((q) => served.has(q)).slice(0, incorrect);
  if (missed.length) await recordGameMisses(repo, actor.studentId, missed, now).catch(() => 0);
  let coins = 0;
  if (correct + incorrect > 0) coins = (await awardCoins(repo, actor.studentId, "game", COINS.game, id, { now }).catch(() => null))?.awarded ?? 0;
  return { id, coins };
}

/** A student's 1–5 star rating of a game (one per student and game; changing it replaces it). */
export async function rateGame(repo: Repo, actor: Actor, gameId: string, stars: number, now = new Date()): Promise<void> {
  if (actor.role !== "STUDENT" || !actor.studentId || !actor.schoolId) throw new ForbiddenError("Students rate games.");
  if (!gameMeta(gameId)) throw new ValidationError("Unknown game.");
  const n = Math.round(Number(stars));
  if (!(n >= 1 && n <= 5)) throw new ValidationError("Choose 1 to 5 stars.");
  await repo.upsert("GameRating", { studentId: actor.studentId, gameId }, { schoolId: actor.schoolId, studentId: actor.studentId, gameId, stars: n, createdAt: now, updatedAt: now }, { stars: n, updatedAt: now });
}

export async function myRating(repo: Repo, actor: Actor, gameId: string): Promise<number | null> {
  if (!actor.studentId) return null;
  const r = (await repo.findMany("GameRating", { studentId: actor.studentId, gameId }))[0];
  return r ? Number(r.stars) : null;
}

export interface GameUsageRow { gameId: string; name: string; icon: string; plays: number; players: number; solo: number; live: number; correctPct: number | null; ratings: number; avgStars: number | null }
/** One class of the games report: plays, players, the class's most played game, its students' average stars. */
export interface GameClassRow { classId: string; name: string; students: number; plays: number; players: number; live: number; topGame: string | null; topGameName: string | null; avgStars: number | null }

const avg1 = (xs: number[]) => (xs.length ? Math.round((10 * xs.reduce((t, x) => t + x, 0)) / xs.length) / 10 : null);

/**
 * Most played / best rated games over the last `days` days (Games report: Reports hub + admin). A teacher sees the
 * plays of their own (and coordinated) classes' students; a school admin the whole school. By class: plays,
 * players, the most played game and the class's average stars. `classId` narrows the game rows to one class.
 * Ratings in the game rows are the anonymous school-wide average (no student is named anywhere).
 */
export async function gamesUsage(repo: Repo, actor: Actor, days = 30, now = new Date(), opts: { classId?: string | null } = {}): Promise<{ days: number; rows: GameUsageRow[]; scope: "SCHOOL" | "CLASSES"; byClass: GameClassRow[]; classId: string | null }> {
  assertCan(actor, "reports:read");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  const from = new Date(now.getTime() - days * 86_400_000);
  const admin = actor.role === "SCHOOL_ADMIN" || actor.role === "SUPER_ADMIN";
  let plays = await repo.findMany("GamePlay", { schoolId: actor.schoolId, createdAt: { gte: from } }, { select: ["studentId", "gameId", "mode", "correct", "incorrect"] });
  const classes = (await readableClasses(repo, actor)).filter((c) => !c.deletedAt).sort((a, b) => s(a.name).localeCompare(s(b.name)));
  const members = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId", "classId"] }) : [];
  const byClassIds = new Map<string, Set<string>>();
  for (const m of members) { const k = s(m.classId); if (!byClassIds.has(k)) byClassIds.set(k, new Set()); byClassIds.get(k)!.add(s(m.studentId)); }
  if (!admin) {
    const ids = new Set(members.map((m) => s(m.studentId)));
    plays = plays.filter((p) => ids.has(s(p.studentId)));
  }
  const ratingsAll = await repo.findMany("GameRating", { schoolId: actor.schoolId }, { select: ["gameId", "stars", "studentId"] });
  const byClass: GameClassRow[] = classes.map((c) => {
    const ids = byClassIds.get(s(c.id)) ?? new Set<string>();
    const p = plays.filter((x) => ids.has(s(x.studentId)));
    const count = new Map<string, number>();
    for (const x of p) count.set(s(x.gameId), (count.get(s(x.gameId)) ?? 0) + 1);
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      classId: s(c.id), name: s(c.name), students: ids.size, plays: p.length, players: new Set(p.map((x) => s(x.studentId))).size, live: p.filter((x) => x.mode === "LIVE").length,
      topGame: top, topGameName: top ? gameMeta(top)?.name ?? top : null, avgStars: avg1(ratingsAll.filter((r) => ids.has(s(r.studentId))).map((r) => Number(r.stars))),
    };
  });
  const classId = opts.classId && byClassIds.has(s(opts.classId)) ? s(opts.classId) : null;
  if (opts.classId && !classId) throw new ForbiddenError("You cannot open this class.");
  if (classId) plays = plays.filter((p) => byClassIds.get(classId)!.has(s(p.studentId)));
  // ratings are an anonymous school-wide average (no student is named)
  const ratings = ratingsAll;
  const rows = GAMES.map((g) => {
    const p = plays.filter((x) => x.gameId === g.id), r = ratings.filter((x) => x.gameId === g.id);
    const c = p.reduce((t, x) => t + Number(x.correct), 0), n = p.reduce((t, x) => t + Number(x.correct) + Number(x.incorrect), 0);
    return {
      gameId: g.id, name: g.name, icon: g.icon, plays: p.length, players: new Set(p.map((x) => s(x.studentId))).size,
      solo: p.filter((x) => x.mode === "SOLO").length, live: p.filter((x) => x.mode === "LIVE").length,
      correctPct: n ? Math.round((100 * c) / n) : null, ratings: r.length, avgStars: avg1(r.map((x) => Number(x.stars))),
    };
  }).sort((a, b) => b.plays - a.plays || (b.avgStars ?? 0) - (a.avgStars ?? 0));
  return { days, rows, scope: admin ? "SCHOOL" : "CLASSES", byClass, classId };
}

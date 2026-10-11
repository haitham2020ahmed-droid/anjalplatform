/**
 * 🎲 Which games to SHOW (hide games with too few fitting questions — students never see a "coming later" game).
 *
 * Cheap and server-side: the fitting counts come from fittingCounts (one grouped count of the whole school's bank per
 * set of question types, cached briefly), so a My Work page with many rows costs a few map look-ups. Games that use
 * the same question types share one count. A skill's count is its family's (the same skill in every grade is one
 * question pool) when the school's skill index knows the families; otherwise the skill's own.
 *
 * Read only: nothing here changes a level, a score or a question.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { schoolSkillIndex } from "../questions/skill-questions";
import { fittingCounts, gameAvailability } from "./questions";
import { GAMES, gamesWithEnough, type GameCounts } from "../../games/registry";
import type { GameId, GameMeta } from "../../games/types";

const s = (v: unknown) => String(v ?? "");
/** at most this many skills in one request (a My Work page) */
export const MAX_SKILLS = 60;

/** The skill's family members in this school (pooled bank), or just the skill. */
function poolOf(idx: Awaited<ReturnType<typeof schoolSkillIndex>>, id: string): string[] {
  if (!idx.ids.has(id)) return [];
  const fam = idx as unknown as { keyOf?: Map<string, string>; members?: Map<string, string[]> };
  const key = fam.keyOf?.get(id);
  const members = key ? fam.members?.get(key) : undefined;
  return members?.length ? members : [id];
}

/** One representative game per distinct set of question types. */
function typeGroups(): Map<string, GameMeta[]> {
  const out = new Map<string, GameMeta[]>();
  for (const g of GAMES) { const k = [...g.types].sort().join("|"); const l = out.get(k); if (l) l.push(g); else out.set(k, [g]); }
  return out;
}

/**
 * Fitting-question counts per game for each group of skills (a group = one skill, or a Live Challenge's chosen
 * skills together). Skills of other schools count 0.
 */
export async function fittingByGame(repo: Repo, schoolId: string, groups: string[][]): Promise<GameCounts[]> {
  const idx = await schoolSkillIndex(repo, schoolId);
  const pools = groups.map((g) => [...new Set(g.map(s).flatMap((id) => poolOf(idx, id)))]);
  const all = [...new Set(pools.flat())];
  const out: GameCounts[] = groups.map(() => ({}));
  for (const games of typeGroups().values()) {
    const counts = all.length ? await fittingCounts(repo, schoolId, all, games[0]) : new Map<string, number>();
    pools.forEach((pool, i) => { const n = pool.reduce((t, id) => t + (counts.get(id) ?? 0), 0); for (const g of games) out[i][g.id] = n; });
  }
  return out;
}

/** The whole school bank's fitting counts per game (a game the bank cannot fill never shows anywhere). */
export async function bankCounts(repo: Repo, schoolId: string): Promise<GameCounts> {
  const idx = await schoolSkillIndex(repo, schoolId);
  return (await fittingByGame(repo, schoolId, [[...idx.ids]]))[0];
}

/** The games shown for a group of skills (solo or, with `live`, the Live Challenge modes). */
export async function visibleGameIds(repo: Repo, schoolId: string, skillIds: string[], opts: { live?: boolean } = {}): Promise<GameId[]> {
  const [counts] = await fittingByGame(repo, schoolId, [skillIds]);
  const bank = await bankCounts(repo, schoolId);
  return gamesWithEnough(counts, { live: opts.live, bank }).map((g) => g.id);
}

/** Live Challenge: the game modes with enough fitting questions for the chosen skills (none chosen: the whole bank). */
export async function liveModesFor(repo: Repo, actor: Actor, skillIds: string[]): Promise<GameId[]> {
  if (!actor.schoolId || !["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"].includes(actor.role)) return [];
  const ids = [...new Set(skillIds.map(s))].slice(0, MAX_SKILLS);
  if (!ids.length) return gamesWithEnough(await bankCounts(repo, actor.schoolId), { live: true }).map((g) => g.id);
  return visibleGameIds(repo, actor.schoolId, ids, { live: true });
}

/**
 * My Work: for each skill, whether the Play button shows (at least one game has enough fitting questions). Only the
 * student's own skills (their grade's, or assigned to them) can be true. One read of the student and their assignments.
 */
export async function playButtons(repo: Repo, actor: Actor, skillIds: string[]): Promise<Record<string, boolean>> {
  const ids = [...new Set(skillIds.map(s).filter(Boolean))].slice(0, MAX_SKILLS);
  const out: Record<string, boolean> = Object.fromEntries(ids.map((id) => [id, false]));
  if (actor.role !== "STUDENT" || !actor.studentId || !actor.schoolId || !ids.length) return out;
  const idx = await schoolSkillIndex(repo, actor.schoolId);
  const inSchool = ids.filter((id) => idx.ids.has(id));
  if (!inSchool.length) return out;
  // the student's skills: their own grade's, or assigned to them (same rule as canPlayGameSkill, read once)
  const st = await repo.findUnique("Student", { id: actor.studentId });
  const grade = st?.gradeId ? Number((await repo.findUnique("Grade", { id: st.gradeId }))?.level ?? 0) : 0;
  const allowed = new Set(inSchool.filter((id) => grade && idx.gradeOf.get(id) === grade));
  const rest = inSchool.filter((id) => !allowed.has(id));
  if (rest.length) {
    const mine = await repo.findMany("AssignmentStudent", { studentId: actor.studentId }, { select: ["assignmentId"] });
    if (mine.length) {
      const asg = await repo.findMany("Assignment", { id: { in: mine.map((r) => r.assignmentId) }, skillId: { in: rest }, deletedAt: null }, { select: ["skillId"] });
      for (const a of asg) allowed.add(s(a.skillId));
    }
  }
  const mineIds = inSchool.filter((id) => allowed.has(id));
  if (!mineIds.length) return out;
  const [counts, bank] = await Promise.all([fittingByGame(repo, actor.schoolId, mineIds.map((id) => [id])), bankCounts(repo, actor.schoolId)]);
  for (const [i, id] of mineIds.entries()) {
    const games = gamesWithEnough(counts[i], { bank });
    // only games with their own finer check (e.g. Word Guess: a one-word answer) qualify by count: check them for real
    out[id] = games.length > 0 && (games.some((g) => !g.fits) || (await gameAvailability(repo, actor.schoolId, id)).some((g) => g.status === "PLAY"));
  }
  return out;
}

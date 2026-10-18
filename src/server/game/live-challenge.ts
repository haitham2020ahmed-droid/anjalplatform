/**
 * 🏁 Live Challenge (Games Part 1) — the server side around the in-memory rooms (rooms.ts):
 *
 *   setup      skills of ANY grade (search + Reading / Grammar / Vocabulary filters), a game mode from the registry,
 *              questions, seconds per question, level (same for all / each student's level), for the teacher's OWN
 *              class only (assertClassAccess). "Save as template" keeps the setup.
 *   questions  filled from the bank with the shared provider (questions.ts): round-robin across the skills, each
 *              question in a Below / On / Above version when "each student's level" is on.
 *   join       only signed-in students of that class (ClassMembership); the same student rejoins the same player.
 *   summary    saved ONCE at the end into the existing live-game tables (LiveGame with mode + summary JSON,
 *              LiveGamePlayer, LiveGameAnswer — so the Live games report shows it) and GamePlay rows (correct /
 *              incorrect per student per skill). Never the adaptive engine: no attempts, mastery or levels.
 *   reteach    every skill under 70% goes to THAT student's My Work — the Assessments Reteach path (assignReteach).
 *   rewards    once at the end (rewardChallenge): every student who answered at least one question gets the "live"
 *              participation coins (effort counts, winning or not) and badge check; the winner (rank 1 — in a team
 *              game every member of the winning team) gets "live.win" + Game Champion. Idempotent per game id, inside
 *              the shared 25-coins-a-day game cap. Coins never change levels, scores or reports.
 */
import { randomInt, randomUUID } from "node:crypto";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { assertClassRead } from "../teacher/coordinators";
import { audit } from "../audit";
import { skillPickerList } from "../skills/picker";
import type { SkillTab, SkillTabFilter } from "../../lib/skill-picker";
import { schoolSkillIndex } from "../questions/skill-questions";
import { hideLevels } from "../../lib/hide-levels";
import { gameMeta, liveModes } from "../../games/registry";
import type { GameId, LiveQuestionView, PlayLevel } from "../../games/types";
import { assignReteach } from "../tests/assessments";
import { fittingCounts, pickItems, studentsPlayLevels, type Picked } from "./questions";
import { savePlay } from "./results";
import { recordGameMisses } from "../second-chance/service";
import { emblemsFor } from "../motivation/coins";
import { recordLiveChallengePlayed, recordLiveChallengeWin } from "../motivation/badges";
import { liveFeatures } from "../../games/live-features";
import {
  codeInUse, createRoom, joinRoom, notify, roomByCode, roomById, roomResults, allRooms, winningTeam, RETEACH_BELOW_PCT,
  type LevelMode, type Room, type RoomItem, type RoomResults, type RoomSlot,
} from "./rooms";

const s = (v: unknown) => String(v ?? "");
const json = <T,>(v: unknown, def: T): T => { if (v === null || v === undefined) return def; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return def; } } return v as T; };
const LEVELS: PlayLevel[] = ["BELOW", "ON", "ABOVE"];
export const MAX_SKILLS = 10;
export const COUNT_RANGE = [5, 30] as const;
export const SECONDS_RANGE = [10, 60] as const;

function staff(actor: Actor): void {
  assertCan(actor, "assignments:create");
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN") throw new ForbiddenError("Teachers run Live Challenges.");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
}

// ------------------------------------------------------------------ 1. setup: skills of any grade

export type SkillFilter = SkillTabFilter;
export interface ChallengeSkill {
  id: string; name: string; grade: number; filter: SkillTab; fitting: number;
  /** every name of the skill's shared pool (the search finds it by any of them) */
  names: string[];
  /** published questions of the pool */
  questions: number;
  /** every skill id of the pool (all grades) */
  skillIds: string[];
}

/**
 * EVERY active skill, one row per shared pool, from the one picker source (skillPickerList: the teacher's grades and —
 * all content being open to every teacher — the other grades), A–Z, each in a domain tab. `fitting` = the pool's
 * published questions this game mode can use (0 → the picker shows the skill disabled, "0 Q").
 */
export async function challengeSkills(repo: Repo, actor: Actor, opts: { q?: string; filter?: SkillFilter; grade?: number; mode?: string } = {}): Promise<ChallengeSkill[]> {
  staff(actor);
  const meta = gameMeta(s(opts.mode) || "quiz-race") ?? gameMeta("quiz-race")!;
  const rows = await skillPickerList(repo, actor, { onlyGrade: opts.grade, q: opts.q, tab: opts.filter });
  const counts = await fittingCounts(repo, actor.schoolId!, rows.map((k) => k.id), meta);
  return rows.map((k) => ({ id: k.id, name: hideLevels(k.name), names: k.names.map(hideLevels), grade: k.grade, filter: k.tab, fitting: counts.get(k.id) ?? 0, questions: k.questions, skillIds: k.skillIds }));
}

export interface ChallengeSpec { skillIds: string[]; mode: GameId; count: number; seconds: number; levelMode: LevelMode; /** the teacher's own questions per skill ("I'll pick the questions"); a skill not listed: the platform picks */ picks?: Record<string, string[]> }
/** At most this many picked questions per skill. */
export const MAX_PICKS_PER_SKILL = 30;

function cleanSpec(input: Partial<ChallengeSpec> & { skillIds?: unknown }): ChallengeSpec {
  const mode = s(input.mode || "quiz-race");
  if (!liveModes().some((g) => g.id === mode)) throw new ValidationError("Choose a game mode.");
  const skillIds = [...new Set((Array.isArray(input.skillIds) ? input.skillIds : []).map(s).filter(Boolean))];
  if (!skillIds.length) throw new ValidationError("Choose at least one skill.");
  if (skillIds.length > MAX_SKILLS) throw new ValidationError(`Choose at most ${MAX_SKILLS} skills.`);
  const count = Math.max(COUNT_RANGE[0], Math.min(COUNT_RANGE[1], Math.round(Number(input.count) || 10)));
  const seconds = Math.max(SECONDS_RANGE[0], Math.min(SECONDS_RANGE[1], Math.round(Number(input.seconds) || 20)));
  const picks: Record<string, string[]> = {};
  const raw = input.picks && typeof input.picks === "object" ? input.picks : {};
  for (const id of skillIds) {
    const list = Array.isArray(raw[id]) ? [...new Set(raw[id].map(s).filter(Boolean))].slice(0, MAX_PICKS_PER_SKILL) : [];
    if (list.length) picks[id] = list;
  }
  return { skillIds, mode: mode as GameId, count, seconds, levelMode: input.levelMode === "LEVEL" ? "LEVEL" : "SAME", ...(Object.keys(picks).length ? { picks } : {}) };
}

// ------------------------------------------------------------------ 2. start: build the room

function roomItem(p: Picked): RoomItem {
  const it = p.item;
  let view: RoomItem["view"];
  let right: string | null = null;
  if (it.type === "TRUE_FALSE") {
    view = { type: "TRUE_FALSE", stem: it.stem, passage: p.q.passage, options: [{ label: "true", text: "True" }, { label: "false", text: "False" }] };
    right = it.answer ? "true" : "false";
  } else if (it.options?.length) {
    view = { type: p.q.type, stem: it.stem, passage: p.q.passage, options: it.options.map((o) => ({ label: o.label, text: o.text })) };
    right = it.options.find((o) => o.correct)?.label ?? null;
  } else {
    const order = (a: string[]) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = randomInt(i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x; };
    view = { type: p.q.type, stem: it.stem, passage: p.q.passage, ...(it.sequence ? { elements: order(it.sequence) } : {}), ...(it.pairs ? { left: it.pairs.map((x) => x.left), right: order(it.pairs.map((x) => x.right)) } : {}) } as Omit<LiveQuestionView, "index" | "total" | "skillName">;
  }
  return { item: it, view, right };
}

/** An "exclude" set that excludes everything except the given ids (pickItems reads only `has`). */
class OnlyThese extends Set<string> {
  constructor(private keep: Set<string>) { super(); }
  override has(id: string): boolean { return !this.keep.has(id); }
}

/** Questions for the room: round-robin across the skills; one version per level when "each student's level" is on. */
async function buildSlots(repo: Repo, schoolId: string, spec: ChallengeSpec): Promise<RoomSlot[]> {
  const meta = gameMeta(spec.mode)!;
  const per = Math.ceil(spec.count / spec.skillIds.length) + 1;
  const names = new Map((await repo.findMany("Skill", { id: { in: spec.skillIds } }, { select: ["id", "name"] })).map((k) => [s(k.id), hideLevels(s(k.name))]));
  const lists = new Map<string, Record<PlayLevel, Picked[]>>();
  for (const skillId of spec.skillIds) {
    const byLevel = {} as Record<PlayLevel, Picked[]>;
    const own = spec.picks?.[skillId];
    if (own?.length) {
      // only the teacher's questions (that fit this game), everyone the same, in the teacher's order
      // (picked questions may come from the same skill of another grade: read each owner skill once)
      const keep = new Set(own);
      const owners = [...new Set((await repo.findMany("Question", { id: { in: own } }, { select: ["skillId"] })).map((q) => s(q.skillId)))];
      const fits: Picked[] = [];
      for (const owner of owners) fits.push(...(await pickItems(repo, schoolId, owner, meta, "ON", own.length + 4, { exclude: new OnlyThese(keep) })));
      const at = new Map(own.map((id, i) => [id, i]));
      const on = fits.sort((a, b) => (at.get(a.q.id) ?? 0) - (at.get(b.q.id) ?? 0)).slice(0, per);
      byLevel.BELOW = byLevel.ON = byLevel.ABOVE = on;
    } else if (spec.levelMode === "SAME") { const on = await pickItems(repo, schoolId, skillId, meta, "ON", per); byLevel.BELOW = byLevel.ON = byLevel.ABOVE = on; }
    else for (const l of LEVELS) byLevel[l] = await pickItems(repo, schoolId, skillId, meta, l, per);
    lists.set(skillId, byLevel);
  }
  const slots: RoomSlot[] = [];
  const used = new Map<string, number>(spec.skillIds.map((k) => [k, 0]));
  for (let guard = 0; slots.length < spec.count && guard < spec.count * spec.skillIds.length + 5; guard++) {
    let added = false;
    for (const skillId of spec.skillIds) {
      if (slots.length >= spec.count) break;
      const n = used.get(skillId)!, l = lists.get(skillId)!;
      if (!l.ON[n]) continue;
      const pick = (lv: PlayLevel) => roomItem(l[lv][n] ?? l.ON[n]);
      const on = pick("ON");
      slots.push({ skillId, skillName: names.get(skillId) ?? "Skill", byLevel: spec.levelMode === "SAME" ? { BELOW: on, ON: on, ABOVE: on } : { BELOW: pick("BELOW"), ON: on, ABOVE: pick("ABOVE") } });
      used.set(skillId, n + 1); added = true;
    }
    if (!added) break;
  }
  return slots;
}

async function freshCode(repo: Repo): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const c = String(randomInt(100000, 1000000));
    if (codeInUse(c)) continue;
    if ((await repo.findMany("LiveGame", { code: c }, { select: ["status"] })).some((g) => g.status !== "FINISHED")) continue;
    return c;
  }
  throw new ValidationError("Please try again.");
}

/** Start a Live Challenge for one of the teacher's OWN classes. Returns the room (in memory). */
export async function startChallenge(repo: Repo, actor: Actor, input: Partial<ChallengeSpec> & { classId: string; title?: string }, now = new Date()): Promise<{ id: string; code: string }> {
  staff(actor);
  const klass = await assertClassAccess(repo, actor, s(input.classId));   // teachers: own classes only
  const spec = cleanSpec(input);
  const idx = await schoolSkillIndex(repo, actor.schoolId!);
  for (const k of spec.skillIds) if (!idx.ids.has(k)) throw new ForbiddenError("Skill not found.");
  const slots = await buildSlots(repo, actor.schoolId!, spec);
  if (slots.length < 3) throw new ValidationError("These skills have fewer than 3 questions for this game. Choose more skills.");
  const members = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  // levels: for "each student's level", and for balancing teams (Team Tug) — read only, never changed
  const levels = spec.levelMode === "LEVEL" || liveFeatures(spec.mode).teams ? await studentsPlayLevels(repo, actor.schoolId!, members, grade, now) : new Map<string, PlayLevel>();
  const meta = gameMeta(spec.mode)!;
  const title = (s(input.title).replace(/\s+/g, " ").trim() || `${meta.name} · ${s(klass.name)}`).slice(0, 150);
  const room = createRoom({
    id: `lc${randomUUID().replace(/-/g, "").slice(0, 22)}`, code: await freshCode(repo), schoolId: actor.schoolId!, classId: s(klass.id), className: s(klass.name),
    hostUserId: actor.userId, title, mode: spec.mode, seconds: spec.seconds, levelMode: spec.levelMode, slots, expected: members.length, levels,
    persist: async (r) => { await saveSummary(repo, r); void rewardChallenge(repo, r).catch((e) => console.error("[live] rewards", e)); },
  }, now.getTime());
  await audit(repo, { actorId: actor.userId, action: "live.start", entityType: "Class", entityId: s(klass.id), after: { room: room.id, mode: spec.mode, questions: slots.length, skills: spec.skillIds.length, levelMode: spec.levelMode } });
  return { id: room.id, code: room.code };
}

// ------------------------------------------------------------------ access to a running room

/** The host's room (the teacher who started it, or a school admin of the same school). */
export function hostRoom(actor: Actor, roomId: string): Room {
  const room = roomById(s(roomId));
  if (!room || room.schoolId !== actor.schoolId) throw new ForbiddenError("This Live Challenge is not open.");
  if (room.hostUserId !== actor.userId && actor.role !== "SCHOOL_ADMIN") throw new ForbiddenError("Only the teacher who started it runs this Live Challenge.");
  return room;
}

/** A student joins (or rejoins) with the code. Only signed-in students of THAT class. Returns null when no room has the code. */
export async function joinChallenge(repo: Repo, actor: Actor, code: string, now = new Date()): Promise<Room | null> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students join games.");
  const room = roomByCode(s(code).replace(/\D/g, ""));
  if (!room) return null;
  if (room.schoolId !== actor.schoolId) throw new ForbiddenError("This game is for another class.");
  if (room.players.has(actor.studentId)) {   // rejoin: no checks needed again, same player (emblem refreshed, cheap)
    const em = (await emblemsFor(repo, [actor.studentId]).catch(() => null))?.get(actor.studentId);
    if (em) joinRoom(room, { studentId: actor.studentId, displayName: "", level: "ON", avatar: em.avatar, badge: em.badge });
    return room;
  }
  if (room.status === "FINISHED") throw new ValidationError("This game has ended.");
  if (!(await repo.findMany("ClassMembership", { classId: room.classId, studentId: actor.studentId, leftAt: null }, { select: ["studentId"] })).length) throw new ForbiddenError("This game is for another class.");
  const st = await repo.findUnique("Student", { id: actor.studentId });
  const u = st ? await repo.findUnique("User", { id: st.userId }) : null;
  // avatar + favorite badge for the Live Board (one read; a reward problem never blocks joining)
  const em = (await emblemsFor(repo, [actor.studentId]).catch(() => null))?.get(actor.studentId);
  joinRoom(room, { studentId: actor.studentId, displayName: s(u?.displayName ?? "Player"), level: room.levels.get(actor.studentId) ?? "ON", avatar: em?.avatar ?? null, badge: em?.badge ?? null }, now.getTime());
  return room;
}

/** A joined student's room (for the stream and answers). */
export function playerRoom(actor: Actor, code: string): Room {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students play games.");
  const room = roomByCode(s(code));
  if (!room || room.schoolId !== actor.schoolId || !room.players.has(actor.studentId)) throw new ForbiddenError("Join the game first.");
  return room;
}

/** Open Live Challenges of the student's classes (the home page notice). */
export async function openChallengesFor(repo: Repo, actor: Actor): Promise<{ code: string; title: string }[]> {
  if (actor.role !== "STUDENT" || !actor.studentId) return [];
  const rooms = allRooms().filter((r) => r.schoolId === actor.schoolId && r.status !== "FINISHED");
  if (!rooms.length) return [];
  const classes = new Set((await repo.findMany("ClassMembership", { studentId: actor.studentId, leftAt: null }, { select: ["classId"] })).map((m) => s(m.classId)));
  return rooms.filter((r) => classes.has(r.classId)).map((r) => ({ code: r.code, title: r.title }));
}

/** The teacher's running rooms (to reopen the projector screen). */
export function myOpenChallenges(actor: Actor): { id: string; code: string; title: string; status: string; joined: number }[] {
  return allRooms().filter((r) => r.hostUserId === actor.userId && r.status !== "FINISHED").map((r) => ({ id: r.id, code: r.code, title: r.title, status: r.status, joined: r.players.size }));
}

// ------------------------------------------------------------------ 3. the summary (saved once)

export interface ChallengeSummary { mode: GameId; levelMode: LevelMode; className: string; seconds: number; questions: number; results: RoomResults; reteachAt: string | null }

export async function saveSummary(repo: Repo, room: Room): Promise<void> {
  const res = roomResults(room);
  const created = new Date(room.createdAt), finished = new Date(room.finishedAt ?? Date.now());
  const summary: ChallengeSummary = { mode: room.mode, levelMode: room.levelMode, className: room.className, seconds: room.seconds, questions: room.slots.length, results: res, reteachAt: null };
  await repo.create("LiveGame", {
    id: room.id, schoolId: room.schoolId, classId: room.classId, hostId: room.hostUserId, code: room.code, title: room.title.slice(0, 191),
    questionIds: room.slots.map((sl) => sl.byLevel.ON.item.questionId), status: "FINISHED", currentIndex: room.index, secondsPerQuestion: room.seconds,
    createdAt: created, finishedAt: finished, mode: room.mode, summary,
  });
  const answers: Row[] = [];
  for (const p of room.players.values()) {
    const row = await repo.create("LiveGamePlayer", { gameId: room.id, studentId: p.studentId, nickname: p.name.slice(0, 60), score: p.points, streak: p.streak, joinedAt: new Date(p.joinedAt) });
    for (const [ix, a] of p.answers) answers.push({ gameId: room.id, playerId: row.id, questionIndex: ix, choice: a.choice.slice(0, 191), correct: a.correct, points: a.points, ms: Math.round(a.ms), createdAt: finished });
    // one GamePlay row per skill: correct / incorrect only count; points are game points
    for (const [skillId, k] of Object.entries(p.bySkill)) {
      await savePlay(repo, { schoolId: room.schoolId, studentId: p.studentId, skillId, gameId: room.mode, mode: "LIVE", correct: k.correct, incorrect: k.total - k.correct, points: 0, liveGameId: room.id }, finished);
    }
  }
  if (answers.length) await repo.createMany("LiveGameAnswer", answers);
  // ⭐ every question a student missed waits in their Second Chance: the version THEY saw (their level in a
  // "each student's level" game). Never an attempt, level or mastery change.
  for (const p of room.players.values()) {
    const missed = [...p.answers].filter(([, a]) => !a.correct).map(([ix]) => { const sl = room.slots[ix]; return sl ? (sl.byLevel[room.levelMode === "LEVEL" ? p.level : "ON"] ?? sl.byLevel.ON).item.questionId : ""; }).filter(Boolean);
    if (missed.length) await recordGameMisses(repo, p.studentId, missed, finished).catch(() => 0);
  }
  room.savedId = room.id;
}

/**
 * Coins and badges once the game has ended (called after the summary is saved; safe to call again — every award is
 * idempotent per game id). Effort counts: one answered question = participation coins, winning or not.
 */
export async function rewardChallenge(repo: Repo, room: Room, now = new Date()): Promise<{ played: number; winners: string[] }> {
  if (room.status !== "FINISHED" || room.index < 0) return { played: 0, winners: [] };
  const list = [...room.players.values()].filter((p) => p.answers.size > 0).sort((a, b) => a.rank - b.rank);
  const team = winningTeam(room);
  const winners = new Set<string>();
  if (room.features.teams) { if (team !== null) for (const p of list) if (p.team === team && p.points > 0) winners.add(p.studentId); }
  else if (list[0] && list[0].points > 0) winners.add(list[0].studentId);
  for (const p of list) {
    let coins = 0;
    try { coins += (await recordLiveChallengePlayed(repo, p.studentId, room.id, now)).coins; } catch (e) { console.error("[live] coins", e); }
    if (winners.has(p.studentId)) { try { coins += (await recordLiveChallengeWin(repo, p.studentId, room.id, now)).coins; } catch (e) { console.error("[live] win", e); } }
    p.coins = (p.coins ?? 0) + coins;
  }
  notify(room, "all");
  return { played: list.length, winners: [...winners] };
}

// ------------------------------------------------------------------ 4. results + Reteach (from the saved summary)

export interface ChallengeResultsView { id: string; title: string; classId: string; date: string; summary: ChallengeSummary }

async function savedChallenge(repo: Repo, actor: Actor, id: string): Promise<{ g: Row; summary: ChallengeSummary }> {
  assertCan(actor, "reports:read");
  const g = await repo.findUnique("LiveGame", { id: s(id) });
  if (!g || g.schoolId !== actor.schoolId || !g.mode || !g.classId) throw new ForbiddenError("Results not found.");
  if (g.hostId !== actor.userId) await assertClassRead(repo, actor, s(g.classId));   // own classes (coordinators read)
  const summary = json<ChallengeSummary | null>(g.summary, null);
  if (!summary) throw new ForbiddenError("Results not found.");
  return { g, summary };
}

export async function challengeResults(repo: Repo, actor: Actor, id: string): Promise<ChallengeResultsView> {
  const { g, summary } = await savedChallenge(repo, actor, id);
  const d = g.createdAt instanceof Date ? g.createdAt : new Date(s(g.createdAt));
  return { id: s(g.id), title: s(g.title), classId: s(g.classId), date: d.toISOString().slice(0, 10), summary };
}

/** One click: every skill under 70% goes to that student's My Work (the Assessments Reteach path). */
export async function reteachChallenge(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<{ assigned: number; students: number; skipped: string[] }> {
  staff(actor);
  const { g, summary } = await savedChallenge(repo, actor, id);
  await assertClassAccess(repo, actor, s(g.classId));   // assigning: own classes only
  const skills = summary.results.skills.map((k) => ({
    skillId: k.skillId,
    below: summary.results.students.filter((st) => st.bySkill[k.skillId] && st.bySkill[k.skillId].total > 0 && st.bySkill[k.skillId].pct < RETEACH_BELOW_PCT).map((st) => ({ id: st.studentId, name: st.fullName || st.name })),
  }));
  const r = await assignReteach(repo, actor, { classId: s(g.classId), note: `Reteach: ${s(g.title)}`.slice(0, 190), track: "CURRICULUM", source: "CURRICULUM", skills }, now);
  await repo.updateMany("LiveGame", { id: g.id }, { summary: { ...summary, reteachAt: now.toISOString() } });
  await audit(repo, { actorId: actor.userId, action: "live.reteach", entityType: "LiveGame", entityId: s(g.id), after: { assigned: r.assigned, students: r.who.size } });
  return { assigned: r.assigned, students: r.who.size, skipped: [...r.skipped] };
}

// ------------------------------------------------------------------ templates

export interface ChallengeTemplate { id: string; title: string; spec: ChallengeSpec; updatedAt: string }

export async function saveChallengeTemplate(repo: Repo, actor: Actor, input: { id?: string | null; title: string; spec: Partial<ChallengeSpec> }, now = new Date()): Promise<string> {
  staff(actor);
  const spec = cleanSpec(input.spec);
  const title = s(input.title).replace(/\s+/g, " ").trim().slice(0, 150) || "Live Challenge";
  if (input.id) {
    const t = await repo.findUnique("LiveChallengeTemplate", { id: s(input.id) });
    if (!t || t.userId !== actor.userId) throw new ForbiddenError("Template not found.");
    await repo.updateMany("LiveChallengeTemplate", { id: t.id }, { title, spec, updatedAt: now });
    return s(t.id);
  }
  return s((await repo.create("LiveChallengeTemplate", { schoolId: actor.schoolId, userId: actor.userId, title, spec, createdAt: now, updatedAt: now })).id);
}

export async function listChallengeTemplates(repo: Repo, actor: Actor): Promise<ChallengeTemplate[]> {
  staff(actor);
  const rows = await repo.findMany("LiveChallengeTemplate", { userId: actor.userId });
  const iso = (v: unknown) => (v instanceof Date ? v : new Date(s(v))).toISOString();
  return rows.map((r) => ({ id: s(r.id), title: s(r.title), spec: json<ChallengeSpec>(r.spec, { skillIds: [], mode: "quiz-race", count: 10, seconds: 20, levelMode: "SAME" }), updatedAt: iso(r.updatedAt) }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30);
}

export async function deleteChallengeTemplate(repo: Repo, actor: Actor, id: string): Promise<void> {
  staff(actor);
  const t = await repo.findUnique("LiveChallengeTemplate", { id: s(id) });
  if (!t || t.userId !== actor.userId) throw new ForbiddenError("Template not found.");
  await repo.deleteMany("LiveChallengeTemplate", { id: t.id });
}

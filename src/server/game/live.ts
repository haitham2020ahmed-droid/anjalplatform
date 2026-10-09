/**
 * 🎮 Live games (Kahoot / Blooket style). The teacher picks skills → a game with a 6-digit code and a QR code;
 * students join from their page or by scanning; the teacher starts and moves on; everyone answers on their own
 * device. Multiple choice and True/False only (big tiles, answered fast).
 * Points: 1000 for an instant correct answer, down to 500 at the last second, plus a streak bonus
 * (+100 per correct answer in a row, up to +500). Screens refresh by polling (no extra service needed).
 */
import { masterSkills } from "../skills/master";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { loadQuestionItems } from "../practice/items";
import { randomInt } from "node:crypto";

const s = (v: unknown) => String(v ?? "");
const t = (v: unknown) => (v ? new Date(v instanceof Date ? v.toISOString() : s(v)).getTime() : 0);
const ids = (v: unknown): string[] => { const x = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return []; } })() : v; return Array.isArray(x) ? x.map(String) : []; };
const GAME_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE"];
export const GRACE_MS = 1500;
export type GameStatus = "LOBBY" | "QUESTION" | "REVEAL" | "FINISHED";

/** Points for one answer (pure): correctness first, speed second, streak bonus. */
export function pointsFor(correct: boolean, elapsedMs: number, limitMs: number, streakBefore: number): number {
  if (!correct) return 0;
  const speed = Math.max(0, Math.min(1, elapsedMs / limitMs));
  return Math.round(1000 * (1 - speed / 2)) + Math.min(streakBefore, 5) * 100;
}

async function skillsOfActor(repo: Repo, actor: Actor): Promise<{ id: string; name: string; grade: number }[]> {
  // 🧩 the master skills list: every active skill of every grade (Grammar included)
  return (await masterSkills(repo, s(actor.schoolId))).map((k) => ({ id: k.id, name: k.name, grade: k.grade }));
}

async function gameQuestionIds(repo: Repo, skillIds: string[]): Promise<{ skillId: string; id: string }[]> {
  if (!skillIds.length) return [];
  const types = await repo.findMany("QuestionType", { code: { in: GAME_TYPES } }, { select: ["id"] });
  return (await repo.findMany("Question", { skillId: { in: skillIds }, status: "PUBLISHED", deletedAt: null, typeId: { in: types.map((x) => x.id) } }, { select: ["id", "skillId"] })).map((q) => ({ id: s(q.id), skillId: s(q.skillId) }));
}

/** Skills a teacher can make a game from (with how many game-ready questions each has). */
export async function gameSkills(repo: Repo, actor: Actor, grade?: number): Promise<{ id: string; name: string; grade: number; questions: number }[]> {
  assertCan(actor, "assignments:create");
  const skills = (await skillsOfActor(repo, actor)).filter((k) => !grade || k.grade === grade);
  const qs = await gameQuestionIds(repo, skills.map((k) => k.id));
  const count = new Map<string, number>();
  for (const q of qs) count.set(q.skillId, (count.get(q.skillId) ?? 0) + 1);
  return skills.map((k) => ({ ...k, questions: count.get(k.id) ?? 0 })).filter((k) => k.questions > 0).sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name));
}

export async function createGame(repo: Repo, actor: Actor, input: { title: string; skillIds: string[]; classId?: string | null; count?: number; seconds?: number }, now = new Date()): Promise<{ id: string; code: string }> {
  assertCan(actor, "assignments:create");
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN") throw new ForbiddenError("Teachers host games.");
  if (input.classId) await assertClassAccess(repo, actor, input.classId);
  const allowed = new Set((await skillsOfActor(repo, actor)).map((k) => k.id));
  const skillIds = [...new Set(input.skillIds)].filter((k) => allowed.has(k));
  if (!skillIds.length) throw new ValidationError("Choose at least one skill.");
  const pool = await gameQuestionIds(repo, skillIds);
  if (pool.length < 3) throw new ValidationError("These skills have fewer than 3 multiple-choice or True/False questions. Choose more skills.");
  const count = Math.max(3, Math.min(30, input.count ?? 10));
  // a fair mix: shuffle, then take questions round-robin across the chosen skills
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) { const j = randomInt(i + 1); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }   // Fisher–Yates
  const bySkill = new Map<string, string[]>();
  for (const q of shuffled) bySkill.set(q.skillId, [...(bySkill.get(q.skillId) ?? []), q.id]);
  const picked: string[] = [];
  for (let round = 0; picked.length < Math.min(count, pool.length); round++) for (const list of bySkill.values()) if (list[round] && picked.length < count) picked.push(list[round]);
  const seconds = Math.max(10, Math.min(60, input.seconds ?? 20));
  let code = "";
  for (let i = 0; i < 20 && !code; i++) { const c = String(randomInt(100000, 1000000)); /* unguessable PIN */ if (!(await repo.findMany("LiveGame", { code: c })).some((g) => g.status !== "FINISHED")) code = c; }
  if (!code) throw new ValidationError("Please try again.");
  const title = s(input.title).replace(/\s+/g, " ").trim() || "Live game";
  const g = await repo.create("LiveGame", { schoolId: actor.schoolId, classId: input.classId || null, hostId: actor.userId, code, title: title.slice(0, 191), questionIds: picked, status: "LOBBY", currentIndex: -1, secondsPerQuestion: seconds, createdAt: now });
  return { id: s(g.id), code };
}

async function hostGame(repo: Repo, actor: Actor, gameId: string): Promise<Row> {
  const g = await repo.findUnique("LiveGame", { id: gameId });
  if (!g || g.schoolId !== actor.schoolId) throw new ForbiddenError("Game not found.");
  if (g.hostId !== actor.userId && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only the host runs this game.");
  return g;
}

/** QUESTION ends by itself when time is up or everyone answered (checked whenever a screen refreshes). */
async function settle(repo: Repo, g: Row, now: Date): Promise<Row> {
  if (g.status !== "QUESTION") return g;
  const late = now.getTime() > t(g.questionStartedAt) + Number(g.secondsPerQuestion) * 1000 + GRACE_MS;
  const players = await repo.count("LiveGamePlayer", { gameId: g.id });
  const answered = await repo.count("LiveGameAnswer", { gameId: g.id, questionIndex: Number(g.currentIndex) });
  if (late || (players > 0 && answered >= players)) { await repo.updateMany("LiveGame", { id: g.id, status: "QUESTION" }, { status: "REVEAL" }); return { ...g, status: "REVEAL" }; }
  return g;
}

export async function hostAction(repo: Repo, actor: Actor, gameId: string, action: "start" | "reveal" | "next" | "end", now = new Date()): Promise<void> {
  const g = await hostGame(repo, actor, gameId);
  const total = ids(g.questionIds).length;
  if (action === "end") { await repo.updateMany("LiveGame", { id: gameId }, { status: "FINISHED", finishedAt: now }); return; }
  if (action === "start" && g.status === "LOBBY") {
    if (!(await repo.count("LiveGamePlayer", { gameId }))) throw new ValidationError("Wait until at least one student joins.");
    await repo.updateMany("LiveGame", { id: gameId }, { status: "QUESTION", currentIndex: 0, questionStartedAt: now }); return;
  }
  if (action === "reveal" && g.status === "QUESTION") { await repo.updateMany("LiveGame", { id: gameId }, { status: "REVEAL" }); return; }
  if (action === "next" && g.status === "REVEAL") {
    const nextIx = Number(g.currentIndex) + 1;
    if (nextIx >= total) await repo.updateMany("LiveGame", { id: gameId }, { status: "FINISHED", finishedAt: now });
    else await repo.updateMany("LiveGame", { id: gameId }, { status: "QUESTION", currentIndex: nextIx, questionStartedAt: now });
  }
}

async function leaderboard(repo: Repo, gameId: string): Promise<{ id: string; nickname: string; score: number; streak: number }[]> {
  return (await repo.findMany("LiveGamePlayer", { gameId })).map((p) => ({ id: s(p.id), nickname: s(p.nickname), score: Number(p.score), streak: Number(p.streak) })).sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
}

export interface GameQuestion { stem: string; type: string; options: { label: string; text: string; correct?: boolean; picks?: number }[] }
async function questionAt(repo: Repo, g: Row, withAnswers: boolean): Promise<GameQuestion | null> {
  const qid = ids(g.questionIds)[Number(g.currentIndex)];
  if (!qid) return null;
  const it = (await loadQuestionItems(repo, [qid]))[0];
  if (!it) return null;
  const options = it.type === "TRUE_FALSE"
    ? [{ label: "true", text: "True", correct: it.answer === true }, { label: "false", text: "False", correct: it.answer === false }]
    : (it.options ?? []).map((o) => ({ label: o.label, text: o.text, correct: o.correct }));
  return { stem: it.stem, type: it.type, options: options.map((o) => (withAnswers ? o : { label: o.label, text: o.text })) };
}

export interface HostView { id: string; code: string; title: string; status: GameStatus; index: number; total: number; seconds: number; endsAt: number | null; players: { nickname: string; score: number }[]; answered: number; question: GameQuestion | null; leaderboard: { nickname: string; score: number; streak: number }[] }
export async function hostView(repo: Repo, actor: Actor, gameId: string, now = new Date()): Promise<HostView> {
  const g = await settle(repo, await hostGame(repo, actor, gameId), now);
  const board = await leaderboard(repo, gameId);
  const status = s(g.status) as GameStatus;
  let question: GameQuestion | null = null, answered = 0;
  if (status === "QUESTION" || status === "REVEAL") {
    question = await questionAt(repo, g, status === "REVEAL");
    const answers = await repo.findMany("LiveGameAnswer", { gameId, questionIndex: Number(g.currentIndex) }, { select: ["choice"] });
    answered = answers.length;
    if (question && status === "REVEAL") question.options = question.options.map((o) => ({ ...o, picks: answers.filter((a) => a.choice === o.label).length }));
  }
  return { id: s(g.id), code: s(g.code), title: s(g.title), status, index: Number(g.currentIndex), total: ids(g.questionIds).length, seconds: Number(g.secondsPerQuestion), endsAt: status === "QUESTION" ? t(g.questionStartedAt) + Number(g.secondsPerQuestion) * 1000 : null, players: board.map((p) => ({ nickname: p.nickname, score: p.score })), answered, question, leaderboard: board.slice(0, 10) };
}

/** A student joins with the code (from their page or the QR). Class games: that class's students only. */
export async function joinGame(repo: Repo, actor: Actor, code: string, now = new Date()): Promise<string> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students join games.");
  const c = s(code).replace(/\D/g, "");
  const g = (await repo.findMany("LiveGame", { code: c })).find((x) => x.status !== "FINISHED" && x.schoolId === actor.schoolId);
  if (!g) throw new ValidationError("No game with this code is open. Check the code with your teacher.");
  if (g.classId && !(await repo.findMany("ClassMembership", { classId: g.classId, studentId: actor.studentId, leftAt: null })).length) throw new ForbiddenError("This game is for another class.");
  if (!(await repo.findMany("LiveGamePlayer", { gameId: g.id, studentId: actor.studentId })).length) {
    const st = await repo.findUnique("Student", { id: actor.studentId });
    const u = st ? await repo.findUnique("User", { id: st.userId }) : null;
    const parts = s(u?.displayName ?? "Player").split(/\s+/).filter(Boolean);
    const nickname = `${parts[0] ?? "Player"}${parts[1] ? ` ${parts[1][0]}.` : ""}`.slice(0, 60);
    await repo.create("LiveGamePlayer", { gameId: g.id, studentId: actor.studentId, nickname, score: 0, streak: 0, joinedAt: now });
  }
  return s(g.id);
}

async function playerOf(repo: Repo, actor: Actor, gameId: string): Promise<{ g: Row; p: Row }> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students play games.");
  const g = await repo.findUnique("LiveGame", { id: gameId });
  const p = g ? (await repo.findMany("LiveGamePlayer", { gameId, studentId: actor.studentId }))[0] : undefined;
  if (!g || !p) throw new ForbiddenError("Join the game first.");
  return { g, p };
}

export interface PlayerView { id: string; title: string; status: GameStatus; index: number; total: number; endsAt: number | null; question: GameQuestion | null; myAnswer: { choice: string; correct: boolean; points: number } | null; correctChoice: string | null; score: number; streak: number; rank: number; players: number; podium: { nickname: string; score: number }[] }
export async function playerView(repo: Repo, actor: Actor, gameId: string, now = new Date()): Promise<PlayerView> {
  const { g: g0, p } = await playerOf(repo, actor, gameId);
  const g = await settle(repo, g0, now);
  const status = s(g.status) as GameStatus;
  const board = await leaderboard(repo, gameId);
  const me = board.find((x) => x.id === p.id)!;
  const ix = Number(g.currentIndex);
  const mine = ix >= 0 ? (await repo.findMany("LiveGameAnswer", { playerId: p.id, questionIndex: ix }))[0] : undefined;
  const full = status === "QUESTION" || status === "REVEAL" ? await questionAt(repo, g, true) : null;
  return {
    id: s(g.id), title: s(g.title), status, index: ix, total: ids(g.questionIds).length, endsAt: status === "QUESTION" ? t(g.questionStartedAt) + Number(g.secondsPerQuestion) * 1000 : null,
    question: full ? { ...full, options: full.options.map((o) => ({ label: o.label, text: o.text })) } : null,
    myAnswer: mine ? { choice: s(mine.choice), correct: Boolean(mine.correct), points: Number(mine.points) } : null,
    correctChoice: status === "REVEAL" && full ? full.options.find((o) => o.correct)?.label ?? null : null,
    score: me.score, streak: me.streak, rank: board.findIndex((x) => x.id === p.id) + 1, players: board.length,
    podium: status === "FINISHED" ? board.slice(0, 3).map((x) => ({ nickname: x.nickname, score: x.score })) : [],
  };
}

export async function answerGame(repo: Repo, actor: Actor, gameId: string, index: number, choice: string, now = new Date()): Promise<{ correct: boolean; points: number }> {
  const { g, p } = await playerOf(repo, actor, gameId);
  if (g.status !== "QUESTION" || Number(g.currentIndex) !== index) throw new ValidationError("This question is closed.");
  const elapsed = now.getTime() - t(g.questionStartedAt), limit = Number(g.secondsPerQuestion) * 1000;
  if (elapsed > limit + GRACE_MS) throw new ValidationError("Time is up for this question.");
  if ((await repo.findMany("LiveGameAnswer", { playerId: p.id, questionIndex: index })).length) throw new ValidationError("You already answered.");
  const q = await questionAt(repo, g, true);
  if (!q || !q.options.some((o) => o.label === choice)) throw new ValidationError("Choose one of the answers.");
  const correct = q.options.some((o) => o.label === choice && o.correct);
  const points = pointsFor(correct, elapsed, limit, Number(p.streak));
  try {
    await repo.create("LiveGameAnswer", { gameId, playerId: p.id, questionIndex: index, choice: s(choice).slice(0, 191), correct, points, ms: Math.max(0, elapsed), createdAt: now });
  } catch { throw new ValidationError("You already answered."); }   // the unique key stops double taps
  await repo.updateMany("LiveGamePlayer", { id: p.id }, { score: Number(p.score) + points, streak: correct ? Number(p.streak) + 1 : 0 });
  return { correct, points };
}

/** Games a student can join now (their classes' open games, and school-wide ones). */
export async function openGamesFor(repo: Repo, actor: Actor): Promise<{ code: string; title: string }[]> {
  if (actor.role !== "STUDENT" || !actor.studentId) return [];
  const classes = new Set((await repo.findMany("ClassMembership", { studentId: actor.studentId, leftAt: null }, { select: ["classId"] })).map((m) => s(m.classId)));
  const recent = (await repo.findMany("LiveGame", { schoolId: actor.schoolId })).filter((g) => g.status === "LOBBY" && t(g.createdAt) > Date.now() - 6 * 3_600_000 && (!g.classId || classes.has(s(g.classId))));
  return recent.map((g) => ({ code: s(g.code), title: s(g.title) }));
}

export async function myGames(repo: Repo, actor: Actor): Promise<{ id: string; code: string; title: string; status: string; players: number; createdAt: string }[]> {
  const games = (await repo.findMany("LiveGame", { schoolId: actor.schoolId, hostId: actor.userId })).sort((a, b) => t(b.createdAt) - t(a.createdAt)).slice(0, 20);
  const players = games.length ? await repo.findMany("LiveGamePlayer", { gameId: { in: games.map((g) => g.id) } }, { select: ["gameId"] }) : [];
  return games.map((g) => ({ id: s(g.id), code: s(g.code), title: s(g.title), status: s(g.status), players: players.filter((x) => x.gameId === g.id).length, createdAt: new Date(t(g.createdAt)).toISOString().slice(0, 16).replace("T", " ") }));
}

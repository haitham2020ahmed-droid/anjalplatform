/**
 * 🏁 Live Challenge rooms — IN MEMORY (one Render instance), no database work while the game runs.
 *
 *   LOBBY ──start──▶ QUESTION ──(everyone answered | time up | Show answer)──▶ REVEAL ──Next──▶ QUESTION … ▶ FINISHED
 *                     ▲  Pause / Resume                                                       (summary saved once)
 *
 * Screens subscribe (Server-Sent Events, src/app/api/live/[code]/stream) and get SMALL JSON views:
 *   - the host (projector) gets the board after every answer (coalesced: at most ~8 updates a second),
 *   - students get a view when the phase changes (question, reveal with their points and rank, results).
 * A student who drops out rejoins the same player (keyed by the student id) — points, answers and power-ups kept.
 * Rooms close 60 minutes after they were made; the summary is saved when the game ends (or when it closes).
 *
 * Game points (speed, streaks, power-ups) are for the board only; the summary keeps correct / incorrect per skill
 * for results, Reports and Reteach. Nothing here touches the adaptive engine, mastery or levels.
 *
 * Games integration (live extras switched on per mode in src/games/live-features.ts):
 *   - every player carries their avatar + favorite badge (loaded once at join) → board, lobby, podium, devices;
 *   - `chest`: after a right answer, 1 of 3 chests (dealt once per question, one of each: bonus, double, or points
 *     taken from the classmate in the lead — never below 0); picked with the answer ({ choice, chest }, the Mystery
 *     Chest pad) or afterwards (openChest, the kit's chest picker); each opening is a board event;
 *   - `teams`: two teams balanced by level at Start (late joiners → the smaller team); team points = average;
 *   - `field`: the host view also carries every player (rockets by points on the projector).
 */
import { randomInt } from "node:crypto";
import { scoreResponse } from "../../imports/questions/validate";
import type { PracticeItem } from "../practice/items";
import { fiftyFifty, freshPowers, hintFor, scoreLive } from "../../games/kit/powerups";
import type { BankType, GameId, LiveQuestionView, PlayLevel, PowerUpId } from "../../games/types";
import { POWER_UPS } from "../../games/types";
import type { ChestPrize, ChestResult, LiveAvatar, LiveBoardRow, LiveEvent, LiveFeatures, LiveRacer, LiveTeam } from "../../games/types";
import { CHEST, liveFeatures, TEAMS } from "../../games/live-features";

export const ROOM_TTL_MS = 60 * 60_000;
export const GRACE_MS = 1500;
export const BOARD_SIZE = 8;
export const RETEACH_BELOW_PCT = 70;
const FLUSH_MS = 120;

export type RoomStatus = "LOBBY" | "QUESTION" | "REVEAL" | "FINISHED";
export type LevelMode = "SAME" | "LEVEL";

export interface RoomItem { item: PracticeItem; view: Omit<LiveQuestionView, "index" | "total" | "skillName">; right: string | null }
export interface RoomSlot { skillId: string; skillName: string; byLevel: Record<PlayLevel, RoomItem> }

export interface RoomAnswer { choice: string; correct: boolean; points: number; ms: number }
export interface RoomPlayer {
  studentId: string; first: string; last: string; name: string; level: PlayLevel;
  points: number; streak: number; correct: number; incorrect: number;
  bySkill: Record<string, { correct: number; total: number }>;
  answers: Map<number, RoomAnswer>;
  rank: number; startRank: number;
  power: Record<PowerUpId, number>; armed: PowerUpId[]; hidden: Map<number, string[]>; hints: Map<number, string>;
  joinedAt: number; online: number;
  /** avatar + favorite badge emblem (loaded once at join) */
  avatar: LiveAvatar | null; badge: string | null;
  /** team (modes with teams) */
  team: number | null;
  /** chests opened, by question index (modes with chest) */
  chests: Map<number, ChestResult>;
  /** points classmates took from this player (newest first, at most 3) */
  hits: { name: string; points: number; at: number }[];
  /** coins given for this game once it ended (null until then) */
  coins: number | null;
}
export interface Cheer { name: string; from: number; to: number; at: number }

export interface Subscriber { kind: "host" | "player"; studentId?: string; send: (json: string) => void }

export interface Room {
  id: string; code: string; schoolId: string; classId: string; className: string; hostUserId: string; title: string;
  mode: GameId; seconds: number; levelMode: LevelMode; slots: RoomSlot[];
  /** students of the class when the room was made (the "of 20" in "17 of 20 joined") */
  expected: number;
  players: Map<string, RoomPlayer>;
  status: RoomStatus; index: number; questionStartedAt: number; paused: boolean; pausedLeftMs: number;
  boardHidden: boolean; cheers: Cheer[];
  createdAt: number; expiresAt: number; finishedAt: number | null; saved: boolean;
  version: number; subs: Set<Subscriber>; pending: "host" | "all" | null; flushTimer: ReturnType<typeof setTimeout> | null; qTimer: ReturnType<typeof setTimeout> | null;
  /** set by live-challenge.ts: saves the summary once (async, errors logged) */
  persist?: (room: Room) => Promise<void>;
  /** the saved LiveGame id (results page) */
  savedId: string | null;
  /** each student's level ("each student's level" mode; On Level when unknown) */
  levels: Map<string, PlayLevel>;
  /** the mode's live extras (chest, teams, field) */
  features: LiveFeatures;
  /** board events (chests), newest first */
  events: LiveEvent[];
  /** Mystery Chest: the three prizes of each question (one of each, shuffled once, the same for everyone) */
  chestDeals: Map<number, ChestPrize[]>;
}

// ------------------------------------------------------------------ the room store (survives module reloads)

interface Store { rooms: Map<string, Room>; byCode: Map<string, string>; sweeper: ReturnType<typeof setInterval> | null }
const G = globalThis as unknown as { __liveRooms?: Store };
const store: Store = G.__liveRooms ?? (G.__liveRooms = { rooms: new Map(), byCode: new Map(), sweeper: null });

export const roomById = (id: string): Room | null => store.rooms.get(id) ?? null;
export const roomByCode = (code: string): Room | null => { const id = store.byCode.get(String(code).replace(/\D/g, "")); return id ? store.rooms.get(id) ?? null : null; };
export const allRooms = (): Room[] => [...store.rooms.values()];
export const codeInUse = (code: string): boolean => store.byCode.has(code);

export interface NewRoom { id: string; code: string; schoolId: string; classId: string; className: string; hostUserId: string; title: string; mode: GameId; seconds: number; levelMode: LevelMode; slots: RoomSlot[]; expected: number; levels?: Map<string, PlayLevel>; persist?: (room: Room) => Promise<void> }

export function createRoom(input: NewRoom, now = Date.now()): Room {
  sweepRooms(now);
  const room: Room = {
    ...input, levels: input.levels ?? new Map(), features: liveFeatures(input.mode), events: [], chestDeals: new Map(), players: new Map(), status: "LOBBY", index: -1, questionStartedAt: 0, paused: false, pausedLeftMs: 0, boardHidden: false, cheers: [],
    createdAt: now, expiresAt: now + ROOM_TTL_MS, finishedAt: null, saved: false, version: 0, subs: new Set(), pending: null, flushTimer: null, qTimer: null, savedId: null,
  };
  store.rooms.set(room.id, room);
  store.byCode.set(room.code, room.id);
  if (!store.sweeper) { store.sweeper = setInterval(() => sweepRooms(Date.now()), 60_000); (store.sweeper as { unref?: () => void }).unref?.(); }
  return room;
}

/** Closes rooms older than 60 minutes (saving a started game's summary first) and forgets finished ones. */
export function sweepRooms(now = Date.now()): number {
  let closed = 0;
  for (const room of [...store.rooms.values()]) {
    const finishedLongAgo = room.status === "FINISHED" && room.finishedAt !== null && now - room.finishedAt > 10 * 60_000;
    if (now < room.expiresAt && !finishedLongAgo) continue;
    if (room.status !== "FINISHED") finish(room, now);
    closeRoom(room);
    closed++;
  }
  return closed;
}

function closeRoom(room: Room): void {
  if (room.qTimer) clearTimeout(room.qTimer);
  if (room.flushTimer) clearTimeout(room.flushTimer);
  room.qTimer = room.flushTimer = null;
  for (const sub of room.subs) { try { sub.send(JSON.stringify({ closed: true })); } catch { /* gone */ } }
  room.subs.clear();
  store.rooms.delete(room.id);
  if (store.byCode.get(room.code) === room.id) store.byCode.delete(room.code);
}

/** Test helper: forget every room. */
export function resetRooms(): void { for (const r of [...store.rooms.values()]) closeRoom(r); }

// ------------------------------------------------------------------ players

/** Join (or REJOIN: the same student gets the same player back, with points and answers). */
export function joinRoom(room: Room, p: { studentId: string; displayName: string; level: PlayLevel; avatar?: LiveAvatar | null; badge?: string | null }, now = Date.now()): RoomPlayer {
  const had = room.players.get(p.studentId);
  if (had) { if (p.avatar !== undefined) { had.avatar = p.avatar; had.badge = p.badge ?? null; } return had; }
  const parts = String(p.displayName || "Player").trim().split(/\s+/).filter(Boolean);
  const player: RoomPlayer = {
    studentId: p.studentId, first: (parts[0] ?? "Player").slice(0, 30), last: parts.slice(1).join(" "), name: "", level: p.level,
    points: 0, streak: 0, correct: 0, incorrect: 0, bySkill: {}, answers: new Map(), rank: room.players.size + 1, startRank: room.players.size + 1,
    power: freshPowers(), armed: [], hidden: new Map(), hints: new Map(), joinedAt: now, online: 0,
    avatar: p.avatar ?? null, badge: p.badge ?? null, team: null, chests: new Map(), hits: [], coins: null,
  };
  room.players.set(p.studentId, player);
  if (room.features.teams) player.team = smallerTeam(room, player);
  nameAll(room);
  rank(room);
  notify(room, "host");
  return player;
}

/** First names only on the board; two students with the same first name get their last initial. */
function nameAll(room: Room): void {
  const count = new Map<string, number>();
  for (const p of room.players.values()) count.set(p.first.toLowerCase(), (count.get(p.first.toLowerCase()) ?? 0) + 1);
  for (const p of room.players.values()) p.name = (count.get(p.first.toLowerCase()) ?? 0) > 1 && p.last ? `${p.first} ${p.last[0]}.` : p.first;
}

// ------------------------------------------------------------------ teams (Team Tug)

const LEVEL_WEIGHT: Record<PlayLevel, number> = { ABOVE: 3, ON: 2, BELOW: 1 };
const weightOf = (room: Room, p: RoomPlayer) => LEVEL_WEIGHT[room.levels.get(p.studentId) ?? p.level ?? "ON"] ?? 2;

/** The team a new player joins: fewer members first, then the lower level total. */
function smallerTeam(room: Room, p: RoomPlayer): number {
  const size = [0, 0], weight = [0, 0];
  for (const x of room.players.values()) if (x !== p && x.team !== null) { size[x.team]++; weight[x.team] += weightOf(room, x); }
  return size[0] !== size[1] ? (size[0] < size[1] ? 0 : 1) : weight[0] <= weight[1] ? 0 : 1;
}

/** Balanced auto-split by level (at Start): strongest first, each to the team with fewer members / lower level total. */
export function splitTeams(room: Room): void {
  const list = [...room.players.values()].sort((a, b) => weightOf(room, b) - weightOf(room, a) || a.joinedAt - b.joinedAt);
  const size = [0, 0], weight = [0, 0];
  for (const p of list) {
    const t = size[0] !== size[1] ? (size[0] < size[1] ? 0 : 1) : weight[0] <= weight[1] ? 0 : 1;
    p.team = t; size[t]++; weight[t] += weightOf(room, p);
  }
}

/** Team points = the average of the members' game points (fair when a team is one player short). */
export function teamTotals(room: Room): LiveTeam[] | null {
  if (!room.features.teams) return null;
  return TEAMS.map((t) => {
    const m = [...room.players.values()].filter((p) => p.team === t.id);
    const total = m.reduce((n, p) => n + p.points, 0);
    return { id: t.id, name: t.name, color: t.color, members: m.length, total, points: m.length ? Math.round(total / m.length) : 0 };
  });
}

/** -1 … 1: where the rope is (negative = team 0 is pulling ahead). */
export function ropeOf(teams: LiveTeam[] | null): number | null {
  if (!teams) return null;
  const [a, b] = [teams[0].points, teams[1].points];
  return a + b ? Math.round((1000 * (b - a)) / (a + b)) / 1000 : 0;
}

/** The winning team's id (null: no teams or a tie). */
export function winningTeam(room: Room): number | null {
  const t = teamTotals(room);
  if (!t || t[0].points === t[1].points) return null;
  return t[0].points > t[1].points ? 0 : 1;
}

function ranked(room: Room): RoomPlayer[] {
  return [...room.players.values()].sort((a, b) => b.points - a.points || a.joinedAt - b.joinedAt || a.name.localeCompare(b.name));
}
function rank(room: Room): RoomPlayer[] {
  const list = ranked(room);
  list.forEach((p, i) => { p.rank = i + 1; });
  return list;
}

// ------------------------------------------------------------------ host controls

export class RoomError extends Error { constructor(msg: string, public code: "CLOSED" | "STATE" | "TIME" | "DUP" | "INPUT" = "STATE") { super(msg); } }

const limitMs = (room: Room) => room.seconds * 1000;

function startQuestion(room: Room, ix: number, now: number): void {
  room.index = ix; room.status = "QUESTION"; room.paused = false; room.questionStartedAt = now; room.cheers = [];
  for (const p of rank(room)) p.startRank = p.rank;
  armTimer(room, limitMs(room) + GRACE_MS);
}

function armTimer(room: Room, ms: number): void {
  if (room.qTimer) clearTimeout(room.qTimer);
  const ix = room.index;
  room.qTimer = setTimeout(() => { if (room.status === "QUESTION" && room.index === ix && !room.paused) { reveal(room); notify(room, "all"); } }, Math.max(0, ms));
  (room.qTimer as { unref?: () => void }).unref?.();
}

function reveal(room: Room): void {
  if (room.status !== "QUESTION") return;
  if (room.qTimer) clearTimeout(room.qTimer);
  room.qTimer = null;
  room.status = "REVEAL"; room.paused = false;
  // students who did not answer: the question counts as not correct for its skill
  const slot = room.slots[room.index];
  for (const p of room.players.values()) {
    if (p.answers.has(room.index) || !slot) continue;
    p.incorrect++; p.streak = 0;
    const k = (p.bySkill[slot.skillId] ??= { correct: 0, total: 0 }); k.total++;
  }
  rank(room);
}

function finish(room: Room, now: number): void {
  if (room.status === "QUESTION") reveal(room);
  if (room.status === "FINISHED") return;
  room.status = "FINISHED"; room.finishedAt = now; room.paused = false;
  if (room.qTimer) clearTimeout(room.qTimer);
  room.qTimer = null;
  rank(room);
  const started = room.index >= 0;
  if (started && !room.saved && room.persist) {
    room.saved = true;
    room.persist(room).then(() => notify(room, "host")).catch((e) => console.error("[live] could not save the summary", e));
  }
}

/** Time up is also checked whenever a screen asks (so tests and polling never depend on timers). */
export function settle(room: Room, now = Date.now()): void {
  if (room.status === "QUESTION" && !room.paused && now > room.questionStartedAt + limitMs(room) + GRACE_MS) { reveal(room); notify(room, "all"); }
  if (now >= room.expiresAt && room.status !== "FINISHED") { finish(room, now); notify(room, "all"); }
}

export type HostAction = "start" | "reveal" | "next" | "pause" | "resume" | "toggle-board" | "end";

export function hostAct(room: Room, action: HostAction, now = Date.now()): void {
  settle(room, now);
  if (room.status === "FINISHED" && action !== "toggle-board") throw new RoomError("This game has ended.", "CLOSED");
  switch (action) {
    case "start":
      if (room.status !== "LOBBY") throw new RoomError("The game has already started.");
      if (!room.players.size) throw new RoomError("Wait until at least one student joins.");
      if (room.features.teams) splitTeams(room);
      startQuestion(room, 0, now); break;
    case "reveal":
      if (room.status !== "QUESTION") throw new RoomError("No question is open.");
      reveal(room); break;
    case "next":
      if (room.status === "QUESTION") reveal(room);
      if (room.status !== "REVEAL") throw new RoomError("Show the answer first.");
      if (room.index + 1 >= room.slots.length) finish(room, now); else startQuestion(room, room.index + 1, now);
      break;
    case "pause":
      if (room.status !== "QUESTION" || room.paused) throw new RoomError("Nothing to pause.");
      room.paused = true; room.pausedLeftMs = Math.max(0, room.questionStartedAt + limitMs(room) - now);
      if (room.qTimer) clearTimeout(room.qTimer);
      room.qTimer = null; break;
    case "resume":
      if (!room.paused) throw new RoomError("The game is not paused.");
      room.paused = false; room.questionStartedAt = now - (limitMs(room) - room.pausedLeftMs);
      armTimer(room, room.pausedLeftMs + GRACE_MS); break;
    case "toggle-board":
      room.boardHidden = !room.boardHidden; notify(room, "host"); return;
    case "end":
      finish(room, now); break;
  }
  room.version++;
  notify(room, "all");
}

// ------------------------------------------------------------------ answers and power-ups

function itemFor(room: Room, p: RoomPlayer, ix = room.index): RoomItem | null {
  const slot = room.slots[ix];
  if (!slot) return null;
  return slot.byLevel[room.levelMode === "LEVEL" ? p.level : "ON"] ?? slot.byLevel.ON;
}

/** Normalise a device's response to what the bank's scorer expects (True/False tiles send "true"/"false"). */
function responseFor(it: PracticeItem, response: unknown): unknown {
  if (it.type === "TRUE_FALSE") return response === true || response === "true" ? true : response === false || response === "false" ? false : null;
  return response;
}

export interface AnswerResult { correct: boolean; points: number; doubled: boolean; shielded: boolean; chest?: ChestResult | null }

/** A chest-mode device may send `{ choice, chest }` (the chest picked before answering); plain answers still work. */
export function readChestPick(r: unknown): { choice: unknown; chest: number | null } {
  if (r && typeof r === "object" && !Array.isArray(r) && "choice" in r) {
    const c = Number((r as { chest?: unknown }).chest);
    return { choice: (r as { choice: unknown }).choice, chest: Number.isInteger(c) && c >= 0 && c <= 2 ? c : null };
  }
  return { choice: r, chest: null };
}

export function answer(room: Room, studentId: string, index: number, response: unknown, now = Date.now()): AnswerResult {
  settle(room, now);
  let chestPick: number | null = null;
  if (room.features.chest) { const r = readChestPick(response); response = r.choice; chestPick = r.chest; }
  const p = room.players.get(studentId);
  if (!p) throw new RoomError("Join the game first.", "INPUT");
  if (room.status !== "QUESTION" || room.index !== index) throw new RoomError("This question is closed.");
  if (room.paused) throw new RoomError("The game is paused.");
  const elapsed = now - room.questionStartedAt;
  if (elapsed > limitMs(room) + GRACE_MS) throw new RoomError("Time is up for this question.", "TIME");
  if (p.answers.has(index)) throw new RoomError("You already answered.", "DUP");
  const ri = itemFor(room, p);
  if (!ri) throw new RoomError("This question is closed.");
  const resp = responseFor(ri.item, response);
  if (resp === null || resp === undefined) throw new RoomError("Choose one of the answers.", "INPUT");
  let correct = false;
  try { correct = scoreResponse(ri.item, resp) >= 1; } catch { throw new RoomError("Choose one of the answers.", "INPUT"); }
  const sc = scoreLive(correct, elapsed, limitMs(room), p.streak, p.armed);
  const before = p.rank;
  p.points += sc.points; p.streak = sc.streak;
  p.armed = p.armed.filter((x) => !sc.spent.includes(x));
  if (correct) p.correct++; else p.incorrect++;
  const slot = room.slots[index];
  const k = (p.bySkill[slot.skillId] ??= { correct: 0, total: 0 }); k.total++; if (correct) k.correct++;
  p.answers.set(index, { choice: typeof response === "string" ? response.slice(0, 191) : JSON.stringify(response).slice(0, 191), correct, points: sc.points, ms: Math.max(0, elapsed) });
  rank(room);
  // a short cheer when someone jumps up the board
  if (p.rank < before && (before - p.rank >= 2) && p.rank <= BOARD_SIZE) {
    room.cheers = [{ name: p.name, from: before, to: p.rank, at: now }, ...room.cheers].slice(0, 3);
  }
  room.version++;
  // Mystery Chest picked with the answer: a right answer opens it now (before a possible reveal)
  const chest = correct && chestPick !== null ? openChest(room, studentId, index, chestPick, undefined, now) : null;
  if ([...room.players.values()].every((x) => x.answers.has(index))) { reveal(room); notify(room, "all"); }
  else notify(room, "host");
  return { correct, points: sc.points, doubled: sc.doubled, shielded: sc.shielded, ...(room.features.chest ? { chest } : {}) };
}

/** A player's power-up for the current question: 50/50 and Hint act now; Double Points, Shield, Extra Time arm. */
export function livePower(room: Room, studentId: string, id: PowerUpId, now = Date.now()): { hide?: string[]; hint?: string; armed?: PowerUpId[] } {
  settle(room, now);
  const p = room.players.get(studentId);
  if (!p) throw new RoomError("Join the game first.", "INPUT");
  if (!(POWER_UPS as readonly string[]).includes(id)) throw new RoomError("Unknown power-up.", "INPUT");
  if ((p.power[id] ?? 0) < 1) throw new RoomError("You have used this power-up.", "INPUT");
  if (room.status !== "QUESTION" || room.paused || p.answers.has(room.index)) throw new RoomError("Use it while a question is open.");
  const ri = itemFor(room, p);
  if (!ri) throw new RoomError("Use it while a question is open.");
  let out: { hide?: string[]; hint?: string; armed?: PowerUpId[] };
  if (id === "fifty") {
    // every right option counts (sorting / multi-select items have several): 50/50 never hides a right one
    const opts = ri.item.options?.length ? ri.item.options.map((o) => ({ label: o.label, correct: !!o.correct })) : ri.view.options?.map((o) => ({ label: o.label, correct: o.label === ri.right }));
    const hide = fiftyFifty(opts);
    if (!hide) throw new RoomError("50/50 needs three or more answers.", "INPUT");
    p.hidden.set(room.index, hide); out = { hide };
  } else if (id === "hint") {
    const it = ri.item;
    const hint = hintFor({ type: it.type as BankType, hint: it.hint, options: it.options?.map((o) => ({ label: o.label, text: o.text, correct: !!o.correct })), sequence: it.sequence, answers: it.answers, answer: it.answer, pairs: it.pairs });
    if (!hint) throw new RoomError("No hint for this question.", "INPUT");
    p.hints.set(room.index, hint); out = { hint };
  } else {
    if (p.armed.includes(id)) throw new RoomError("Already on.", "INPUT");
    p.armed = [...p.armed, id]; out = { armed: p.armed };
  }
  p.power = { ...p.power, [id]: p.power[id] - 1 };
  return out;
}

// ------------------------------------------------------------------ Mystery Chest (modes with `chest`)

/** May this player open a chest now? (a right answer to the current question, no chest opened for it yet) */
export function chestAvailable(room: Room, p: RoomPlayer): boolean {
  if (!room.features.chest || (room.status !== "QUESTION" && room.status !== "REVEAL")) return false;
  return !!p.answers.get(room.index)?.correct && !p.chests.has(room.index);
}

const fairRandom = () => randomInt(1_000_000) / 1_000_000;

/** The three chests of a question: one of each prize, shuffled once, the same for every player. */
export function chestDeal(room: Room, index: number, rng: () => number = fairRandom): ChestPrize[] {
  let d = room.chestDeals.get(index);
  if (!d) {
    d = [...CHEST.prizes];
    for (let i = d.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(rng() * (i + 1))); [d[i], d[j]] = [d[j], d[i]]; }
    room.chestDeals.set(index, d);
  }
  return d;
}

/**
 * Opens chest `pick` (0–2) after a right answer: bonus points, double the points of that answer, or points taken
 * from the classmate in the lead (never below 0; nobody with points → a bonus). Game points only — the answer's
 * correct / incorrect is never changed. `rng` shuffles the question's chests (tests).
 */
export function openChest(room: Room, studentId: string, index: number, pick: number, rng: () => number = fairRandom, now = Date.now()): ChestResult {
  settle(room, now);
  const p = room.players.get(studentId);
  if (!p) throw new RoomError("Join the game first.", "INPUT");
  if (!room.features.chest) throw new RoomError("This game has no chests.", "INPUT");
  if (room.index !== index || (room.status !== "QUESTION" && room.status !== "REVEAL")) throw new RoomError("This question is closed.");
  if (p.chests.has(index)) throw new RoomError("You already opened a chest.", "DUP");
  const a = p.answers.get(index);
  if (!a?.correct) throw new RoomError("A right answer opens a chest.", "INPUT");
  const choice = Math.max(0, Math.min(2, Math.round(Number(pick) || 0)));
  let prize = chestDeal(room, index, rng)[choice];
  let points = 0, from: string | null = null;
  if (prize === "steal") {
    const others = [...room.players.values()].filter((x) => x !== p && x.points > 0).sort((a, b) => b.points - a.points || a.joinedAt - b.joinedAt);
    if (!others.length) prize = "bonus";
    else {
      const victim = others[0];   // the classmate in the lead
      points = Math.min(CHEST.steal, victim.points);          // never below 0
      victim.points -= points; from = victim.name;
      victim.hits = [{ name: p.name, points, at: now }, ...victim.hits].slice(0, 3);
    }
  }
  if (prize === "bonus") points = CHEST.bonus;
  if (prize === "double") points = Math.max(CHEST.doubleMin, a.points);
  p.points += points;
  const res: ChestResult = { pick: choice, prize, points, from };
  p.chests.set(index, res);
  room.events = [{ kind: prize, name: p.name, other: from, points, at: now }, ...room.events].slice(0, 5);
  rank(room);
  room.version++;
  notify(room, prize === "steal" ? "all" : "host");
  return res;
}

// ------------------------------------------------------------------ views (small JSON)

export type BoardRow = LiveBoardRow;
export interface HostView {
  id: string; code: string; title: string; mode: GameId; className: string; status: RoomStatus; paused: boolean; boardHidden: boolean;
  index: number; total: number; seconds: number; leftMs: number | null; joined: number; expected: number; names: string[]; answered: number;
  question: (LiveQuestionView & { rightLabel: string | null; picks?: Record<string, number> }) | null; levelMode: LevelMode;
  board: BoardRow[]; cheers: { name: string; from: number; to: number }[]; savedId: string | null; expiresAt: number;
  /** lobby: every joined student with avatar and badge emblem */
  lobby: LiveRacer[];
  /** live extras (Games integration) */
  features: LiveFeatures; teams: LiveTeam[] | null; rope: number | null; events: LiveEvent[]; field: LiveRacer[] | null;
  /** at the end: top players, class score by skill, each student's score by skill (the teacher's screen) */
  results: RoomResults | null;
}

const medal = (r: number): BoardRow["medal"] => (r === 1 ? "gold" : r === 2 ? "silver" : r === 3 ? "bronze" : null);

export function leftMs(room: Room, now = Date.now()): number | null {
  if (room.status !== "QUESTION") return null;
  if (room.paused) return room.pausedLeftMs;
  return Math.max(0, room.questionStartedAt + limitMs(room) - now);
}

function viewOf(room: Room, ri: RoomItem, ix: number): LiveQuestionView {
  return { ...ri.view, index: ix, total: room.slots.length, skillName: room.slots[ix].skillName };
}

const racer = (p: RoomPlayer): LiveRacer => ({ name: p.name, points: p.points, rank: p.rank, avatar: p.avatar, badge: p.badge, team: p.team });

export function hostView(room: Room, now = Date.now()): HostView {
  settle(room, now);
  const list = ranked(room);
  const teams = teamTotals(room);
  const slot = room.slots[room.index];
  let question: HostView["question"] = null;
  if (slot && (room.status === "QUESTION" || room.status === "REVEAL")) {
    const ri = slot.byLevel.ON;
    question = { ...viewOf(room, ri, room.index), rightLabel: room.status === "REVEAL" ? ri.right : null };
    if (room.status === "REVEAL" && room.levelMode === "SAME") {
      const picks: Record<string, number> = {};
      for (const p of room.players.values()) { const a = p.answers.get(room.index); if (a) picks[a.choice] = (picks[a.choice] ?? 0) + 1; }
      question.picks = picks;
    }
  }
  return {
    id: room.id, code: room.code, title: room.title, mode: room.mode, className: room.className, status: room.status, paused: room.paused, boardHidden: room.boardHidden,
    index: room.index, total: room.slots.length, seconds: room.seconds, leftMs: leftMs(room, now), joined: room.players.size, expected: room.expected,
    names: room.status === "LOBBY" ? list.map((p) => p.name) : [], answered: room.index >= 0 ? list.filter((p) => p.answers.has(room.index)).length : 0,
    question, levelMode: room.levelMode,
    board: list.slice(0, BOARD_SIZE).map((p) => ({ name: p.name, points: p.points, rank: p.rank, move: room.status === "LOBBY" ? 0 : p.startRank - p.rank, medal: room.index >= 0 ? medal(p.rank) : null, avatar: p.avatar, badge: p.badge, team: p.team })),
    cheers: room.cheers.map(({ name, from, to }) => ({ name, from, to })), savedId: room.savedId, expiresAt: room.expiresAt,
    lobby: room.status === "LOBBY" ? list.map(racer) : [],
    features: room.features, teams, rope: ropeOf(teams), events: room.events, field: room.features.field && room.status !== "LOBBY" ? list.map(racer) : null,
    results: room.status === "FINISHED" ? roomResults(room) : null,
  };
}

export interface PlayerView {
  code: string; title: string; mode: GameId; status: RoomStatus; paused: boolean; index: number; total: number; leftMs: number | null; seconds: number;
  question: LiveQuestionView | null; hidden: string[]; hint: string | null;
  mine: RoomAnswer | null; right: string | null; points: number; streak: number; rank: number; players: number;
  power: Record<PowerUpId, number>; armed: PowerUpId[]; podium: { name: string; points: number; avatar: LiveAvatar | null; badge: string | null }[];
  mySkills: { skillName: string; correct: number; total: number }[];
  /** Games integration: own avatar + badge, team, chest, points taken by classmates, coins at the end */
  me: { name: string; avatar: LiveAvatar | null; badge: string | null };
  team: number | null; teams: LiveTeam[] | null;
  chest: { available: boolean; opened: ChestResult | null } | null;
  hits: { name: string; points: number }[];
  coins: number | null;
}

export function playerView(room: Room, studentId: string, now = Date.now()): PlayerView {
  settle(room, now);
  const p = room.players.get(studentId);
  if (!p) throw new RoomError("Join the game first.", "INPUT");
  const ri = itemFor(room, p);
  const open = room.status === "QUESTION" || room.status === "REVEAL";
  const list = ranked(room);
  return {
    code: room.code, title: room.title, mode: room.mode, status: room.status, paused: room.paused, index: room.index, total: room.slots.length, leftMs: leftMs(room, now), seconds: room.seconds,
    question: open && ri ? viewOf(room, ri, room.index) : null, hidden: p.hidden.get(room.index) ?? [], hint: p.hints.get(room.index) ?? null,
    mine: p.answers.get(room.index) ?? null, right: room.status === "REVEAL" && ri ? ri.right : null,
    points: p.points, streak: p.streak, rank: p.rank, players: room.players.size, power: p.power, armed: p.armed,
    podium: room.status === "FINISHED" ? list.slice(0, 3).map((x) => ({ name: x.name, points: x.points, avatar: x.avatar, badge: x.badge })) : [],
    mySkills: room.status === "FINISHED" ? room.slots.filter((s, i, a) => a.findIndex((x) => x.skillId === s.skillId) === i).map((s) => ({ skillName: s.skillName, correct: p.bySkill[s.skillId]?.correct ?? 0, total: p.bySkill[s.skillId]?.total ?? 0 })) : [],
    me: { name: p.name, avatar: p.avatar, badge: p.badge }, team: p.team, teams: teamTotals(room),
    chest: room.features.chest && open ? { available: chestAvailable(room, p), opened: p.chests.get(room.index) ?? null } : null,
    hits: p.hits.map(({ name, points }) => ({ name, points })), coins: p.coins,
  };
}

// ------------------------------------------------------------------ results (by skill)

export interface RoomResults {
  top: { name: string; points: number; rank: number; avatar?: LiveAvatar | null; badge?: string | null }[];
  /** modes with teams: the final team points and the winner (null = a tie) */
  teams?: { teams: LiveTeam[]; winner: number | null };
  skills: { skillId: string; skillName: string; correct: number; total: number; pct: number | null; low: boolean }[];
  students: { studentId: string; name: string; fullName: string; points: number; rank: number; correct: number; incorrect: number; bySkill: Record<string, { correct: number; total: number; pct: number }> }[];
}

export function roomResults(room: Room): RoomResults {
  const list = rank(room);
  const skillIds = [...new Set(room.slots.map((s) => s.skillId))];
  const skills = skillIds.map((id) => {
    let c = 0, t = 0;
    for (const p of list) { c += p.bySkill[id]?.correct ?? 0; t += p.bySkill[id]?.total ?? 0; }
    const pct = t ? Math.round((100 * c) / t) : null;
    return { skillId: id, skillName: room.slots.find((s) => s.skillId === id)!.skillName, correct: c, total: t, pct, low: pct !== null && pct < RETEACH_BELOW_PCT };
  });
  return {
    top: list.slice(0, 3).map((p) => ({ name: p.name, points: p.points, rank: p.rank, avatar: p.avatar, badge: p.badge })),
    ...(room.features.teams ? { teams: { teams: teamTotals(room)!, winner: winningTeam(room) } } : {}),
    skills,
    students: list.map((p) => ({
      studentId: p.studentId, name: p.name, fullName: [p.first, p.last].filter(Boolean).join(" "), points: p.points, rank: p.rank, correct: p.correct, incorrect: p.incorrect,
      bySkill: Object.fromEntries(Object.entries(p.bySkill).map(([k, v]) => [k, { ...v, pct: v.total ? Math.round((100 * v.correct) / v.total) : 0 }])),
    })),
  };
}

// ------------------------------------------------------------------ push (SSE subscribers)

export function subscribe(room: Room, sub: Subscriber): () => void {
  room.subs.add(sub);
  const p = sub.studentId ? room.players.get(sub.studentId) : undefined;
  if (p) p.online++;
  // the current state right away (also after a dropped connection: the rejoin)
  try { sub.send(JSON.stringify(sub.kind === "host" ? hostView(room) : playerView(room, sub.studentId!))); } catch { /* gone */ }
  return () => { if (room.subs.delete(sub) && p) p.online = Math.max(0, p.online - 1); };
}

/** Coalesced push: many answers in a burst become one board update. */
export function notify(room: Room, who: "host" | "all"): void {
  room.pending = room.pending === "all" || who === "all" ? "all" : "host";
  if (room.flushTimer || !room.subs.size) { if (!room.subs.size) room.pending = null; return; }
  room.flushTimer = setTimeout(() => flush(room), FLUSH_MS);
  (room.flushTimer as { unref?: () => void }).unref?.();
}

/** Sends the pending views now (also used by tests and the load test). Returns the bytes sent. */
export function flush(room: Room, now = Date.now()): number {
  if (room.flushTimer) clearTimeout(room.flushTimer);
  room.flushTimer = null;
  const who = room.pending; room.pending = null;
  if (!who) return 0;
  let bytes = 0;
  let host: string | null = null;
  for (const sub of room.subs) {
    if (sub.kind === "player" && who !== "all") continue;
    let json: string;
    try { json = sub.kind === "host" ? (host ??= JSON.stringify(hostView(room, now))) : JSON.stringify(playerView(room, sub.studentId!, now)); }
    catch { continue; }
    bytes += json.length;
    try { sub.send(json); } catch { room.subs.delete(sub); }
  }
  return bytes;
}

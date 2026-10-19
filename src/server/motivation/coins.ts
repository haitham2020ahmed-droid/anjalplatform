/**
 * 🪙 Coins (Games Part 3). A separate reward currency: every coin earned or spent is one CoinLedger row, unique per
 * (student, reason, refId), so the same event can never pay twice (a double click, two tabs, the daily job and a page
 * load at the same time). The balance in StudentReward is always recomputed from the ledger.
 *
 * Coins come MOSTLY from learning (a My Work skill finished, a skill mastered, moving up a level, a plan finished, the
 * Question of the Day) and FEWER from games and Live Challenge (capped per day). Effort counts: trying the Question of
 * the Day or playing a game pays a little even when the answer is wrong.
 *
 * Rewards never change levels, mastery, scores or reports: nothing here is read by the adaptive engine or reports.
 */
import { randomUUID } from "node:crypto";
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { assertClassAccess } from "../teacher/assignments";
import { TtlCache } from "../lib/ttl-cache";
import { defaultAvatarFor, toAvatar, type AvatarConfig } from "../../lib/avatar";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000, KSA = 3 * 3_600_000;
/** today in Saudi time, YYYY-MM-DD */
export const ksaDay = (now: Date) => new Date(now.getTime() + KSA).toISOString().slice(0, 10);
/** the start of today in Saudi time */
export const ksaMidnight = (now: Date) => new Date(Math.floor((now.getTime() + KSA) / DAY) * DAY - KSA);

/** How many coins each event pays (fixed; learning pays most). */
export const COINS = {
  work: 10,          // a My Work skill (assignment) finished
  mastered: 15,      // a skill mastered
  levelup: 30,       // moved up a level
  plan: 25,          // every part of a plan finished
  qotdRight: 20,     // Question of the Day, correct
  qotdTry: 3,        // Question of the Day, wrong (effort counts)
  game: 3,           // a solo game finished (suggested; GFOUND passes its own small amount)
  live: 3,           // took part in a Live Challenge
  liveWin: 10,       // won a Live Challenge
} as const;

export type CoinReason = "work" | "mastered" | "levelup" | "plan" | "qotd" | "game" | "live" | "live.win" | "bonus" | "shop";
const EARN_REASONS = new Set<CoinReason>(["work", "mastered", "levelup", "plan", "qotd", "game", "live", "live.win", "bonus"]);
/** games and Live Challenge together pay at most this many coins a day (learning stays the main source) */
export const GAME_REASONS: CoinReason[] = ["game", "live", "live.win"];
export const GAME_DAILY_CAP = 25;
export const MAX_AWARD = 100;
export const BONUS_MAX = 50;

// ------------------------------------------------------------------ the wallet (top bar)

export interface RewardChip { coins: number; earned: number; avatar: AvatarConfig; favoriteBadge: string | null; chosen: boolean }
/** the top bar reads ONE row per page, kept 30 s per student (writes on this server drop it at once) */
const chipCache = new TtlCache<RewardChip>(30_000, 5000);
const chipOf = (studentId: string, w: Record<string, unknown> | null): RewardChip => ({
  coins: Number(w?.coins ?? 0), earned: Number(w?.earned ?? 0),
  avatar: w?.avatar ? toAvatar(w.avatar) : defaultAvatarFor(studentId), chosen: Boolean(w?.avatar),
  favoriteBadge: w?.favoriteBadge ? s(w.favoriteBadge) : null,
});
export function forgetChip(studentId: string): void { chipCache.delete(studentId); }

/** Avatar, coins and favorite badge for the top bar: one cheap read, cached briefly. */
export async function rewardChip(repo: Repo, studentId: string, now = Date.now()): Promise<RewardChip> {
  return chipCache.getOrLoad(studentId, async () => chipOf(studentId, await repo.findUnique("StudentReward", { studentId })), now);
}

/** Avatars + favorite badges of many students at once (Live Board, class list): one read per 400 students. */
export async function emblemsFor(repo: Repo, studentIds: readonly string[]): Promise<Map<string, { avatar: AvatarConfig; badge: string | null }>> {
  const ids = [...new Set(studentIds.map(s))].slice(0, 2000);
  const out = new Map<string, { avatar: AvatarConfig; badge: string | null }>();
  for (let i = 0; i < ids.length; i += 400) {
    for (const w of await repo.findMany("StudentReward", { studentId: { in: ids.slice(i, i + 400) } }, { select: ["studentId", "avatar", "favoriteBadge"] }))
      out.set(s(w.studentId), { avatar: toAvatar(w.avatar), badge: w.favoriteBadge ? s(w.favoriteBadge) : null });
  }
  for (const id of ids) if (!out.has(id)) out.set(id, { avatar: defaultAvatarFor(id), badge: null });
  return out;
}

/** Recomputes the balance from the ledger and stores it. */
export async function recomputeCoins(repo: Repo, studentId: string): Promise<{ coins: number; earned: number }> {
  const rows = await repo.findMany("CoinLedger", { studentId }, { select: ["amount", "reason"] });
  let coins = 0, earned = 0;
  for (const r of rows) { const a = Number(r.amount) || 0; coins += a; if (a > 0 && r.reason !== "shop") earned += a; }
  await repo.upsert("StudentReward", { studentId }, { studentId, coins, earned }, { coins, earned });
  forgetChip(studentId);
  return { coins, earned };
}

async function ledgerRow(repo: Repo, studentId: string, reason: string, refId: string) {
  return (await repo.findMany("CoinLedger", { studentId, reason, refId }, { select: ["id", "amount"], take: 1 }))[0] ?? null;
}

/** Inserts one ledger row; false when that (student, reason, refId) already exists (also under a race). */
export async function insertLedger(repo: Repo, row: { studentId: string; amount: number; reason: CoinReason; refId: string; note?: string | null; createdById?: string | null; createdAt?: Date }): Promise<boolean> {
  if (await ledgerRow(repo, row.studentId, row.reason, row.refId)) return false;
  try {
    await repo.create("CoinLedger", { studentId: row.studentId, amount: row.amount, reason: row.reason, refId: row.refId.slice(0, 120), note: row.note ? row.note.slice(0, 200) : null, createdById: row.createdById ?? null, createdAt: row.createdAt ?? new Date() });
    return true;
  } catch (e) {
    if (await ledgerRow(repo, row.studentId, row.reason, row.refId)) return false;   // the unique key: someone else won the race
    throw e;
  }
}

/**
 * ⭐ THE way to give coins (also for games / Live Challenge — GFOUND calls this). Idempotent per refId: calling it
 * again with the same (studentId, reason, refId) pays nothing. Game reasons (game, live, live.win) share a daily cap.
 * Never touches levels, mastery, scores or reports.
 */
export async function awardCoins(repo: Repo, studentId: string, reason: CoinReason, amount: number, refId: string, opts: { note?: string | null; by?: string | null; now?: Date } = {}): Promise<{ awarded: number; balance: number; duplicate: boolean }> {
  const now = opts.now ?? new Date();
  if (!EARN_REASONS.has(reason)) throw new ValidationError("Unknown reason for coins.");
  const ref = s(refId).trim();
  if (!ref) throw new ValidationError("Coins need an event id.");
  let n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n < 1) throw new ValidationError("Coins must be a positive number.");
  n = Math.min(n, MAX_AWARD);
  if (await ledgerRow(repo, studentId, reason, ref)) return { awarded: 0, balance: (await rewardChip(repo, studentId, now.getTime())).coins, duplicate: true };
  if (!(await repo.findUnique("Student", { id: studentId }))) throw new ValidationError("Student not found.");
  if (GAME_REASONS.includes(reason)) {
    const today = await repo.findMany("CoinLedger", { studentId, reason: { in: GAME_REASONS }, createdAt: { gte: ksaMidnight(now) } }, { select: ["amount"], take: 200 });
    const used = today.reduce((t, r) => t + Math.max(0, Number(r.amount) || 0), 0);
    n = Math.max(0, Math.min(n, GAME_DAILY_CAP - used));
    // over the daily cap: the event is still recorded (0 coins) so badges like Team Player count it
    if (n === 0) { const ok = await insertLedger(repo, { studentId, amount: 0, reason, refId: ref, note: "daily game coins reached", createdById: opts.by ?? null, createdAt: now }); return { awarded: 0, balance: (await rewardChip(repo, studentId, now.getTime())).coins, duplicate: !ok }; }
    const ok = await insertLedger(repo, { studentId, amount: n, reason, refId: ref, note: opts.note ?? null, createdById: opts.by ?? null, createdAt: now });
    // r85 audit: two game/Live-Challenge events finishing within the same instant (two tabs, two near-simultaneous
    // Live Challenges) could both read `used` before either inserted, each awarding up to the cap and together
    // netting more than GAME_DAILY_CAP for the day. Re-check after inserting (same compensating-write spirit as
    // shop.ts's buyItem negative-balance rollback) and trim only THIS row back down if the real total ran over.
    if (ok) {
      const after = await repo.findMany("CoinLedger", { studentId, reason: { in: GAME_REASONS }, createdAt: { gte: ksaMidnight(now) } }, { select: ["amount"], take: 200 });
      const usedAfter = after.reduce((t, r) => t + Math.max(0, Number(r.amount) || 0), 0);
      if (usedAfter > GAME_DAILY_CAP) {
        const trimmed = Math.max(0, n - (usedAfter - GAME_DAILY_CAP));
        if (trimmed !== n) { await repo.updateMany("CoinLedger", { studentId, reason, refId: ref }, { amount: trimmed }); n = trimmed; }
      }
    }
    const { coins } = await recomputeCoins(repo, studentId);
    return { awarded: ok ? n : 0, balance: coins, duplicate: !ok };
  }
  const ok = await insertLedger(repo, { studentId, amount: n, reason, refId: ref, note: opts.note ?? null, createdById: opts.by ?? null, createdAt: now });
  const { coins } = await recomputeCoins(repo, studentId);
  return { awarded: ok ? n : 0, balance: coins, duplicate: !ok };
}

/** The student's last coin events (newest first) for the shop page. */
export async function coinHistory(repo: Repo, studentId: string, take = 15): Promise<{ amount: number; reason: string; note: string | null; date: string }[]> {
  const rows = await repo.findMany("CoinLedger", { studentId }, { select: ["amount", "reason", "note", "createdAt"], orderBy: [{ field: "createdAt", dir: "desc" }], take });
  return rows.map((r) => ({ amount: Number(r.amount), reason: s(r.reason), note: r.note ? s(r.note) : null, date: new Date(r.createdAt instanceof Date ? r.createdAt.getTime() : s(r.createdAt)).toISOString().slice(0, 10) }));
}

// ------------------------------------------------------------------ 🎁 teacher bonus (own classes only)

/**
 * A teacher gives bonus coins to one student, some students or the whole class — their OWN class only (school
 * admins: any class of their school). 1–50 coins per student; one grant pays each student once.
 */
export async function giveBonusCoins(repo: Repo, actor: Actor, input: { classId: string; studentIds?: string[] | null; amount: number; note?: string | null }, now = new Date()): Promise<{ students: number; amount: number }> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  await assertClassAccess(repo, actor, s(input.classId));
  const amount = Math.floor(Number(input.amount));
  if (!Number.isFinite(amount) || amount < 1 || amount > BONUS_MAX) throw new ValidationError(`Give between 1 and ${BONUS_MAX} coins.`);
  const members = new Set((await repo.findMany("ClassMembership", { classId: input.classId, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)));
  const want = input.studentIds?.length ? [...new Set(input.studentIds.map(s))] : [...members];
  if (want.some((id) => !members.has(id))) throw new ForbiddenError("That student is not in this class.");
  if (!want.length) throw new ValidationError("This class has no students.");
  const grant = `${now.getTime().toString(36)}-${randomUUID().slice(0, 8)}`;
  const note = s(input.note).trim().slice(0, 120) || null;
  for (let i = 0; i < want.length; i += 20) {
    await Promise.all(want.slice(i, i + 20).map(async (sid) => { await insertLedger(repo, { studentId: sid, amount, reason: "bonus", refId: grant, note, createdById: actor.userId, createdAt: now }); await recomputeCoins(repo, sid); }));
  }
  await audit(repo, { actorId: actor.userId, action: "coins.bonus", entityType: "Class", entityId: input.classId, after: { students: want.length, amount, note }, at: now });
  return { students: want.length, amount };
}

/** The class a staff member may manage this student through (their own class), or ForbiddenError. */
export async function staffClassOf(repo: Repo, actor: Actor, studentId: string): Promise<string> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  const ms = await repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] });
  for (const m of ms) { try { await assertClassAccess(repo, actor, s(m.classId)); return s(m.classId); } catch { /* next */ } }
  throw new ForbiddenError("Not your student.");
}

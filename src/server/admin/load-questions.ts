/**
 * 📥 Admin → Questions → Load new questions: the question packs loaded from the platform, in short requests.
 *
 *   startLoad   takes the school's load lock (one load at a time; the lock expires 90 s after the last chunk, so a
 *               closed page never blocks the next admin for long) and returns its token;
 *   loadChunk   one chunk of one pack (a few skill sets / map places, ~8 s at most) and the pack's progress;
 *   checkChunk  the Question Check (definite errors hidden from students) in parts of 2,000 questions;
 *   finishLoad  writes the summary and gives the lock back;  stopLoad  gives the lock back (progress is kept).
 *
 * Progress is kept per school and pack in SchoolSetting "questions.load" (no new table): where each pack is, what it
 * added, its last errors. A stopped pack goes on from there; a finished pack (or a changed file) starts again from the
 * beginning — safe, because every loader skips a question that is already there.
 * The lock is the SchoolSetting row "questions.load.lock": its updatedBy column holds the token of the load that
 * holds it, taken / renewed by a compare-and-set update (two admins can never both hold it).
 * School admin only, for their own school.
 */
import { randomUUID } from "node:crypto";
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { autoHideBroken } from "../questions/auto-check";
import { thinSkills } from "../questions/min-per-skill";
import { PACKS, countPack, packOf, packSignature, runPackChunk, type PackCount, type PackKey } from "../questions/load-packs";

const s = (v: unknown) => String(v ?? "");
export const PROGRESS_KEY = "questions.load";
export const LOCK_KEY = "questions.load.lock";
export const LOCK_TTL_MS = 90_000;
const FREE = "-";
const MAX_ERRORS = 20;
/** questions checked per Question Check part (4 pages of 500) */
const CHECK_PAGES = 4;

export interface PackProgress { done: number; total: number; added: number; skipped: number; created: number; errors: string[]; notes: string[]; sig: string; startedAt: string; finishedAt: string | null }
export interface LoadSummary { at: string; byName: string; added: number; created: number; packs: string[]; checked: number; hidden: number; stillUnder25: number; errors: number }
interface Progress { packs: Partial<Record<PackKey, PackProgress>>; check?: { after: string | null; checked: number; hidden: number }; last?: LoadSummary }

function assertSchoolAdmin(actor: Actor): string {
  if (actor.role !== "SCHOOL_ADMIN" || !actor.schoolId) throw new ForbiddenError("Only the school admin can load new questions.");
  return actor.schoolId;
}
const asObj = (v: unknown): Record<string, unknown> => {
  if (typeof v === "string") { try { return JSON.parse(v) as Record<string, unknown>; } catch { return {}; } }
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
};

async function readProgress(repo: Repo, schoolId: string): Promise<Progress> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: PROGRESS_KEY }, { select: ["value"] }))[0];
  const v = asObj(row?.value);
  return { packs: asObj(v.packs) as Progress["packs"], check: v.check as Progress["check"], last: v.last as LoadSummary | undefined };
}
async function writeProgress(repo: Repo, schoolId: string, p: Progress, userId: string): Promise<void> {
  const value = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
  await repo.upsert("SchoolSetting", { schoolId, key: PROGRESS_KEY }, { schoolId, key: PROGRESS_KEY, value, updatedBy: userId }, { value, updatedBy: userId });
}

// ------------------------------------------------------------------ the lock

interface LockRow { id: string; token: string; until: number; by: string; byName: string }
async function readLock(repo: Repo, schoolId: string): Promise<LockRow | null> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: LOCK_KEY }, { select: ["id", "value", "updatedBy"] }))[0];
  if (!row) return null;
  const v = asObj(row.value);
  return { id: s(row.id), token: s(row.updatedBy) || FREE, until: Number(v.until ?? 0), by: s(v.by), byName: s(v.byName) };
}
/** Sets the lock row from `expected` token to `token` (compare-and-set); true when this call did it. */
async function swapLock(repo: Repo, row: LockRow, expected: string, token: string, value: Record<string, unknown>): Promise<boolean> {
  return (await repo.updateMany("SchoolSetting", { id: row.id, updatedBy: expected }, { updatedBy: token, value })) === 1;
}
async function lockRow(repo: Repo, schoolId: string): Promise<LockRow> {
  let row = await readLock(repo, schoolId);
  if (!row) {
    try { await repo.create("SchoolSetting", { schoolId, key: LOCK_KEY, value: { until: 0 }, updatedBy: FREE }); }
    catch { /* another request made it first */ }
    row = await readLock(repo, schoolId);
  }
  return row!;
}
export const lockBusy = (l: LockRow | null, now: Date) => Boolean(l && l.token !== FREE && l.until > now.getTime());

/** Renews the lock held with `token` (or throws: the load was stopped / another load took over after it expired). */
async function holdLock(repo: Repo, schoolId: string, actor: Actor, token: string, now: Date): Promise<void> {
  const l = await readLock(repo, schoolId);
  if (!l || l.token !== token) throw new ValidationError("This load was stopped or another load started. Open the page again.");
  const ok = await swapLock(repo, l, token, token, { until: now.getTime() + LOCK_TTL_MS, by: actor.userId, byName: l.byName });
  if (!ok) throw new ValidationError("This load was stopped or another load started. Open the page again.");
}

/** Takes the school's load lock; refused while another load is running. */
export async function startLoad(repo: Repo, actor: Actor, now = new Date()): Promise<{ token: string }> {
  const schoolId = assertSchoolAdmin(actor);
  const l = await lockRow(repo, schoolId);
  if (lockBusy(l, now)) throw new ValidationError("A load is already running. Wait until it ends, or try again in a minute.");
  const me = await repo.findUnique("User", { id: actor.userId });
  const token = randomUUID();
  if (!(await swapLock(repo, l, l.token, token, { until: now.getTime() + LOCK_TTL_MS, by: actor.userId, byName: s(me?.displayName) }))) throw new ValidationError("A load is already running. Wait until it ends, or try again in a minute.");
  // a new run: the Question Check starts again at the end
  const p = await readProgress(repo, schoolId);
  p.check = { after: null, checked: 0, hidden: 0 };
  await writeProgress(repo, schoolId, p, actor.userId);
  return { token };
}

/** Gives the lock back (Stop). Progress is kept: Load goes on from where it stopped. */
export async function stopLoad(repo: Repo, actor: Actor, token: string): Promise<void> {
  const schoolId = assertSchoolAdmin(actor);
  const l = await readLock(repo, schoolId);
  if (l && l.token === token) await swapLock(repo, l, token, FREE, { until: 0 });
}

// ------------------------------------------------------------------ chunks

export interface ChunkResult { pack: PackKey; done: number; total: number; added: number; skipped: number; created: number; addedNow: number; errors: string[]; notes: string[]; finished: boolean; missingFile?: boolean }

/** One chunk of one pack. `restart`: start a finished pack again from the beginning (nothing is added twice). */
export async function loadChunk(repo: Repo, actor: Actor, input: { token: string; pack: string; restart?: boolean }, now = new Date()): Promise<ChunkResult> {
  const schoolId = assertSchoolAdmin(actor);
  const def = packOf(input.pack);
  if (!def) throw new ValidationError("Unknown question pack.");
  await holdLock(repo, schoolId, actor, input.token, now);
  const sig = packSignature(def);
  if (!sig) return { pack: def.key, done: 0, total: 0, added: 0, skipped: 0, created: 0, addedNow: 0, errors: [], notes: [], finished: true, missingFile: true };
  const p = await readProgress(repo, schoolId);
  let cur = p.packs[def.key];
  if (!cur || cur.sig !== sig || (cur.finishedAt && input.restart)) {
    cur = { done: 0, total: 0, added: 0, skipped: 0, created: 0, errors: [], notes: [], sig, startedAt: now.toISOString(), finishedAt: null };
  }
  if (cur.finishedAt && cur.done >= cur.total) return { pack: def.key, done: cur.done, total: cur.total, added: cur.added, skipped: cur.skipped, created: cur.created, addedNow: 0, errors: [], notes: [], finished: true };
  const w = await runPackChunk(repo, schoolId, def, cur.done, { now });
  cur = {
    ...cur, done: w.next, total: w.total, added: cur.added + w.added, skipped: cur.skipped + w.skipped, created: cur.created + w.created,
    errors: [...cur.errors, ...w.errors].slice(-MAX_ERRORS), notes: [...cur.notes, ...w.notes].slice(-5),
    finishedAt: w.next >= w.total ? now.toISOString() : null,
  };
  p.packs[def.key] = cur;
  await writeProgress(repo, schoolId, p, actor.userId);
  await holdLock(repo, schoolId, actor, input.token, new Date());
  return { pack: def.key, done: cur.done, total: cur.total, added: cur.added, skipped: cur.skipped, created: cur.created, addedNow: w.added, errors: w.errors, notes: w.notes, finished: Boolean(cur.finishedAt) };
}

/** One part of the Question Check (2,000 questions); `finished` when every published question was checked. */
export async function checkChunk(repo: Repo, actor: Actor, token: string, now = new Date()): Promise<{ checked: number; hidden: number; finished: boolean; hiddenNow: { stem: string; problem: string }[] }> {
  const schoolId = assertSchoolAdmin(actor);
  await holdLock(repo, schoolId, actor, token, now);
  const p = await readProgress(repo, schoolId);
  const c = p.check ?? { after: null, checked: 0, hidden: 0 };
  const r = await autoHideBroken(repo, actor, now, { after: c.after, pages: CHECK_PAGES });
  p.check = { after: r.next, checked: c.checked + r.checked, hidden: c.hidden + r.hidden.length };
  await writeProgress(repo, schoolId, p, actor.userId);
  return { checked: p.check.checked, hidden: p.check.hidden, finished: r.next === null, hiddenNow: r.hidden.slice(0, 10).map((h) => ({ stem: h.stem.slice(0, 120), problem: h.problem })) };
}

/** The end of a load: the summary is kept for the page, the lock is given back. */
export async function finishLoad(repo: Repo, actor: Actor, input: { token: string; packs: string[] }, now = new Date()): Promise<LoadSummary> {
  const schoolId = assertSchoolAdmin(actor);
  await holdLock(repo, schoolId, actor, input.token, now);
  const p = await readProgress(repo, schoolId);
  const keys = input.packs.filter((k) => packOf(k)) as PackKey[];
  const me = await repo.findUnique("User", { id: actor.userId });
  const summary: LoadSummary = {
    at: now.toISOString(), byName: s(me?.displayName), packs: keys,
    added: keys.reduce((n, k) => n + (p.packs[k]?.added ?? 0), 0), created: keys.reduce((n, k) => n + (p.packs[k]?.created ?? 0), 0),
    errors: keys.reduce((n, k) => n + (p.packs[k]?.errors.length ?? 0), 0),
    checked: p.check?.checked ?? 0, hidden: p.check?.hidden ?? 0, stillUnder25: (await thinSkills(repo, schoolId)).length,
  };
  p.last = summary;
  await writeProgress(repo, schoolId, p, actor.userId);
  await audit(repo, { actorId: actor.userId, action: "questions.load", entityType: "SchoolSetting", entityId: `${schoolId}:${PROGRESS_KEY}`, after: summary as unknown as Record<string, unknown>, at: now });
  await stopLoad(repo, actor, input.token);
  return summary;
}

// ------------------------------------------------------------------ the page

export interface PackRow { key: PackKey; title: string; hint: string; file: string; present: boolean; count: PackCount | null; progress: PackProgress | null }
export interface LoadStatus { packs: PackRow[]; running: { byName: string; until: string } | null; last: LoadSummary | null }

/** Every pack with what is in already / left and its progress; whether a load is running now. */
export async function loadStatus(repo: Repo, actor: Actor, now = new Date()): Promise<LoadStatus> {
  const schoolId = assertSchoolAdmin(actor);
  const [p, l] = await Promise.all([readProgress(repo, schoolId), readLock(repo, schoolId)]);
  const packs: PackRow[] = [];
  for (const def of PACKS) {
    const sig = packSignature(def);
    const pr = p.packs[def.key];
    packs.push({ key: def.key, title: def.title, hint: def.hint, file: def.file, present: Boolean(sig), count: sig ? await countPack(repo, schoolId, def) : null, progress: pr && pr.sig === sig ? pr : null });
  }
  return { packs, running: lockBusy(l, now) ? { byName: l!.byName, until: new Date(l!.until).toISOString() } : null, last: p.last ?? null };
}

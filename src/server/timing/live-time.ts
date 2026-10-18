/**
 * ⏱ Live time for TIMED tests (NAFS tests and MAP tests, owner r69): while a test is running, the teacher can extend or
 * shorten the time limit, set / move the end time, or give ONE student more (or less) time — and the students' timers
 * follow within a few seconds.
 *
 *   effectiveEnd()  when one student's time is up: the earlier of (start + limit + the student's extra minutes) and the
 *                   end time (+ the student's extra minutes). Pure — the same rule on the page, in the player's poll
 *                   and on the server when answers arrive (an answer after the end + a short grace hands the test in).
 *   studentExtra() / withStudentExtra()   the per-student minutes kept as { "<studentId>": minutes } (bounded).
 *   liveStamp() / bumpLive()   a tiny in-memory "changed at" stamp per assignment: the player polls with the stamp it
 *                   has; while nothing changed the answer is "same" WITHOUT a database read (30 students polling cost
 *                   nothing). The stamps live in a swept, bounded map (src/server/cache/idle.ts) on globalThis, so every
 *                   bundle of the server sees the same stamps; after a restart the first poll reads the database once.
 *
 * Never on the answer path: the answer handlers only compare times they already have in memory.
 */
import { sweptMap } from "../cache/idle";

const s = (v: unknown) => String(v ?? "");
const dt = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));

/** A teacher's change is limited to ±MAX_SHIFT minutes at a time; a student's extra minutes stay within ±MAX_EXTRA. */
export const MAX_SHIFT = 180;
export const MAX_EXTRA = 240;
/** How often the student's player asks whether the time changed (ms). */
export const POLL_MS = 20_000;

export interface EndInput { startedAt: Date | string | null | undefined; minutes: number | null | undefined; extra?: number | null; endsAt?: Date | string | null }

/**
 * When the student's time is up (null = untimed): the earlier of start + (limit + extra) minutes and the end time
 * (+ extra minutes). A limit shortened below the time already used ends the test now (never "before it started").
 */
export function effectiveEnd(p: EndInput): Date | null {
  const extra = Number.isFinite(Number(p.extra)) ? Math.round(Number(p.extra)) : 0;
  const started = dt(p.startedAt);
  const lim = p.minutes === null || p.minutes === undefined || !Number.isFinite(Number(p.minutes)) || Number(p.minutes) <= 0 ? null : Number(p.minutes);
  const ends: number[] = [];
  if (lim !== null && started && !Number.isNaN(started.getTime())) ends.push(started.getTime() + Math.max(0, lim + extra) * 60_000);
  const cut = dt(p.endsAt);
  if (cut && !Number.isNaN(cut.getTime())) ends.push(cut.getTime() + extra * 60_000);
  if (!ends.length) return null;
  const end = Math.min(...ends);
  return new Date(started && end < started.getTime() ? started.getTime() : end);
}

/** The student's extra minutes from the stored map (0 when none). */
export function studentExtra(map: unknown, studentId: string): number {
  let o: unknown = map;
  if (typeof o === "string") { try { o = JSON.parse(o); } catch { return 0; } }
  if (!o || typeof o !== "object" || Array.isArray(o)) return 0;
  const n = Number((o as Record<string, unknown>)[s(studentId)]);
  return Number.isFinite(n) ? Math.max(-MAX_EXTRA, Math.min(MAX_EXTRA, Math.round(n))) : 0;
}

/** The map after adding `delta` minutes to one student (0 removes the entry; bounded to 200 students). */
export function withStudentExtra(map: unknown, studentId: string, delta: number): Record<string, number> {
  let o: unknown = map;
  if (typeof o === "string") { try { o = JSON.parse(o); } catch { o = {}; } }
  const out: Record<string, number> = {};
  if (o && typeof o === "object" && !Array.isArray(o)) for (const [k, v] of Object.entries(o as Record<string, unknown>).slice(0, 200)) { const n = Math.round(Number(v)); if (k && Number.isFinite(n) && n !== 0) out[k] = Math.max(-MAX_EXTRA, Math.min(MAX_EXTRA, n)); }
  const next = Math.max(-MAX_EXTRA, Math.min(MAX_EXTRA, (out[s(studentId)] ?? 0) + Math.round(Number(delta) || 0)));
  if (next === 0) delete out[s(studentId)]; else out[s(studentId)] = next;
  return out;
}

/** A whole number of minutes for a teacher's change (−MAX_SHIFT…MAX_SHIFT, not 0), else null. */
export function cleanShift(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n !== 0 && Math.abs(n) <= MAX_SHIFT ? n : null;
}

// ------------------------------------------------------------------ the "changed at" stamps (no database while unchanged)

type Stamps = Map<string, { at: number }>;
const G = globalThis as unknown as { __liveTimeStamps?: Stamps };
/** 12 hours is longer than any test sitting; 5,000 running assignments is far more than one school has. */
const stamps = (): Stamps => (G.__liveTimeStamps ??= sweptMap<string, { at: number }>("live-time", 12 * 3_600_000, 5000));

/** The key of one assignment: "nafs:<NafsTestClass id>" or "map:<MapSimWindow id>". */
export const liveKey = (kind: "nafs" | "map", id: string) => `${kind}:${s(id)}`;
/** The stamp the player holds (0 = no change seen by this server). */
export const liveStamp = (key: string): number => stamps().get(key)?.at ?? 0;
/** The teacher changed the time: every player of this assignment reads it again on its next poll. */
export function bumpLive(key: string, now = Date.now()): number {
  const at = Math.max(now, liveStamp(key) + 1);
  stamps().set(key, { at });
  return at;
}

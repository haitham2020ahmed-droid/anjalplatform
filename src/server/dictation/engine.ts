/**
 * 📝 Daily Dictation level engine — the same up/down *shape* as the ReadRise engine (src/server/readrise/engine.ts:
 * a small constants object, a pure decision function, a clamp, a day key), tuned for a single daily listen-and-type
 * item instead of ReadRise's rolling window of article scores:
 *
 *   - ONE attempt counts per calendar day per student (DICTATION_ATTEMPT_DAY decides "today"; it takes `now` as an
 *     argument everywhere, so tests never depend on the real wall clock).
 *   - A CLEAN attempt (the word-level diff, diff.ts, found zero errors) → the tier goes up one for tomorrow.
 *   - A messy attempt (a few errors, at or under HOLD_MAX_ERRORS) → the tier holds.
 *   - A wrong attempt (more errors than that) → the tier steps down one, to help it stick.
 *   - Tiers are the bank's own 1..TIER_COUNT (items.ts), never a continuous scale like ReadRise's 200–1500: the step
 *     is always 1 tier, up or down.
 */
import { DICTATION_ITEMS, itemsOfTier, TIER_COUNT, type DictationItem } from "./items";

/** Mirrors ReadRise's ENGINE object, but with dictation's own tuned numbers (never shared with readrise/engine.ts). */
export const DICTATION_ENGINE = {
  minTier: 1,
  maxTier: TIER_COUNT,
  /** every level move is exactly one tier */
  step: 1,
  /** word-level errors at or under this still hold the tier (not clean, not bad enough to drop) */
  holdMaxErrors: 2,
} as const;

/** The student's listen allowance for one item (a named constant, never a magic number in the UI). */
export const MAX_REPLAYS = 2;

export const clampTier = (t: number): number => Math.min(DICTATION_ENGINE.maxTier, Math.max(DICTATION_ENGINE.minTier, Math.round(t)));

export interface DictationDecision { delta: number; reason: string }

/**
 * The level rule on ONE day's error count (pure). Clean (0 errors) → up a tier; a few errors (≤ holdMaxErrors) →
 * hold; more than that → down a tier.
 */
export function dictationDecision(errorCount: number): DictationDecision {
  if (errorCount <= 0) return { delta: DICTATION_ENGINE.step, reason: "a clean attempt (no errors), so tomorrow's item is a little harder" };
  if (errorCount <= DICTATION_ENGINE.holdMaxErrors) return { delta: 0, reason: `${errorCount} small error${errorCount === 1 ? "" : "s"}, so tomorrow's item stays at the same level` };
  return { delta: -DICTATION_ENGINE.step, reason: `${errorCount} errors, so tomorrow's item steps back to help this stick` };
}

const DAY = 86_400_000;

/**
 * The calendar day an attempt counts for, as yyyy-mm-dd (UTC) — never the real wall clock directly: every caller
 * passes its own `now`, so tests can fix the day without waiting or mocking Date globally.
 */
export function dictationDay(now: Date): string {
  return new Date(now.getTime()).toISOString().slice(0, 10);
}

/** True once `now` has moved into a different calendar day than `day` (yyyy-mm-dd) — used to offer a new item. */
export function isNewDay(day: string | null, now: Date): boolean {
  return day !== dictationDay(now);
}

/** A small, dependency-free string hash (no Math.random — test:contracts forbids it; this needs no randomness anyway). */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * The item a student sees for a tier on a given day: deterministic from (studentId, tier, day) so the same item is
 * shown all day (reload-safe) and reliably testable, but rotates day to day and differs student to student.
 */
export function itemForDay(tier: number, studentId: string, now: Date): DictationItem {
  const bank = itemsOfTier(clampTier(tier));
  const pool = bank.length ? bank : DICTATION_ITEMS;
  const daysSinceEpoch = Math.floor(now.getTime() / DAY);
  const idx = hashString(`${studentId}:${daysSinceEpoch}`) % pool.length;
  return pool[idx];
}

/**
 * ⚡ Power-ups (shared by every game, solo and Live Challenge). Pure functions, no React: the browser round
 * (round.ts) and the server's Live Challenge rooms use the same rules.
 *
 * Power-ups change GAME POINTS only. Whether an answer was correct never changes, and correct / incorrect is all
 * that results, reports and Reteach ever read.
 */
import type { PlayQuestion, PowerUpId } from "../types";
import { POWER_UPS } from "../types";

export const POWER_INFO: Record<PowerUpId, { icon: string; name: string; line: string }> = {
  double: { icon: "×2", name: "Double Points", line: "Your next right answer scores double" },
  time: { icon: "⏱", name: "Extra Time", line: "More time on the clock" },
  fifty: { icon: "½", name: "50/50", line: "Remove two wrong answers" },
  shield: { icon: "🛡", name: "Shield", line: "No points lost on your next wrong answer" },
  hint: { icon: "💡", name: "Hint", line: "Get a clue" },
};

/** One of each power-up per round (solo) or per game (Live Challenge). */
export const freshPowers = (): Record<PowerUpId, number> => Object.fromEntries(POWER_UPS.map((p) => [p, 1])) as Record<PowerUpId, number>;

/** Seconds Extra Time adds to a solo round clock; in a Live Challenge it counts the answer as this much faster. */
export const EXTRA_SECONDS = 10;
export const LIVE_EXTRA_SECONDS = 5;

/** Solo points: a right answer 100 + up to 50 for speed + 10 per answer in a row (max +50); a wrong one −20. */
export const SOLO = { base: 100, speed: 50, streakStep: 10, streakMax: 5, wrong: -20 } as const;

export interface Scored { points: number; doubled: boolean; shielded: boolean; /** power-ups used up by this answer */ spent: PowerUpId[] }

/**
 * Game points of one solo answer. `armed` = power-ups waiting for the next answer (Double Points, Shield).
 * Double Points is spent on the next answer (right or wrong); Shield is spent only when it stops a loss.
 */
export function scoreSolo(correct: boolean, speed: number, streakBefore: number, armed: readonly PowerUpId[]): Scored {
  const sp = Math.max(0, Math.min(1, Number.isFinite(speed) ? speed : 0));
  const doubleOn = armed.includes("double"), shieldOn = armed.includes("shield");
  if (correct) {
    const base = SOLO.base + Math.round(SOLO.speed * sp) + Math.min(streakBefore, SOLO.streakMax) * SOLO.streakStep;
    return { points: doubleOn ? base * 2 : base, doubled: doubleOn, shielded: false, spent: doubleOn ? ["double"] : [] };
  }
  if (shieldOn) return { points: 0, doubled: false, shielded: true, spent: doubleOn ? ["double", "shield"] : ["shield"] };
  return { points: SOLO.wrong, doubled: false, shielded: false, spent: doubleOn ? ["double"] : [] };
}

/**
 * Live Challenge points (the existing live-game rule: 1000 for an instant right answer down to 500 at the buzzer,
 * +100 per answer in a row up to +500), with Double Points ×2 and Extra Time counting the answer 5 s faster.
 * A wrong answer scores 0 and resets the streak, unless a Shield keeps the streak.
 */
export function scoreLive(correct: boolean, elapsedMs: number, limitMs: number, streakBefore: number, armed: readonly PowerUpId[]): Scored & { streak: number } {
  const doubleOn = armed.includes("double"), shieldOn = armed.includes("shield"), timeOn = armed.includes("time");
  if (!correct) {
    return { points: 0, doubled: false, shielded: shieldOn, streak: shieldOn ? streakBefore : 0, spent: [...(doubleOn ? ["double" as const] : []), ...(shieldOn ? ["shield" as const] : []), ...(timeOn ? ["time" as const] : [])] };
  }
  const ms = Math.max(0, elapsedMs - (timeOn ? LIVE_EXTRA_SECONDS * 1000 : 0));
  const speed = Math.max(0, Math.min(1, ms / Math.max(1, limitMs)));
  const base = Math.round(1000 * (1 - speed / 2)) + Math.min(streakBefore, 5) * 100;
  return { points: doubleOn ? base * 2 : base, doubled: doubleOn, shielded: false, streak: streakBefore + 1, spent: [...(doubleOn ? ["double" as const] : []), ...(timeOn ? ["time" as const] : [])] };
}

/** 50/50: two wrong option labels to hide (needs 3+ options; True/False has nothing to remove). */
export function fiftyFifty(options: { label: string; correct?: boolean }[] | undefined, rnd: () => number = Math.random): string[] | null {
  const wrong = (options ?? []).filter((o) => !o.correct);
  if ((options ?? []).length < 3 || wrong.length < 2) return null;
  const pool = [...wrong];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 2).map((o) => o.label);
}

/** Hint: the question's own hint from the bank, else the first letters of the right answer. */
export function hintFor(q: Pick<PlayQuestion, "type" | "hint" | "options" | "sequence" | "answers" | "answer" | "pairs">): string | null {
  if (q.hint && q.hint.trim()) return q.hint.trim();
  if (q.type === "TRUE_FALSE") return null;   // the first letter of True/False would give the answer away
  const right = q.options?.find((o) => o.correct)?.text ?? q.answers?.[0] ?? q.sequence?.[0] ?? q.pairs?.[0]?.left ?? null;
  if (right && right.trim()) { const w = right.trim(); return `${w.slice(0, Math.max(1, Math.min(3, Math.ceil(w.length / 4))))}…`; }
  return null;
}

/** Can this power-up be used on this question? (50/50 needs 3+ options; Hint needs a clue.) */
export function powerApplies(id: PowerUpId, q: PlayQuestion): boolean {
  if (id === "fifty") return fiftyFifty(q.options) !== null;
  if (id === "hint") return hintFor(q) !== null;
  return true;
}

export const isPowerUp = (v: unknown): v is PowerUpId => typeof v === "string" && (POWER_UPS as readonly string[]).includes(v);

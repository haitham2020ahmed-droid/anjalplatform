/**
 * 🎁 Mystery Chest rules (pure, no React — the game, the tests and, later, the Live Challenge room share them).
 *
 * A right answer lets the student open 1 of 3 chests. The three prizes are always one of each, shuffled:
 *   bonus   — extra game points
 *   double  — the answer's points again (it scores double)
 *   steal   — take game points from another player: in solo play the computer rival, in a Live Challenge the
 *             player in the room with the most points (never below 0). With nobody to take from, it is a bonus.
 * LUCK CHANGES GAME POINTS ONLY: whether the answer was right is decided before a chest is opened, and correct /
 * incorrect is all that results, reports and Reteach ever read.
 */
import type { PlayLevel } from "../types";

export const CHEST_PRIZES = ["bonus", "double", "steal"] as const;
export type ChestPrize = (typeof CHEST_PRIZES)[number];

/** solo points (a right answer is ~100–200) */
export const SOLO_CHEST = { bonus: 50, steal: 60 } as const;
/** Live Challenge points (a right answer is 500–1500) */
export const LIVE_CHEST = { bonus: 300, steal: 300 } as const;

/**
 * The Live Challenge device sends `{ choice, chest }` only once the room can open chests (the hook GINTEG adds to
 * rooms.ts — see the notes in scratchpad games/g2b/NEEDS.md). Until then a Live Mystery Chest plays with plain
 * answers and no chest is shown, so nothing on the device promises a prize the room cannot give.
 */
export const LIVE_CHESTS_ENABLED = true;

/** The three chests' prizes, shuffled (one of each). */
export function dealChests(rnd: () => number): ChestPrize[] {
  const a: ChestPrize[] = [...CHEST_PRIZES];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export interface ChestPlayer { id: string; points: number }
export interface ChestResult {
  /** the prize as given (a steal with nobody to take from becomes a bonus) */
  prize: ChestPrize;
  /** game points the opener gains */
  gain: number;
  /** points taken from `from` (steal only) */
  taken: number;
  from: string | null;
  /** a steal turned into a bonus */
  fellBack: boolean;
}

/**
 * Open a chest. `answerPoints` = what the right answer just scored (the double prize gives it again). `others` =
 * the players that can lose points (solo: the computer rival; live: everyone else in the room). Pure: returns what
 * happens, the caller applies it (applyChest does it for a list).
 */
export function openChest(prize: ChestPrize, answerPoints: number, others: readonly ChestPlayer[], amounts: { bonus: number; steal: number }): ChestResult {
  if (prize === "double") return { prize, gain: Math.max(0, Math.round(answerPoints)), taken: 0, from: null, fellBack: false };
  if (prize === "steal") {
    // from the leader (ties: the first listed) — never from a player with no points
    const victim = [...others].filter((p) => p.points > 0).sort((a, b) => b.points - a.points)[0];
    if (victim) { const taken = Math.min(amounts.steal, victim.points); return { prize, gain: taken, taken, from: victim.id, fellBack: false }; }
    return { prize: "bonus", gain: amounts.bonus, taken: 0, from: null, fellBack: true };
  }
  return { prize, gain: amounts.bonus, taken: 0, from: null, fellBack: false };
}

/**
 * Open a chest for `me` among `players` and APPLY it (mutates points: me up, the victim down, never below 0).
 * This is the whole room-side rule for a Live Challenge: rooms.ts calls it after a right answer of a
 * "mystery-chest" game with the device's chest pick.
 */
export function applyChest<P extends { points: number }>(players: Map<string, P>, me: string, prize: ChestPrize, answerPoints: number, amounts: { bonus: number; steal: number } = LIVE_CHEST): ChestResult {
  const self = players.get(me);
  if (!self) return { prize, gain: 0, taken: 0, from: null, fellBack: false };
  const others = [...players.entries()].filter(([id]) => id !== me).map(([id, p]) => ({ id, points: p.points }));
  const r = openChest(prize, answerPoints, others, amounts);
  self.points += r.gain;
  if (r.from) { const v = players.get(r.from); if (v) v.points = Math.max(0, v.points - r.taken); }
  return r;
}

/** The device's Live response with a chest pick, and the room's reading of it (plain labels still work). */
export const chestResponse = (choice: string, chest: number): { choice: string; chest: number } => ({ choice, chest: Math.max(0, Math.min(2, Math.trunc(chest))) });
export function readChestResponse(r: unknown): { choice: unknown; chest: number | null } {
  if (r && typeof r === "object" && !Array.isArray(r) && "choice" in r) {
    const c = Number((r as { chest?: unknown }).chest);
    return { choice: (r as { choice: unknown }).choice, chest: Number.isInteger(c) && c >= 0 && c <= 2 ? c : null };
  }
  return { choice: r, chest: null };
}

// ------------------------------------------------------------------ the computer rival (solo)

/** how often the computer rival answers right, by the student's level (so the race stays close) */
export const RIVAL_ACCURACY: Record<PlayLevel, number> = { BELOW: 0.55, ON: 0.65, ABOVE: 0.75 };

/** The rival's points for one question: 0, or 90–150 for a right answer (and now and then a small chest bonus). */
export function rivalTurn(level: PlayLevel, rnd: () => number): number {
  if (rnd() >= (RIVAL_ACCURACY[level] ?? RIVAL_ACCURACY.ON)) return 0;
  const base = 90 + Math.round(rnd() * 60);
  return rnd() < 0.3 ? base + SOLO_CHEST.bonus : base;
}

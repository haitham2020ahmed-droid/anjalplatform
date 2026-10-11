/**
 * 🏰 Castle Guard rules (pure, no React). Right answers earn castle coins (GAME coins: only for building in this
 * round — not the student's coin wallet). Coins build defences; every few questions a wave of gloom-blobs walks up
 * to the castle. Defences stop them; the ones that get through knock off a heart.
 *
 * Coins, defences and hearts are the game picture only. The result row keeps correct / incorrect answers.
 */

export type BuildId = "wall" | "archer" | "cannon" | "repair";

export interface Building { id: BuildId; name: string; line: string; cost: number; max: number }

/** What can be built (English interface names, translated through t()). */
export const BUILDINGS: readonly Building[] = [
  { id: "wall", name: "Wall", line: "Blocks 1 blob each wave", cost: 2, max: 3 },
  { id: "archer", name: "Archer tower", line: "Stops 1 blob each wave", cost: 3, max: 3 },
  { id: "cannon", name: "Cannon", line: "Stops 2 blobs each wave", cost: 5, max: 2 },
  { id: "repair", name: "Repair", line: "Get 1 heart back", cost: 2, max: 99 },
];
export const buildingById = (id: BuildId): Building => BUILDINGS.find((b) => b.id === id)!;

export const START_COINS = 2;
export const START_HEARTS = 5;
/** a wave comes after every this many answers */
export const WAVE_EVERY = 3;

/** Castle coins for a right answer: 3, or 4 on a streak of 3 or more. A wrong answer earns none. */
export const coinsFor = (correct: boolean, streakBefore: number): number => (correct ? (streakBefore >= 2 ? 4 : 3) : 0);

/** Blobs in wave n (1, 2, 3 …): 2, 3, 4, 5, 6 … */
export const waveSize = (n: number): number => Math.max(1, n + 1);
/** How many waves a round of `questions` questions has (a last one at the end if the count is not a multiple). */
export const waveCount = (questions: number): number => Math.max(1, Math.ceil(questions / WAVE_EVERY));
/** Does a wave come after the `answered`-th answer (1-based) of `questions`? */
export const waveAfter = (answered: number, questions: number): boolean => answered > 0 && (answered % WAVE_EVERY === 0 || answered === questions);

export interface Defence { wall: number; archer: number; cannon: number }
export const NO_DEFENCE: Defence = { wall: 0, archer: 0, cannon: 0 };

export interface WaveResult { blobs: number; stopped: number; blocked: number; through: number }

/** A wave meets the defences: towers stop blobs first, then each wall blocks one; the rest cost a heart each. */
export function resolveWave(def: Defence, blobs: number): WaveResult {
  const stopped = Math.min(blobs, def.archer + def.cannon * 2);
  const blocked = Math.min(blobs - stopped, def.wall);
  return { blobs, stopped, blocked, through: blobs - stopped - blocked };
}

export interface Castle { coins: number; hearts: number; def: Defence }
export const newCastle = (): Castle => ({ coins: START_COINS, hearts: START_HEARTS, def: { ...NO_DEFENCE } });

/** Can this be built now? */
export function canBuild(c: Castle, id: BuildId): boolean {
  const b = buildingById(id);
  if (c.coins < b.cost || c.hearts <= 0) return false;
  if (id === "repair") return c.hearts < START_HEARTS;
  return c.def[id] < b.max;
}

/** Builds (returns the new castle) or returns null when it cannot. */
export function build(c: Castle, id: BuildId): Castle | null {
  if (!canBuild(c, id)) return null;
  const b = buildingById(id);
  if (id === "repair") return { ...c, coins: c.coins - b.cost, hearts: c.hearts + 1 };
  return { ...c, coins: c.coins - b.cost, def: { ...c.def, [id]: c.def[id] + 1 } };
}

/** The castle after a wave. */
export function afterWave(c: Castle, w: WaveResult): Castle {
  return { ...c, hearts: Math.max(0, c.hearts - w.through) };
}

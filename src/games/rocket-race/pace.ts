/**
 * 🤖 Computer opponents for solo Rocket Race and Team Tug (pure, no React — shared by both games and the tests).
 *
 * A computer player "answers" on its own clock: every attempt takes about `secs` seconds (±25%) and is right with
 * chance `acc`; each right attempt is one step (a rocket boost / a pull on the rope). The pace follows the
 * student's level for the skill (Below slower, Above faster) so a typical student wins about half the time
 * (a little more than half: 50–60%). The race clock only runs while a question is open, so reading the
 * explanation after a wrong answer never costs the student the race.
 *
 * Opponents affect the game picture only. Results keep the student's own correct / incorrect answers.
 */
import type { PlayLevel } from "../types";

export interface Pace { /** seconds per attempt */ secs: number; /** chance an attempt is right */ acc: number }

/** The computer's pace per level (Below slower, Above faster). */
export const PACE: Record<PlayLevel, Pace> = {
  BELOW: { secs: 11.3, acc: 0.63 },
  ON: { secs: 9.2, acc: 0.69 },
  ABOVE: { secs: 8.2, acc: 0.74 },
};

/** A typical student at each level (time to read and answer one question, chance of a right answer). */
export const TYPICAL: Record<PlayLevel, Pace> = {
  BELOW: { secs: 11, acc: 0.65 },
  ON: { secs: 9, acc: 0.7 },
  ABOVE: { secs: 8, acc: 0.75 },
};

/** Seconds of race clock per step (lower = faster opponent). */
export const secsPerStep = (p: Pace): number => p.secs / p.acc;

/** Small seeded random numbers (the same race can be replayed in tests). */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The race-clock times (ms) at which a computer player gains each step, up to `steps` steps.
 * `factor` > 1 makes this player a little slower (e.g. a second, easier rocket).
 */
export function opponentSteps(level: PlayLevel, rnd: () => number, steps: number, factor = 1): number[] {
  const p = PACE[level] ?? PACE.ON;
  const out: number[] = [];
  let t = 0;
  for (let guard = 0; out.length < steps && guard < steps * 40; guard++) {
    t += p.secs * factor * (0.75 + rnd() * 0.5) * 1000;
    if (rnd() < p.acc) out.push(Math.round(t));
  }
  return out;
}

/** How many steps a computer player has made by race-clock time `ms`. */
export function stepsAt(times: readonly number[], ms: number): number {
  let n = 0;
  while (n < times.length && times[n] <= ms) n++;
  return n;
}

/** Fractional position for smooth animation: whole steps plus the part of the way to the next one. */
export function smoothAt(times: readonly number[], ms: number): number {
  const n = stepsAt(times, ms);
  if (n >= times.length) return n;
  const prev = n ? times[n - 1] : 0, next = times[n];
  // the last 600 ms before a step glide toward it
  const glide = Math.max(0, 1 - (next - ms) / 600);
  return n + (next > prev ? glide * 0.999 : 0);
}

// ------------------------------------------------------------------ Rocket Race rules

/** Boosts to the Moon: about 60% of the round's questions (at least 4). */
export const rocketGoal = (questions: number): number => Math.max(4, Math.round(questions * 0.6));
/** The two computer rockets: one a little slower, one about the same pace. */
export const ROCKET_FACTORS = [1.06, 1.18] as const;

// ------------------------------------------------------------------ Team Tug rules

/** The rope is won when the marker reaches this many steps from the middle. */
export const TUG_WIN = 4;

// ------------------------------------------------------------------ simulations (calibration + tests)

export type Outcome = "win" | "lose" | "draw";

/** One solo Rocket Race of a typical student (profile `you`) against the level's computer rockets. */
export function simulateRocket(level: PlayLevel, rnd: () => number, questions = 12, you: Pace = TYPICAL[level]): Outcome {
  const goal = rocketGoal(questions);
  const rivals = ROCKET_FACTORS.map((f) => opponentSteps(level, rnd, goal, f));
  let t = 0, me = 0;
  for (let i = 0; i < questions; i++) {
    t += you.secs * (0.75 + rnd() * 0.5) * 1000;
    if (rivals.some((r) => stepsAt(r, t) >= goal)) return "lose";
    if (rnd() < you.acc) me++;
    if (me >= goal) return "win";
  }
  const best = Math.max(...rivals.map((r) => stepsAt(r, t)));
  return me > best ? "win" : me === best ? "draw" : "lose";
}

/** One solo Team Tug of a typical student against the level's computer team. */
export function simulateTug(level: PlayLevel, rnd: () => number, questions = 12, you: Pace = TYPICAL[level]): Outcome {
  const them = opponentSteps(level, rnd, questions * 3);
  let t = 0, mine = 0;
  for (let i = 0; i < questions; i++) {
    t += you.secs * (0.75 + rnd() * 0.5) * 1000;
    // the computer's pulls happen during this question: check the line after each one
    if (mine - stepsAt(them, t) <= -TUG_WIN) return "lose";
    if (rnd() < you.acc) mine++;
    if (mine - stepsAt(them, t) >= TUG_WIN) return "win";
  }
  const pos = mine - stepsAt(them, t);
  return pos > 0 ? "win" : pos < 0 ? "lose" : "draw";
}

/** Share of games won over `n` simulated games. */
export function winRate(sim: (level: PlayLevel, rnd: () => number) => Outcome, level: PlayLevel, n = 4000, seed = 7): number {
  const rnd = rng(seed);
  let w = 0;
  for (let i = 0; i < n; i++) if (sim(level, rnd) === "win") w++;
  return w / n;
}

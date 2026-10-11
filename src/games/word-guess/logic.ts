/**
 * 🔤 Word Guess — the rules (pure, no React). The word to find is a one-word vocabulary answer from the bank:
 * a fill-in-the-blank with ONE accepted answer, or a multiple-choice question whose right option is one word. The
 * clue (the question) must not already show the word.
 *
 * Solo: up to MAX_GUESSES guesses; after each one every letter is coloured — right letter in the right place
 * ("hit"), in the word but elsewhere ("near"), not in the word ("miss"). Solved within MAX_GUESSES = correct.
 * Live Challenge (one answer per question, scored on the server by the bank): ONE guess — the student types the
 * word (fill-in-the-blank) or picks it from the word cards (multiple choice). Right word = correct; quicker = more
 * points, like every live mode. The device never has the key, so letter colours are a solo-only feature.
 */
import type { PlayQuestion } from "../types";

export const MAX_GUESSES = 6;
export const MIN_LETTERS = 3;
export const MAX_LETTERS = 8;
export type LetterState = "hit" | "near" | "miss";

const WORD = new RegExp(`^[A-Za-z]{${MIN_LETTERS},${MAX_LETTERS}}$`);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The word to guess (upper case), or null when the question does not fit Word Guess. */
export function targetOf(q: Pick<PlayQuestion, "type" | "stem" | "answers" | "options">): string | null {
  let word: string | null = null;
  if (q.type === "FILL_BLANK") {
    const all = [...new Set((q.answers ?? []).map((a) => String(a).trim().toLowerCase()).filter(Boolean))];
    if (all.length === 1) word = all[0];
  } else if (q.type === "MULTIPLE_CHOICE") {
    const right = (q.options ?? []).filter((o) => o.correct);
    if (right.length === 1) word = right[0].text.trim();
  }
  if (!word || !WORD.test(word)) return null;
  // the clue must not give the word away
  if (new RegExp(`\\b${escape(word)}\\b`, "i").test(q.stem)) return null;
  return word.toUpperCase();
}

export const fitsGuess = (q: Pick<PlayQuestion, "type" | "stem" | "answers" | "options">): boolean => targetOf(q) !== null;

/** Colour each letter of a guess (a letter used twice in the guess is "near" only as often as the word has it). */
export function scoreGuess(guess: string, target: string): LetterState[] {
  const g = guess.toUpperCase().split(""), t = target.toUpperCase().split("");
  const out: LetterState[] = g.map(() => "miss");
  const left = new Map<string, number>();
  g.forEach((c, i) => { if (c === t[i]) out[i] = "hit"; else left.set(t[i], (left.get(t[i]) ?? 0) + 1); });
  // letters of the word past the guess's length (never happens: guesses have the word's length)
  for (let i = g.length; i < t.length; i++) left.set(t[i], (left.get(t[i]) ?? 0) + 1);
  g.forEach((c, i) => { if (out[i] === "hit") return; const n = left.get(c) ?? 0; if (n > 0) { out[i] = "near"; left.set(c, n - 1); } });
  return out;
}

const RANK: Record<LetterState, number> = { miss: 0, near: 1, hit: 2 };
/** The best colour of every letter tried so far (for the keyboard). */
export function keyStates(guesses: readonly string[], target: string): Record<string, LetterState> {
  const out: Record<string, LetterState> = {};
  for (const g of guesses) scoreGuess(g, target).forEach((s, i) => { const c = g[i].toUpperCase(); if (!out[c] || RANK[s] > RANK[out[c]]) out[c] = s; });
  return out;
}

/** A guess is the word's length, letters A–Z only. */
export const validGuess = (guess: string, target: string): boolean => guess.length === target.length && /^[A-Za-z]+$/.test(guess);

/** Speed 0–1 for the points: solved at the first guess = 1, at the last = 0. */
export const guessSpeed = (used: number): number => Math.max(0, Math.min(1, (MAX_GUESSES - used) / (MAX_GUESSES - 1)));

/** 50/50 for Word Guess: about half of the keyboard letters that are NOT in the word are greyed out. */
export function removeLetters(target: string, tried: Record<string, LetterState>, rnd: () => number = Math.random): string[] {
  const inWord = new Set(target.toUpperCase().split(""));
  const pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").filter((c) => !inWord.has(c) && !tried[c]);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, Math.ceil(pool.length / 2)).sort();
}

/** Hint for Word Guess: the bank's hint, or the first letter (two for long words) shown in place. */
export function revealCount(target: string): number { return target.length >= 7 ? 2 : 1; }

/**
 * Live Challenge: what the device sends for the word typed or picked. Multiple choice → the option's label (null
 * when the word is not one of the cards); fill-in-the-blank → the word itself.
 */
export function liveGuessResponse(options: { label: string; text: string }[] | undefined, word: string): string | null {
  const w = word.trim();
  if (!w) return null;
  if (options && options.length) return options.find((o) => o.text.trim().toLowerCase() === w.toLowerCase())?.label ?? null;
  return w;
}

/**
 * 🔁 Spaced word review — the pure rules (no database).
 *
 * Each notebook word has a step 0..4 that means "come back in 1, 3, 7, 21, 60 days". A right answer moves the
 * word to the next step (the last step repeats every 60 days); a wrong answer sends it back to step 0 (due tomorrow).
 * At most 10 words are reviewed per school day (Riyadh time).
 *
 * Review items (original routine: the word in a sentence → ask what it means; example vs. non-example):
 *   CONTEXT  a sentence with the word + 4 meanings (distractors: other words' definitions, same part of speech first)
 *   MEANING  the same 4 meanings without a sentence (no sentence known yet)
 *   EXAMPLE  "Which is an example of 'generous'?" — the student's / school's example, the non-example, and another sentence
 */
import { seededShuffle } from "../practice/items";

export const REVIEW_STEPS = [1, 3, 7, 21, 60] as const;
export const DAILY_REVIEW_CAP = 10;
const DAY = 86_400_000;
/** School days start at midnight in Riyadh (UTC+3, no daylight saving). */
const OFFSET = 3 * 3_600_000;

export const startOfDay = (now: Date): Date => new Date(Math.floor((now.getTime() + OFFSET) / DAY) * DAY - OFFSET);
export const endOfDay = (now: Date): Date => new Date(startOfDay(now).getTime() + DAY);

/** Schedule for a word that just entered the notebook: step 0, due tomorrow. */
export function firstReview(now: Date): { nextReviewAt: Date; reviewStep: number } {
  return { nextReviewAt: new Date(now.getTime() + REVIEW_STEPS[0] * DAY), reviewStep: 0 };
}

/** The next schedule after a review answer. */
export function nextWordReview(step: number, correct: boolean, now: Date): { nextReviewAt: Date; reviewStep: number } {
  if (!correct) return firstReview(now);
  const next = Math.min(Math.max(0, Math.floor(step || 0)) + 1, REVIEW_STEPS.length - 1);
  return { nextReviewAt: new Date(now.getTime() + REVIEW_STEPS[next] * DAY), reviewStep: next };
}

/** Due today (any time before tonight's midnight). A word never scheduled is due. */
export function isDue(nextReviewAt: Date | string | null | undefined, now: Date): boolean {
  if (!nextReviewAt) return true;
  return new Date(nextReviewAt).getTime() < endOfDay(now).getTime();
}

/**
 * Today's review list: due words, most overdue first (never scheduled first of all), at most
 * DAILY_REVIEW_CAP minus the words already reviewed today.
 */
export function dueList<T extends { word: string; nextReviewAt: string | Date | null }>(words: T[], reviewedToday: number, now: Date): T[] {
  const room = Math.max(0, DAILY_REVIEW_CAP - reviewedToday);
  const t = (v: string | Date | null) => (v ? new Date(v).getTime() : -Infinity);
  return words.filter((w) => isDue(w.nextReviewAt, now)).sort((a, b) => t(a.nextReviewAt) - t(b.nextReviewAt) || a.word.localeCompare(b.word)).slice(0, room);
}

// ------------------------------------------------------------------ items

export interface ReviewWord {
  word: string; partOfSpeech: string | null; definition: string;
  /** a sentence using the word: the school's context sentence, else the dictionary example */
  sentence: string | null;
  /** example / non-example sentences (the student's own first, else the school's) */
  example: string | null; nonExample: string | null;
  reviewStep: number;
}
export interface PoolWord { word: string; partOfSpeech: string | null; definition: string; sentence?: string | null }

export type ReviewKind = "CONTEXT" | "MEANING" | "EXAMPLE";
export interface ReviewItem { word: string; kind: ReviewKind; prompt: string; sentence: string | null; choices: string[]; answer: string }

const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");

/** Three wrong meanings: other words' definitions of the same part of speech first, then any. */
export function pickDistractors(w: { word: string; partOfSpeech: string | null; definition: string }, pool: PoolWord[], seed: string): string[] {
  const seen = new Set([norm(w.definition)]);
  const others = pool.filter((p) => p.word !== w.word && p.definition.trim());
  const pos = (w.partOfSpeech ?? "").toLowerCase();
  const same = seededShuffle(others.filter((p) => pos && (p.partOfSpeech ?? "").toLowerCase() === pos), `${seed}:same`);
  const rest = seededShuffle(others.filter((p) => !(pos && (p.partOfSpeech ?? "").toLowerCase() === pos)), `${seed}:rest`);
  const out: string[] = [];
  for (const p of [...same, ...rest]) {
    if (out.length >= 3) break;
    const k = norm(p.definition);
    if (seen.has(k)) continue;
    seen.add(k); out.push(p.definition);
  }
  return out;
}

/** In-context (or meaning-only) item: 4 meanings, the right one exactly once. Null when the pool is too small. */
export function meaningItem(w: ReviewWord, pool: PoolWord[], seed: string): ReviewItem | null {
  const wrong = pickDistractors(w, pool, seed);
  if (wrong.length < 3) return null;
  const sentence = w.sentence && w.sentence.trim() ? w.sentence.trim() : null;
  return {
    word: w.word, kind: sentence ? "CONTEXT" : "MEANING",
    prompt: sentence ? `In this sentence, what does “${w.word}” mean?` : `What does “${w.word}” mean?`,
    sentence, choices: seededShuffle([w.definition, ...wrong], `${seed}:choices`), answer: w.definition,
  };
}

/** Example / non-example item: needs an example and a non-example sentence. */
export function exampleItem(w: ReviewWord, pool: PoolWord[], seed: string): ReviewItem | null {
  if (!w.example?.trim() || !w.nonExample?.trim() || norm(w.example) === norm(w.nonExample)) return null;
  const choices = [w.example.trim(), w.nonExample.trim()];
  // a third choice: another word's sentence (also not an example of this word)
  const other = seededShuffle(pool.filter((p) => p.word !== w.word && p.sentence && !choices.some((c) => norm(c) === norm(p.sentence!))), `${seed}:x`)[0];
  if (other?.sentence) choices.push(other.sentence.trim());
  return { word: w.word, kind: "EXAMPLE", prompt: `Which sentence is an example of “${w.word}”?`, sentence: null, choices: seededShuffle(choices, `${seed}:choices`), answer: w.example.trim() };
}

/**
 * The item for one word: when the word has an example and a non-example, every other review (odd steps) asks
 * example vs. non-example; otherwise the in-context meaning question (or meaning-only when no sentence exists).
 */
export function buildReviewItem(w: ReviewWord, pool: PoolWord[], seed: string): ReviewItem | null {
  const ex = exampleItem(w, pool, seed);
  const mean = meaningItem(w, pool, seed);
  if (ex && (w.reviewStep % 2 === 1 || !mean)) return ex;
  return mean ?? ex;
}

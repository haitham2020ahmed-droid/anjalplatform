import type { GameMeta } from "../types";
import { fitsGuess } from "./logic";

/**
 * Word Guess (deduction): find the vocabulary word from the clue; coloured letters show right letters and places.
 * Bank fill-in-the-blank questions with one one-word answer, and multiple-choice questions whose right option is
 * one word (3–8 letters) that the question does not already show. Solo (6 guesses) and Live Challenge (one guess).
 */
export const meta: GameMeta = {
  id: "word-guess",
  name: "Word Guess",
  icon: "🔤",
  color: "bg-emerald-100 text-emerald-700",
  line: "Guess the word from colour clues",
  types: ["FILL_BLANK", "MULTIPLE_CHOICE"],
  fits: fitsGuess,
  minQuestions: 3,
  roundSize: 6,
  roundSeconds: 180,
  ready: true,
  live: true,
};

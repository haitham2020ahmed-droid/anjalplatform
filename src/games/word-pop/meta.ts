import type { GameMeta } from "../types";
import { fitsWordPop } from "./rules";

/**
 * Word Pop (sorting). Sorting items (bank multi-select: "Pop all the verbs"), True/False, and multiple choice whose
 * choices are single words or short phrases (they must fit in a bubble — see rules.ts).
 */
export const meta: GameMeta = {
  id: "word-pop",
  name: "Word Pop",
  icon: "🫧",
  color: "bg-pink-100 text-pink-700",
  line: "Pop only the right words",
  types: ["MULTI_SELECT", "TRUE_FALSE", "MULTIPLE_CHOICE"],
  fits: fitsWordPop,
  minQuestions: 5,
  roundSize: 10,
  roundSeconds: 150,
  ready: true,
  live: true,
};

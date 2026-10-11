import type { GameMeta } from "../types";
import { fitsOrder } from "./logic";

/**
 * Word Builder (ordering): put the words (or sentences) in order. Bank WORD_ORDER / SENTENCE_ORDER questions with
 * 3–8 pieces. Solo and Live Challenge (the device sends the pieces as string[]).
 */
export const meta: GameMeta = {
  id: "word-builder",
  name: "Word Builder",
  icon: "🧱",
  color: "bg-orange-100 text-orange-700",
  line: "Put the words in order",
  types: ["WORD_ORDER", "SENTENCE_ORDER"],
  fits: fitsOrder,
  minQuestions: 3,
  roundSize: 8,
  roundSeconds: 150,
  ready: true,
  live: true,
};

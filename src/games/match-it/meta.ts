import type { GameMeta } from "../types";
import { fitsMatch } from "./logic";

/**
 * Match It (pairing): match each word or sentence with its meaning or answer. Bank MATCHING questions with 3–6
 * pairs (one board per question). Solo and Live Challenge (the device sends `{ left: right }`).
 */
export const meta: GameMeta = {
  id: "match-it",
  name: "Match It",
  icon: "🔗",
  color: "bg-sky-100 text-sky-700",
  line: "Match each word with its meaning",
  types: ["MATCHING"],
  fits: fitsMatch,
  minQuestions: 3,
  roundSize: 6,
  roundSeconds: 150,
  ready: true,
  live: true,
};

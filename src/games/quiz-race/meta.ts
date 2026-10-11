import type { GameMeta } from "../types";

/** Quiz Race (speed). Owned by this folder only — set `ready: true` (and `live: true` for Live Challenge) when built. */
export const meta: GameMeta = {
  id: "quiz-race",
  name: "Quiz Race",
  icon: "⚡",
  color: "bg-amber-100 text-amber-700",
  line: "Answer before the timer ends",
  types: ["MULTIPLE_CHOICE", "TRUE_FALSE"],
  minQuestions: 5,
  roundSize: 12,
  roundSeconds: 150,
  ready: true,
  live: true,
};

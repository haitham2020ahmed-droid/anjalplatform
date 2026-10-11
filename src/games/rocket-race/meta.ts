import type { GameMeta } from "../types";

/** Rocket Race (race). Owned by this folder only — set `ready: true` (and `live: true` for Live Challenge) when built. */
export const meta: GameMeta = {
  id: "rocket-race",
  name: "Rocket Race",
  icon: "🚀",
  color: "bg-indigo-100 text-indigo-700",
  line: "Race your rocket to the Moon",
  types: ["MULTIPLE_CHOICE", "TRUE_FALSE"],
  minQuestions: 5,
  roundSize: 12,
  roundSeconds: 150,
  ready: true,
  live: true,
};

import type { GameMeta } from "../types";

/** Team Tug (teams). Owned by this folder only — set `ready: true` (and `live: true` for Live Challenge) when built. */
export const meta: GameMeta = {
  id: "team-tug",
  name: "Team Tug",
  icon: "🪢",
  color: "bg-rose-100 text-rose-700",
  line: "Pull the rope for your team",
  types: ["MULTIPLE_CHOICE", "TRUE_FALSE"],
  minQuestions: 5,
  roundSize: 12,
  roundSeconds: 150,
  ready: true,
  live: true,
};

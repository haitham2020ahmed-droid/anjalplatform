import type { GameMeta } from "../types";

/** Castle Guard (strategy). Owned by this folder only — set `ready: true` (and `live: true` for Live Challenge) when built. */
export const meta: GameMeta = {
  id: "castle-guard",
  name: "Castle Guard",
  icon: "🏰",
  color: "bg-stone-200 text-stone-700",
  line: "Earn coins and build your defences",
  types: ["MULTIPLE_CHOICE", "TRUE_FALSE"],
  minQuestions: 5,
  roundSize: 12,
  roundSeconds: 180,
  ready: true,
  live: true,
};

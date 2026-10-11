import type { GameMeta } from "../types";

/** Mystery Chest (luck). Multiple choice and True/False; a right answer opens 1 of 3 surprise chests (chest.ts). */
export const meta: GameMeta = {
  id: "mystery-chest",
  name: "Mystery Chest",
  icon: "🎁",
  color: "bg-yellow-100 text-yellow-700",
  line: "Right answers open surprise chests",
  types: ["MULTIPLE_CHOICE", "TRUE_FALSE"],
  minQuestions: 5,
  roundSize: 10,
  roundSeconds: 150,
  ready: true,
  live: true,
};

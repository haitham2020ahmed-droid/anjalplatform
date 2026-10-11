import type { GameMeta } from "../types";
import { fitsLaneRunner } from "./rules";

/** Lane Runner (action). Multiple choice with 2–4 short choices (one per lane) and True/False (two lanes). */
export const meta: GameMeta = {
  id: "lane-runner",
  name: "Lane Runner",
  icon: "🏃",
  color: "bg-lime-100 text-lime-700",
  line: "Run to the lane with the right answer",
  types: ["MULTIPLE_CHOICE", "TRUE_FALSE"],
  fits: fitsLaneRunner,
  minQuestions: 5,
  roundSize: 12,
  roundSeconds: 150,
  ready: true,
  live: true,
};

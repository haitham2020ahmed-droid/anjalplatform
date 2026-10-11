/**
 * Lazy loaders: a game's code is downloaded only when it is opened (one chunk per game). Static paths so the
 * bundler can split them; every id has a file (placeholders until Part 2 builds the game).
 */
import type { FC } from "react";
import type { GameId, GameProps, LiveChestProps, LivePadProps, ProjectorViewProps } from "./types";

/**
 * A game's module. Optional exports (Games integration): `LivePad` (student device), `ProjectorView` (the teacher's
 * projector in place of the default Live Board; kit fallbacks: rockets for `field` modes, the rope for `teams`),
 * `LiveChest` (the chest picker for `chest` modes; kit fallback: three chests).
 */
export interface GameModule { default: FC<GameProps>; LivePad?: FC<LivePadProps>; ProjectorView?: FC<ProjectorViewProps>; LiveChest?: FC<LiveChestProps> }

export const GAME_LOADERS: Record<GameId, () => Promise<GameModule>> = {
  "quiz-race": () => import("./quiz-race/game"),
  "match-it": () => import("./match-it/game"),
  "word-builder": () => import("./word-builder/game"),
  "word-guess": () => import("./word-guess/game"),
  "word-pop": () => import("./word-pop/game"),
  "lane-runner": () => import("./lane-runner/game"),
  "mystery-chest": () => import("./mystery-chest/game"),
  "castle-guard": () => import("./castle-guard/game"),
  "rocket-race": () => import("./rocket-race/game"),
  "team-tug": () => import("./team-tug/game"),
};

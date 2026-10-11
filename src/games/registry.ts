/**
 * 🎲 The game registry: every game's id, name, icon, one line, question types and minimum questions. Metadata
 * only (tiny), safe for the server and the browser. Each game's own folder holds its meta (src/games/<id>/meta.ts)
 * so games can be added in parallel without editing this file.
 */
import type { GameId, GameMeta } from "./types";
import { GAME_IDS } from "./types";
import { meta as quizRace } from "./quiz-race/meta";
import { meta as matchIt } from "./match-it/meta";
import { meta as wordBuilder } from "./word-builder/meta";
import { meta as wordGuess } from "./word-guess/meta";
import { meta as wordPop } from "./word-pop/meta";
import { meta as laneRunner } from "./lane-runner/meta";
import { meta as mysteryChest } from "./mystery-chest/meta";
import { meta as castleGuard } from "./castle-guard/meta";
import { meta as rocketRace } from "./rocket-race/meta";
import { meta as teamTug } from "./team-tug/meta";

const ALL: Record<GameId, GameMeta> = {
  "quiz-race": quizRace, "match-it": matchIt, "word-builder": wordBuilder, "word-guess": wordGuess, "word-pop": wordPop,
  "lane-runner": laneRunner, "mystery-chest": mysteryChest, "castle-guard": castleGuard, "rocket-race": rocketRace, "team-tug": teamTug,
};

/** All 10 games in the menu order (the owner's list). */
export const GAMES: readonly GameMeta[] = GAME_IDS.map((id) => ALL[id]);
export const gameMeta = (id: string): GameMeta | null => (id in ALL ? ALL[id as GameId] : null);
/** Games that can run now (solo). */
export const readyGames = (): GameMeta[] => GAMES.filter((g) => g.ready);
/** Games a teacher can pick as a Live Challenge mode. */
export const liveModes = (): GameMeta[] => GAMES.filter((g) => g.ready && g.live);

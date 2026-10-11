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

/**
 * A game is shown only when there are enough fitting questions for a full round: at least this many, or the game's
 * whole round when its round is shorter (Match It / Word Guess play 6). Below that the game is hidden — never "coming later".
 */
export const MIN_QUESTIONS_PER_GAME = 8;
/** The fitting questions a game needs to be shown (the stricter of its own minimum and a full round). */
export const minQuestionsFor = (g: Pick<GameMeta, "minQuestions" | "roundSize">): number => Math.max(g.minQuestions, Math.min(MIN_QUESTIONS_PER_GAME, g.roundSize));
for (const id of GAME_IDS) ALL[id] = { ...ALL[id], minQuestions: minQuestionsFor(ALL[id]) };

/** All 10 games in the menu order (the owner's list). */
export const GAMES: readonly GameMeta[] = GAME_IDS.map((id) => ALL[id]);
export const gameMeta = (id: string): GameMeta | null => (id in ALL ? ALL[id as GameId] : null);
/** Games that can run now (solo). */
export const readyGames = (): GameMeta[] => GAMES.filter((g) => g.ready);
/** Games a teacher can pick as a Live Challenge mode. */
export const liveModes = (): GameMeta[] => GAMES.filter((g) => g.ready && g.live);

/** Fitting-question counts per game id (from the server). */
export type GameCounts = Partial<Record<string, number>>;
/**
 * The games to show for these counts: built, (Live Challenge: live) and with enough fitting questions. A game the
 * whole bank cannot fill (`bank` counts below the minimum) never shows, whatever the skill counts say.
 */
export function gamesWithEnough(counts: GameCounts, opts: { live?: boolean; bank?: GameCounts } = {}): GameMeta[] {
  return GAMES.filter((g) => g.ready && (!opts.live || g.live) && (counts[g.id] ?? 0) >= g.minQuestions && (!opts.bank || (opts.bank[g.id] ?? 0) >= g.minQuestions));
}
/** The Play button shows only when at least one game qualifies. */
export const showPlayButton = (counts: GameCounts, bank?: GameCounts): boolean => gamesWithEnough(counts, { bank }).length > 0;

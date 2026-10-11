/**
 * 🎲 The game-list filtering helpers of the Play menu and the Live Challenge mode choice (pure, no React): only games
 * with enough fitting questions are listed — a game without them is hidden, never shown as "later".
 */
import { GAMES } from "../../games/registry";
import type { GameMeta } from "../../games/types";

/** The games of a skill as the server lists them: only `status: "PLAY"` games are shown. */
export function playableIds(games: { id: string; status: string }[]): Set<string> {
  return new Set(games.filter((g) => g.status === "PLAY").map((g) => g.id));
}

/** The Live Challenge modes to list, in menu order (`allowed` null while the server answer is on its way: none yet). */
export function modesToShow(allowed: readonly string[] | null): GameMeta[] {
  if (!allowed) return [];
  const ok = new Set(allowed);
  return GAMES.filter((g) => g.ready && g.live && ok.has(g.id));
}

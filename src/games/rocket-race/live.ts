/**
 * 🚀 Rocket Race in a Live Challenge (pure): every player's rocket on the projector, placed by Live Challenge
 * points. The Moon is at about 700 points a question (a right answer scores 500–1000 plus streaks), so the
 * class leader reaches it near the end of a good game. Points are the room's normal live points.
 */
import type { TeamId } from "../team-tug/teams";

/** One player as the projector gets them (first names only). */
export interface Racer { name: string; points: number; rank?: number; team?: TeamId }

/** What a game's projector view reads from the room's host view (HostView fits this shape). */
export interface ProjectorFeed {
  status: string; index: number; total: number;
  /** the top 8 (always there) */
  board: { name: string; points: number; rank: number }[];
  /** every player (when the room sends it — see NEEDS.md); falls back to the board */
  racers?: Racer[];
}

export const POINTS_PER_QUESTION_TO_MOON = 700;
export const moonPoints = (total: number): number => Math.max(1, total) * POINTS_PER_QUESTION_TO_MOON;

export interface Lane { name: string; points: number; rank: number; frac: number; atMoon: boolean }

/** Lanes in rank order: each rocket's share of the way to the Moon (0–1). */
export function rocketLanes(feed: Pick<ProjectorFeed, "board" | "racers" | "total">, max = 30): Lane[] {
  const goal = moonPoints(feed.total);
  const rows = (feed.racers?.length ? feed.racers : feed.board).map((r) => ({ name: r.name, points: Math.max(0, r.points) }));
  rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  return rows.slice(0, max).map((r, i) => ({ name: r.name, points: r.points, rank: i + 1, frac: Math.min(1, r.points / goal), atMoon: r.points >= goal }));
}

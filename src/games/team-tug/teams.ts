/**
 * 🪢 Team Tug teams (pure, no React — usable by the Live Challenge room on the server and by the projector screen).
 *
 * Live Challenge: the class is split automatically into two teams balanced by level (the same number of Above /
 * On / Below students on each side, ±1) — a snake draft, so neither team gets all the strong readers. The rope
 * follows each team's AVERAGE points, so a team with one player more has no advantage.
 */
import type { PlayLevel } from "../types";

export type TeamId = "A" | "B";
export const TEAMS: readonly TeamId[] = ["A", "B"];
/** English interface names (translated through t()) and colours. */
export const TEAM_INFO: Record<TeamId, { name: string; fill: string; soft: string; text: string }> = {
  A: { name: "Red Team", fill: "#e11d48", soft: "bg-rose-50 ring-rose-200", text: "text-rose-700" },
  B: { name: "Blue Team", fill: "#2563eb", soft: "bg-blue-50 ring-blue-200", text: "text-blue-700" },
};

const RANK: Record<PlayLevel, number> = { ABOVE: 0, ON: 1, BELOW: 2 };

/**
 * Splits players into two teams balanced by level. Stable: the same players (any order) always get the same teams.
 * Within a level, players keep the order of their ids so a rejoin never moves anyone.
 */
export function splitTeams(players: readonly { id: string; level: PlayLevel }[]): Map<string, TeamId> {
  const list = [...players].sort((a, b) => (RANK[a.level] ?? 1) - (RANK[b.level] ?? 1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out = new Map<string, TeamId>();
  // snake draft: A B B A A B B A … keeps both the size and the level mix even
  list.forEach((p, i) => out.set(p.id, i % 4 === 0 || i % 4 === 3 ? "A" : "B"));
  return out;
}

/**
 * Adds one late joiner to the team that needs them (fewer players; on a tie, the team with fewer players of
 * that level; then Red). Existing players never move.
 */
export function teamForLateJoiner(current: readonly { team: TeamId; level: PlayLevel }[], level: PlayLevel): TeamId {
  const size = (t: TeamId) => current.filter((p) => p.team === t).length;
  const same = (t: TeamId) => current.filter((p) => p.team === t && p.level === level).length;
  if (size("A") !== size("B")) return size("A") < size("B") ? "A" : "B";
  return same("B") < same("A") ? "B" : "A";
}

export interface TugState {
  /** each team's average points and its players */
  teams: Record<TeamId, { avg: number; total: number; players: number }>;
  /** rope position −1 (Red wins) … 0 (middle) … +1 (Blue wins) */
  pos: number;
  leader: TeamId | null;
}

/** The rope from every player's points and team (average per team, so team sizes do not matter). */
export function tugState(rows: readonly { team: TeamId; points: number }[]): TugState {
  const teams = { A: { avg: 0, total: 0, players: 0 }, B: { avg: 0, total: 0, players: 0 } } as TugState["teams"];
  for (const r of rows) { const t = teams[r.team]; if (!t) continue; t.total += Math.max(0, r.points); t.players++; }
  for (const id of TEAMS) teams[id].avg = teams[id].players ? Math.round(teams[id].total / teams[id].players) : 0;
  const sum = teams.A.avg + teams.B.avg;
  const pos = sum > 0 ? Math.max(-1, Math.min(1, (teams.B.avg - teams.A.avg) / sum)) : 0;
  return { teams, pos, leader: teams.A.avg === teams.B.avg ? null : teams.A.avg > teams.B.avg ? "A" : "B" };
}

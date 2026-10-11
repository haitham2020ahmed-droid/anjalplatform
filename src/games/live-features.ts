/**
 * 🧩 Which Live Challenge extras each game mode switches on (Games integration). Kept outside the games' own folders
 * so the room server (rooms.ts) knows them without loading any game code. A mode not listed plays like Quiz Race.
 *
 *   chest  Mystery Chest: a right answer opens 1 of 3 chests — bonus points, double points, or points taken from the
 *          classmate in the lead (never below 0). Shown on the Live Board. Game points only.
 *   teams  Team Tug: two teams balanced by level when the game starts (late joiners go to the smaller team);
 *          team points (the average of the members' points) on the board, the projector and every device.
 *   field  Rocket Race: the projector gets every player (rockets by points), not just the top 8.
 */
import type { ChestPrize, GameId, LiveFeatures } from "./types";

export const LIVE_FEATURES: Partial<Record<GameId, LiveFeatures>> = {
  "mystery-chest": { chest: true },
  "team-tug": { teams: true, field: true },
  "rocket-race": { field: true },
};

export const liveFeatures = (mode: string): LiveFeatures => LIVE_FEATURES[mode as GameId] ?? {};

/**
 * Team names and colours (hex so SVG views can use them). The same names as solo Team Tug (G2C's strings
 * "Blue Team" / "Red Team", translated in its i18n section).
 */
export const TEAMS = [
  { id: 0, letter: "A", name: "Red Team", color: "#e11d48" },
  { id: 1, letter: "B", name: "Blue Team", color: "#2563eb" },
] as const;
/** G2C's Team Tug ids ("A" = Red = team 0, "B" = Blue = team 1). */
export const teamLetter = (team: number | null | undefined): "A" | "B" | null => (team === 0 ? "A" : team === 1 ? "B" : null);

/** Chest prizes (game points only; the same amounts as Mystery Chest's LIVE_CHEST). */
export const CHEST = { bonus: 300, steal: 300, doubleMin: 200, prizes: ["bonus", "double", "steal"] as ChestPrize[] } as const;

import type { LineIconName } from "../ui/line-icon";

/**
 * The student home's main tiles (data only, no React): each tile opens its page directly, and every page appears
 * once on the home page (a tile's page is never repeated as a notice or a link elsewhere on Home). Respond to
 * Reading is not a tile: it opens from the Curriculum Map study plan (and from a teacher's writing notice).
 */
export interface HomeTile { key: string; href: string; label: string; hint: string; line: LineIconName; /** the 8-point-star badge behind the icon: fill and icon colour (Literise D1) */ star: { bg: string; fg: string } }

export const STUDENT_HOME_TILES: readonly HomeTile[] = [
  { key: "work", href: "/student/work", label: "My Work", hint: "Everything your teacher gave you", line: "work", star: { bg: "var(--color-brand-navy)", fg: "#ffffff" } },
  { key: "map", href: "/student/map", label: "MAP", hint: "Your scores, goal and practice", line: "map", star: { bg: "#e4e0f8", fg: "#3b2f8f" } },
  { key: "curriculum", href: "/student/curriculum", label: "Curriculum Map", hint: "Your study plan", line: "curriculum", star: { bg: "#d6f0f0", fg: "#0f6666" } },
  { key: "second-chance", href: "/student/second-chance", label: "Second Chance", hint: "Try missed questions again", line: "retry", star: { bg: "#fde9a0", fg: "#6b4e00" } },
  { key: "reading", href: "/student/reading", label: "ReadMaster / ReadRise", hint: "Articles to read", line: "reading", star: { bg: "#f2b705", fg: "#232a6e" } },
  { key: "fluency", href: "/student/fluency-coach", label: "Fluency Coach", hint: "Read aloud and get feedback", line: "mic", star: { bg: "#dfe9fb", fg: "#23407a" } },
  { key: "writing", href: "/student/writing", label: "Writing", hint: "Your writing tasks", line: "writing", star: { bg: "#9b8bdb", fg: "#1d2160" } },
  { key: "tests", href: "/student/tests", label: "My Tests", hint: "Tests to do and your results", line: "tests", star: { bg: "#e7eaf6", fg: "#232a6e" } },
];

/** The home's notices without any page that is already a tile (no duplicates on the home page). */
export function withoutTilePages<T extends { href: string }>(notices: T[]): T[] {
  const tiles = new Set(STUDENT_HOME_TILES.map((x) => x.href));
  return notices.filter((n) => !tiles.has(n.href.split(/[?#]/)[0]));
}

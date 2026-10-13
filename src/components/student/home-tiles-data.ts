import type { LineIconName } from "../ui/line-icon";

/**
 * The student home's main tiles (data only, no React): each tile opens its page directly, and every page appears
 * once on the home page (a tile's page is never repeated as a notice or a link elsewhere on Home). Respond to
 * Reading is not a tile: it opens from the Curriculum Map study plan (and from a teacher's writing notice).
 */
export interface HomeTile { key: string; href: string; label: string; hint: string; line: LineIconName }

export const STUDENT_HOME_TILES: readonly HomeTile[] = [
  { key: "work", href: "/student/work", label: "My Work", hint: "Everything your teacher gave you", line: "work" },
  { key: "map", href: "/student/map", label: "MAP", hint: "Your scores, goal and practice", line: "map" },
  { key: "curriculum", href: "/student/curriculum", label: "Curriculum Map", hint: "Your study plan", line: "curriculum" },
  { key: "second-chance", href: "/student/second-chance", label: "Second Chance", hint: "Try missed questions again", line: "retry" },
  { key: "reading", href: "/student/reading", label: "ReadMaster / ReadRise", hint: "Articles to read", line: "reading" },
  { key: "fluency", href: "/student/fluency-coach", label: "Fluency Coach", hint: "Read aloud and get feedback", line: "mic" },
  { key: "writing", href: "/student/writing", label: "Writing", hint: "Your writing tasks", line: "writing" },
  { key: "tests", href: "/student/tests", label: "My Tests", hint: "Tests to do and your results", line: "tests" },
];

/** The home's notices without any page that is already a tile (no duplicates on the home page). */
export function withoutTilePages<T extends { href: string }>(notices: T[]): T[] {
  const tiles = new Set(STUDENT_HOME_TILES.map((x) => x.href));
  return notices.filter((n) => !tiles.has(n.href.split(/[?#]/)[0]));
}

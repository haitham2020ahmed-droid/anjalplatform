/**
 * Pages whose main area is English learning CONTENT (passages, questions, answer choices, feedback, reports).
 * In Arabic mode the top bar and menu turn right-to-left, but these pages' main area stays left-to-right
 * so English text reads exactly as in English mode. Nothing on them is translated.
 */
const CONTENT_PREFIXES = [
  "/practice/", "/quiz/", "/skill/", "/game/", "/play", "/explain", "/diagnostic/",
  "/student/assignments/", "/student/exit/", "/student/lesson", "/student/map-test", "/student/placement",
  "/student/readmaster/", "/student/readrise/", "/student/respond/", "/student/review", "/student/weekly-check",
  "/student/words/", "/student/writing/", "/student/decoding", "/student/strategy-survey", "/student/fluency-coach",
  "/student/plans/", "/student/family", "/parent/", "/family-report/",
];

export function isContentPath(path: string | null | undefined): boolean {
  const p = String(path ?? "");
  // "/a/" = only the pages under /a (e.g. one article), "/a" = /a itself and everything under it
  return CONTENT_PREFIXES.some((x) => (x.endsWith("/") ? p.startsWith(x) : p === x || p.startsWith(`${x}/`)));
}

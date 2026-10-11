/**
 * 🗺️ The student's MAP dashboard (/student/map): one card for Reading and one for Language Usage — the latest RIT,
 * the goal areas with simple bars, the goal ("Your goal: 215"), the points still needed, 2–3 strengths and 2–3
 * things to grow. Numbers and friendly words ONLY: students never see a descriptor (Low / LoAvg / Avg / HiAvg /
 * High) or Below / On / Above about themselves. Teachers and parents see descriptors on their own reports.
 * Pure (from myMap); the numbers are the MAP numbers, untouched.
 */
import type { MyMap } from "../map/map-more";

/** Words a student never sees on the MAP dashboard (checked by tests/student-pages.test.ts). */
export const FORBIDDEN_LEVEL_WORDS = /\b(Low|LoAvg|Lo|Avg|Average|HiAvg|Hi|High|Below|On|Above)\b/;

export const MAP_SUBJECT_NAME = { READING: "Reading", LANGUAGE: "Language Usage" } as const;
/** The bars' scale (RIT): the usual Grades 2–8 range. */
export const BAR_MIN = 150, BAR_MAX = 250;

export interface MapArea { name: string; icon: string; rit: number | null; pct: number }
export interface MapCard {
  subject: "READING" | "LANGUAGE"; name: string; term: string | null;
  /** latest real MAP RIT (null: no scores yet) */
  rit: number | null;
  goal: number | null;
  /** RIT points from the latest RIT to the goal (0 once reached; null without a goal) */
  toGoal: number | null;
  reached: boolean;
  /** progress from the Fall RIT to the goal, 0–100 */
  goalPct: number;
  areas: MapArea[];
  strengths: string[];
  grow: { name: string; href: string | null }[];
}

/** Points still needed to reach the goal: never negative; null when a number is missing. */
export function pointsToGoal(rit: number | null | undefined, goal: number | null | undefined): number | null {
  if (rit === null || rit === undefined || goal === null || goal === undefined || !Number.isFinite(rit) || !Number.isFinite(goal)) return null;
  return Math.max(0, Math.round(goal - rit));
}

/** A RIT as a bar width (0–100) on the fixed scale. */
export const barPct = (rit: number | null) => (rit === null ? 0 : Math.max(4, Math.min(100, Math.round((100 * (rit - BAR_MIN)) / (BAR_MAX - BAR_MIN)))));

/** Pure: the two cards from My MAP (subjects without a score still get a card, with friendly empty words). */
export function studentMapCards(m: MyMap): MapCard[] {
  return (["READING", "LANGUAGE"] as const).map((subject) => {
    const x = m.subjects.find((y) => y.subject === subject);
    const rit = x?.profile.overall?.rit ?? null;
    const goal = x?.goal?.target ?? null;
    const from = x?.goal?.from ?? null;
    const toGoal = pointsToGoal(rit, goal);
    const scored = (x?.areas ?? []).filter((a) => a.rit !== null).sort((a, b) => Number(b.rit) - Number(a.rit));
    // grow: the areas to focus on (weakest first), else the two lowest scores; strengths: the highest, never a grow area
    const focus = (x?.areas ?? []).filter((a) => a.status === "FOCUS");
    const growAreas = (focus.length ? focus : scored.slice(-2).reverse()).slice(0, 3);
    const extend = scored.filter((a) => a.status === "EXTEND");
    const strengths = (extend.length ? extend : scored).filter((a) => !growAreas.some((g) => g.group === a.group)).slice(0, 3).map((a) => a.name);
    return {
      subject, name: MAP_SUBJECT_NAME[subject], term: x?.profile.term ?? null, rit, goal, toGoal,
      reached: toGoal === 0,
      goalPct: rit !== null && goal !== null && from !== null ? Math.max(0, Math.min(100, Math.round((100 * (rit - from)) / Math.max(1, goal - from)))) : 0,
      areas: (x?.areas ?? []).map((a) => ({ name: a.name, icon: a.icon, rit: a.rit, pct: barPct(a.rit) })),
      strengths,
      grow: growAreas.map((a) => ({ name: a.name, href: a.next ? `/practice/${a.next}?from=map` : null })),
    };
  });
}

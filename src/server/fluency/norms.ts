/**
 * 📏 Oral reading fluency norms (Hasbrouck & Tindal, 2017, public ORF norms, words correct per minute) — the US norms
 * as published, used as they are (the school's choice). Grades 4–6, three seasons, percentiles 90/75/50/25/10.
 * Same numbers as data/curriculum/fluency-norms.json.
 *
 * season by month (school year Aug–Jul): Aug–Nov fall · Dec–Feb winter · Mar–Jul spring.
 * Bands: BELOW under the 25th percentile · ABOVE over the 75th · ON between (the norms' own guidance: a student more
 * than 10 WCPM under the 50th percentile needs fluency instruction — `needsFluencyWork`).
 */
export type Season = "FALL" | "WINTER" | "SPRING";
type Row = [p90: number, p75: number, p50: number, p25: number, p10: number];

export const HT_2017: Record<Season, Record<number, Row>> = {
  FALL: { 4: [153, 125, 94, 75, 60], 5: [179, 153, 121, 87, 64], 6: [185, 159, 132, 112, 89] },
  WINTER: { 4: [168, 143, 120, 95, 71], 5: [183, 160, 133, 109, 84], 6: [195, 166, 145, 116, 91] },
  SPRING: { 4: [184, 160, 133, 105, 83], 5: [195, 169, 146, 119, 102], 6: [204, 171, 146, 122, 91] },
};
export const NORM_SOURCE = "Hasbrouck & Tindal (2017) oral reading fluency norms";

export function fluencySeason(d: Date = new Date()): Season {
  const m = d.getUTCMonth() + 1;
  return m >= 8 && m <= 11 ? "FALL" : m === 12 || m <= 2 ? "WINTER" : "SPRING";
}

const gradeRow = (grade: number, season: Season): Row | null => HT_2017[season][Math.min(6, Math.max(4, Math.round(grade)))] ?? null;

/** The 50th percentile for the grade and season (the norms' benchmark). */
export function norm50(grade: number, season: Season = fluencySeason()): number | null {
  const r = gradeRow(grade, season);
  return r ? r[2] : null;
}

/** National percentile (1–99) of a WCPM score for the grade and season, interpolated between the published points. */
export function wcpmPercentile(grade: number, wcpm: number, season: Season = fluencySeason()): number | null {
  const r = gradeRow(grade, season);
  if (!r || !Number.isFinite(wcpm)) return null;
  const pts: [number, number][] = [[10, r[4]], [25, r[3]], [50, r[2]], [75, r[1]], [90, r[0]]];
  if (wcpm <= pts[0][1]) return Math.max(1, Math.round((10 * wcpm) / Math.max(1, pts[0][1])));
  for (let i = 1; i < pts.length; i++) {
    const [pa, wa] = pts[i - 1], [pb, wb] = pts[i];
    if (wcpm <= wb) return Math.round(pa + ((pb - pa) * (wcpm - wa)) / Math.max(1, wb - wa));
  }
  return Math.min(99, Math.round(90 + (10 * (wcpm - r[0])) / Math.max(1, r[0] - r[1])));
}

/** BELOW / ON / ABOVE from the percentile (25th and 75th as the edges). */
export function fluencyBand(grade: number, wcpm: number, season: Season = fluencySeason()): "BELOW" | "ON" | "ABOVE" | null {
  const p = wcpmPercentile(grade, wcpm, season);
  if (p === null) return null;
  return p < 25 ? "BELOW" : p > 75 ? "ABOVE" : "ON";
}

/** WCPM edges of the bands for the grade and season: below < p25, above > p75. */
export function bandEdges(grade: number, season: Season = fluencySeason()): { below: number; above: number; p50: number } | null {
  const r = gradeRow(grade, season);
  return r ? { below: r[3], above: r[1], p50: r[2] } : null;
}

/** More than 10 WCPM under the 50th percentile: needs fluency instruction (the norms' guidance). */
export function needsFluencyWork(grade: number, wcpm: number, season: Season = fluencySeason()): boolean {
  const m = norm50(grade, season);
  return m !== null && wcpm < m - 10;
}

/** Weekly growth to reach the next season's 50th percentile from now (for goals). */
export function weeklyGrowthTarget(grade: number, wcpm: number, now: Date = new Date()): { target: number; weeks: number; perWeek: number } | null {
  const s = fluencySeason(now);
  const next: Season = s === "FALL" ? "WINTER" : "SPRING";
  const target = norm50(grade, next);
  if (target === null) return null;
  const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
  const end = next === "WINTER" ? new Date(Date.UTC(m >= 8 ? y + 1 : y, 0, 15)) : new Date(Date.UTC(m >= 8 ? y + 1 : y, 4, 15));
  const weeks = Math.max(2, Math.round((end.getTime() - now.getTime()) / (7 * 86_400_000)));
  return { target, weeks, perWeek: Math.max(0.5, Math.round(((target - wcpm) / weeks) * 10) / 10) };
}

export const SEASON_NAME: Record<Season, string> = { FALL: "fall", WINTER: "winter", SPRING: "spring" };
export const isSeason = (v: unknown): v is Season => v === "FALL" || v === "WINTER" || v === "SPRING";

/** 1 → "1st", 22 → "22nd", 23 → "23rd", 11 → "11th". */
export function ordinal(n: number): string {
  const k = Math.abs(Math.round(n)), t = k % 100;
  const suf = t >= 11 && t <= 13 ? "th" : k % 10 === 1 ? "st" : k % 10 === 2 ? "nd" : k % 10 === 3 ? "rd" : "th";
  return `${Math.round(n)}${suf}`;
}

/** Everything a page needs about one score: "92 WCPM = 23rd percentile (winter, Grade 5)". */
export interface NormView { wcpm: number; grade: number; season: Season; percentile: number | null; band: "BELOW" | "ON" | "ABOVE" | null; p50: number | null; needsWork: boolean; text: string; kid: string }
export function normView(grade: number, wcpm: number, season: Season = fluencySeason()): NormView {
  const g = Math.min(6, Math.max(4, Math.round(grade)));
  const p = wcpmPercentile(g, wcpm, season);
  const e = bandEdges(g, season);
  const band = e ? (wcpm <= e.below ? "BELOW" : wcpm > e.above ? "ABOVE" : "ON") : null;
  const text = p === null ? `${wcpm} WCPM` : `${wcpm} WCPM = ${ordinal(p)} percentile (${SEASON_NAME[season]}, Grade ${g})`;
  // for students: simple words (out of every 100 readers)
  const kid = p === null ? `You read ${wcpm} words correctly in one minute.`
    : `You read ${wcpm} words correctly in one minute. That is faster than about ${p} of every 100 Grade ${g} readers in the ${SEASON_NAME[season]}.`;
  return { wcpm, grade: g, season, percentile: p, band, p50: e?.p50 ?? null, needsWork: needsFluencyWork(g, wcpm, season), text, kid };
}

/** The next season (spring → the next school year's fall, for the same grade's norms). */
export const nextSeason = (s: Season): Season => (s === "FALL" ? "WINTER" : s === "WINTER" ? "SPRING" : "FALL");

/** The goal for next week: current WCPM + the weekly growth needed to reach the next season's 50th percentile. */
export function weeklyGoal(grade: number, wcpm: number, now: Date = new Date()): { nextGoal: number; perWeek: number; target: number; weeks: number; season: Season; reached: boolean } | null {
  const g = weeklyGrowthTarget(grade, wcpm, now);
  if (!g) return null;
  const season: Season = fluencySeason(now) === "FALL" ? "WINTER" : "SPRING";
  const reached = wcpm >= g.target;
  return { nextGoal: reached ? wcpm + 2 : Math.min(g.target, wcpm + Math.max(1, Math.ceil(g.perWeek))), perWeek: reached ? 0 : g.perWeek, target: g.target, weeks: g.weeks, season, reached };
}

/**
 * 📏 Oral reading fluency norms (Hasbrouck & Tindal, 2017, public ORF norms, words correct per minute) — the US norms
 * as published, used as they are (the school's choice). Grades 4–6, three seasons, percentiles 90/75/50/25/10.
 * Same numbers as data/curriculum/fluency-norms.json.
 *
 * season by month, Riyadh time (r4): Sep–Nov fall · Dec–Mar winter · Apr–Aug spring (no jump on 1 March).
 * Bands (r4: one rule everywhere): BELOW = WCPM under the 25th-percentile score (wcpm < p25) · ABOVE = over the 75th
 * (wcpm > p75) · ON between (the norms' own guidance: a student more
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

/** Riyadh = UTC+3 (the server runs in UTC) */
const RIYADH_MS = 3 * 3_600_000;
const riyadhMonth = (d: Date) => new Date(d.getTime() + RIYADH_MS).getUTCMonth() + 1;
/** r4: the season of a date, in Riyadh time: Sep–Nov FALL · Dec–Mar WINTER · Apr–Aug SPRING. */
export function fluencySeason(d: Date = new Date()): Season {
  const m = riyadhMonth(d);
  return m >= 9 && m <= 11 ? "FALL" : m === 12 || m <= 3 ? "WINTER" : "SPRING";
}
/** r4: the season of a check's date (stored season first when it is valid). */
export const seasonOf = (date: Date | string | null | undefined, stored?: unknown): Season =>
  isSeason(stored) ? stored : fluencySeason(date ? new Date(date) : new Date());

// 🐛 fix (audit finding, Oct 2026): this used to clamp every grade into 4–6 before the lookup, so a Grade 7–12
// student's percentile, band and `needsFluencyWork` flag — which feed RTI tier decisions — were silently computed
// against the GRADE 6 norm row (and a Grade 1–3 student against Grade 4's). Hasbrouck & Tindal's published norms
// only cover grades 4–6 here (HT_2017 above), so a grade outside that range now correctly gets no norm row at all
// (null) rather than a borrowed, wrong one — every caller below already treats a missing row as "no data" rather
// than a false reading, and `needsFluencyWork`/tier logic already skip a student with no usable fluency evidence.
const gradeRow = (grade: number, season: Season): Row | null => HT_2017[season][Math.round(grade)] ?? null;

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

/** BELOW / ON / ABOVE (r4: the one rule — wcpm < p25 BELOW · wcpm > p75 ABOVE; the same as normView / fluencyLevel). */
export function fluencyBand(grade: number, wcpm: number, season: Season = fluencySeason()): "BELOW" | "ON" | "ABOVE" | null {
  const e = bandEdges(grade, season);
  if (!e || !Number.isFinite(wcpm)) return null;
  return wcpm < e.below ? "BELOW" : wcpm > e.above ? "ABOVE" : "ON";
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
  if (s === "SPRING") {
    // r4: from spring the next goal is the NEXT grade's fall 50th percentile (the student moves up a grade);
    // Grade 6 (no Grade 7 norm): the Grade 6 spring 50th percentile stays the goal
    if (norm50(grade, "SPRING") === null) return null;   // a grade without norms gets no target
    const up = norm50(grade + 1, "FALL");
    const target = up ?? norm50(grade, "SPRING");
    if (target === null) return null;
    const y = new Date(now.getTime() + RIYADH_MS).getUTCFullYear();
    const end = up !== null ? new Date(Date.UTC(y, 10, 15)) : new Date(Date.UTC(y, 5, 15));
    const weeks = Math.max(2, Math.round((end.getTime() - now.getTime()) / (7 * 86_400_000)));
    return { target, weeks, perWeek: Math.max(0.5, Math.round(((target - wcpm) / weeks) * 10) / 10) };
  }
  // 🐛 r91 fix ("هدف الأسبوع غلط من أبريل لحد يوليو"): was `s === "FALL" ? "WINTER" : "SPRING"`, so a SPRING score
  // computed its target against SPRING's own 50th percentile again instead of the NEXT school year's FALL — use the
  // single shared nextSeason() helper (already correct and already used by remedial.ts) instead of a second copy.
  const next: Season = nextSeason(s);
  const target = norm50(grade, next);
  if (target === null) return null;
  const r = new Date(now.getTime() + RIYADH_MS), y = r.getUTCFullYear(), m = r.getUTCMonth() + 1;
  // next is WINTER (from fall, Sep–Nov) or SPRING (from winter, Dec–Mar); spring is handled above
  const end = next === "WINTER" ? new Date(Date.UTC(y + 1, 0, 15)) : new Date(Date.UTC(m >= 9 ? y + 1 : y, 4, 15));
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
  // 🐛 fix (audit finding, Oct 2026): was clamped into 4–6 — a Grade 11 student's own number got replaced by a
  // fake "Grade 6", so the text/percentile looked precise while actually comparing the wrong grade. Now the real
  // grade is kept; `p`/`e` below are null outside 4–6 (see gradeRow), and both branches below already handle that.
  const g = Math.round(grade);
  const p = wcpmPercentile(g, wcpm, season);
  const e = bandEdges(g, season);
  const band = e ? (wcpm < e.below ? "BELOW" : wcpm > e.above ? "ABOVE" : "ON") : null;
  const text = p === null ? `${wcpm} WCPM` : `${wcpm} WCPM = ${ordinal(p)} percentile (${SEASON_NAME[season]}, Grade ${g})`;
  // for students: simple words (out of every 100 readers)
  const kid = p === null ? `You read ${wcpm} words correctly in one minute.`
    : `You read ${wcpm} words correctly in one minute. That is faster than about ${p} of every 100 Grade ${g} readers in the ${SEASON_NAME[season]}.`;
  return { wcpm, grade: g, season, percentile: p, band, p50: e?.p50 ?? null, needsWork: needsFluencyWork(g, wcpm, season), text, kid };
}

/** The next season (spring → the next school year's fall, for the same grade's norms). */
export const nextSeason = (s: Season): Season => (s === "FALL" ? "WINTER" : s === "WINTER" ? "SPRING" : "FALL");

/**
 * r4: the next season's goal (the 50th percentile): fall → winter, winter → spring, spring → the NEXT grade's fall
 * (Grade 6, no Grade 7 norm: its own spring 50th percentile).
 */
export function nextSeasonTarget(grade: number, season: Season): { target: number | null; season: Season } {
  if (season === "SPRING") {
    if (norm50(grade, "SPRING") === null) return { target: null, season: "FALL" };
    const up = norm50(grade + 1, "FALL");
    return up !== null ? { target: up, season: "FALL" } : { target: norm50(grade, "SPRING"), season: "SPRING" };
  }
  const n = nextSeason(season);
  return { target: norm50(grade, n), season: n };
}

/** The goal for next week: current WCPM + the weekly growth needed to reach the next season's 50th percentile. */
export function weeklyGoal(grade: number, wcpm: number, now: Date = new Date()): { nextGoal: number; perWeek: number; target: number; weeks: number; season: Season; reached: boolean } | null {
  const g = weeklyGrowthTarget(grade, wcpm, now);
  if (!g) return null;
  // 🐛 r91 fix: same duplicated-logic bug as weeklyGrowthTarget above. r4: from spring the goal is next fall's (the
  // next grade's); Grade 6 in spring keeps its own spring 50th percentile (season SPRING)
  const now0 = fluencySeason(now);
  const season: Season = now0 === "SPRING" && norm50(grade + 1, "FALL") === null ? "SPRING" : nextSeason(now0);
  const reached = wcpm >= g.target;
  return { nextGoal: reached ? wcpm + 2 : Math.min(g.target, wcpm + Math.max(1, Math.ceil(g.perWeek))), perWeek: reached ? 0 : g.perWeek, target: g.target, weeks: g.weeks, season, reached };
}

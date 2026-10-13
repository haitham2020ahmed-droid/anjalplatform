/**
 * 📐 The statistics teachers use in their own analysis workbooks, computed the same way here:
 *   - mean and standard deviation (Excel STDEV.S) — how spread out the class is
 *   - percentile rank (Excel PERCENTRANK.INC) — where a student stands in the group
 *   - consistency — a student's own standard deviation across checks (steady or up-and-down)
 *   - trend — the slope across checks (improving, declining, stable)
 *   - change between two periods — marks and %, Improved / Declined / Maintained
 *   - distribution — how many are Above / On / Below, and the share of each
 */
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (x: number) => Math.round(x * 10) / 10;

/** Sample standard deviation (Excel STDEV.S); null under 2 values. */
export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return r1(Math.sqrt(xs.reduce((t, x) => t + (x - m) ** 2, 0) / (xs.length - 1)));
}

/** Excel PERCENTRANK.INC(values, x) × 100: the share of the other values below x (ties counted below none). */
export function percentRank(values: number[], x: number): number | null {
  const v = [...values].sort((a, b) => a - b);
  if (v.length < 2) return null;
  if (x <= v[0]) return 0;
  if (x >= v[v.length - 1]) return 100;
  const below = v.filter((y) => y < x).length;
  if (v.includes(x)) return Math.round((100 * below) / (v.length - 1));
  // between two values: interpolate as Excel does
  const hi = v.findIndex((y) => y > x), lo = hi - 1;
  return Math.round(100 * ((lo + (x - v[lo]) / (v[hi] - v[lo])) / (v.length - 1)));
}

/** How spread out a group is, in words a teacher can act on (scale = the score's maximum, e.g. 100). */
export function spreadNote(sd: number | null, scale = 100): string {
  if (sd === null) return "Not enough results yet.";
  const r = sd / scale;
  return r < 0.1 ? "Close together: whole-class teaching fits most students." : r < 0.18 ? "Moderately spread: plan two groups (support and extension)." : "Very spread out: teach in three level groups (Approaching · Meeting · Exceeding).";
}

export type Trend = "UP" | "DOWN" | "FLAT";
/** The least-squares slope across the checks, per check; UP / DOWN beyond ±`flat` per check. */
export function trendOf(xs: (number | null)[], flat = 2): { trend: Trend; slope: number } | null {
  const pts = xs.map((y, i) => [i, y] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 3) return null;
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  const num = pts.reduce((t, [x, y]) => t + (x - mx) * (y - my), 0), den = pts.reduce((t, [x]) => t + (x - mx) ** 2, 0);
  const slope = den ? num / den : 0;
  return { trend: slope > flat ? "UP" : slope < -flat ? "DOWN" : "FLAT", slope: r1(slope) };
}

/** A student's consistency across checks: their own standard deviation; “Uneven” beyond `limit` (e.g. 15 points of 100). */
export function consistencyOf(xs: (number | null)[], limit = 15): { sd: number; label: "Steady" | "Uneven" } | null {
  const v = xs.filter((x): x is number => x !== null);
  const sd = stdev(v);
  return sd === null || v.length < 3 ? null : { sd, label: sd > limit ? "Uneven" : "Steady" };
}

/** Change between two periods (the workbooks' “Change (Marks)”, “Change (%)” and “Progress Status”). */
export function changeOf(from: number | null, to: number | null, same = 0.5): { from: number; to: number; diff: number; pct: number | null; label: "Improved" | "Declined" | "Maintained" } | null {
  if (from === null || to === null) return null;
  const diff = r1(to - from);
  return { from, to, diff, pct: from ? r1((100 * (to - from)) / from) : null, label: diff > same ? "Improved" : diff < -same ? "Declined" : "Maintained" };
}

/** Counts and shares of each level (the workbooks' “Performance Level Distribution”). */
export function distribution<L extends string>(levels: L[], keys: readonly L[]): { level: L; count: number; pct: number }[] {
  return keys.map((k) => { const count = levels.filter((x) => x === k).length; return { level: k, count, pct: levels.length ? Math.round((100 * count) / levels.length) : 0 }; });
}

/** The strongest and weakest of several areas (MAX / MIN). */
export function extremes<T extends { value: number | null }>(areas: T[]): { best: T | null; weakest: T | null } {
  const v = areas.filter((a) => a.value !== null);
  if (!v.length) return { best: null, weakest: null };
  const s = [...v].sort((a, b) => a.value! - b.value!);
  return { best: s[s.length - 1], weakest: s[0] };
}

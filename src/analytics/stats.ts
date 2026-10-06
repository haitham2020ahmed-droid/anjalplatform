/** Small, dependency-free statistics used by every analytics level. */

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Percentile by linear interpolation (p in 0..100). */
export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (p / 100) * (s.length - 1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}

/** Counts per mastery band (0–39, 40–59, 60–74, 75–89, 90–100). */
export function bandDistribution(scores: number[]): { label: string; count: number }[] {
  const bands = [
    { label: "Beginning", lo: 0, hi: 40 },
    { label: "Developing", lo: 40, hi: 60 },
    { label: "Approaching", lo: 60, hi: 75 },
    { label: "Proficient", lo: 75, hi: 90 },
    { label: "Mastered", lo: 90, hi: 101 },
  ];
  return bands.map((b) => ({ label: b.label, count: scores.filter((s) => s >= b.lo && s < b.hi).length }));
}

export const round1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

export interface Summary {
  n: number;
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
}

export function summarize(xs: number[]): Summary {
  return { n: xs.length, mean: round1(mean(xs)), median: round1(median(xs)), p25: round1(percentile(xs, 25)), p75: round1(percentile(xs, 75)) };
}

/** Longest run of `value` in a sequence, and the current (trailing) run. */
export function streaks(seq: boolean[], value: boolean): { longest: number; current: number } {
  let longest = 0, run = 0;
  for (const v of seq) {
    run = v === value ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let current = 0;
  for (let i = seq.length - 1; i >= 0 && seq[i] === value; i--) current++;
  return { longest, current };
}

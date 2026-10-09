/**
 * National averages for the report charts, for any grade a student was in (a Grade 4 student's Fall of last year
 * was Grade 3). Reading Grades 4–6 come from the database (NWEA 2025 norms, editable by admins); the other grades
 * and Language Usage are close approximations (Language: NWEA's Fall grade-level means, the same within-year
 * growth as Reading) — reports mark every value estimated from them with “≈”.
 */
import type { Repo } from "../seeding/repo";
import type { Season } from "./rit";
import { ensureNationalNorms, nationalNorm } from "./rit";

type Row3 = Record<Season, number>;
const READING_FALLBACK: Record<number, Row3> = {
  2: { FALL: 174, WINTER: 181, SPRING: 185 },
  3: { FALL: 187, WINTER: 192, SPRING: 195 },
  4: { FALL: 196, WINTER: 199, SPRING: 202 },
  5: { FALL: 204, WINTER: 206, SPRING: 208 },
  6: { FALL: 209, WINTER: 211, SPRING: 212 },
  7: { FALL: 213, WINTER: 214, SPRING: 215 },
  8: { FALL: 216, WINTER: 217, SPRING: 218 },
};
const LANGUAGE_FALL: Record<number, number> = { 2: 176, 3: 187, 4: 194.7, 5: 201.9, 6: 206.5, 7: 210, 8: 213 };
export const GROWTH_SD = { withinYear: 8, fallToFall: 9 };
export const ACHIEVEMENT_SD = 17;

export interface NormPoint { mean: number; sd: number; exact: boolean }

/** Mean (and SD) RIT of the grade in that season; `exact` = from the database (Reading Grades 4–6). */
export async function normFor(repo: Repo, subject: "READING" | "LANGUAGE", grade: number, season: Season): Promise<NormPoint | null> {
  const g = Math.max(2, Math.min(8, grade));
  if (subject === "READING") {
    await ensureNationalNorms(repo);
    const n = grade >= 4 && grade <= 6 ? await nationalNorm(repo, grade, season) : null;
    if (n) return { mean: n.mean, sd: n.sd, exact: true };
    const f = READING_FALLBACK[g];
    return f ? { mean: f[season], sd: ACHIEVEMENT_SD, exact: false } : null;
  }
  const fall = LANGUAGE_FALL[g], r = READING_FALLBACK[g];
  if (fall === undefined || !r) return null;
  return { mean: Math.round((fall + (r[season] - r.FALL)) * 10) / 10, sd: ACHIEVEMENT_SD - 1, exact: false };
}

/** Percentile from a z-score (logistic approximation of the normal curve, as elsewhere on the platform). */
export const pctOfZ = (z: number) => Math.max(1, Math.min(99, Math.round(100 / (1 + Math.exp(-1.702 * z)))));

/**
 * National MAP Growth Reading norms (mean RIT and standard deviation by grade and season).
 * Source: NWEA, “2025 Norms quick reference” (MAP Growth),
 * https://www.nwea.org/resource-center/fact-sheet/87992/MAP-Growth-2025-norms-quick-reference_NWEA_onesheet.pdf/
 * Put in the database (BenchmarkReference) the first time; admins can update them on the MAP RIT page.
 * Kept in code (not a data file) so the deployed server always has them.
 */
export const NATIONAL_NORMS_SOURCE = "NWEA 2025 MAP Growth Reading student achievement norms (nwea.org, 2025 Norms quick reference)";
export const NATIONAL_READING_NORMS: Record<number, Record<"FALL" | "WINTER" | "SPRING", { mean: number; sd: number }>> = {
  4: { FALL: { mean: 196, sd: 18 }, WINTER: { mean: 199, sd: 18 }, SPRING: { mean: 202, sd: 18 } },
  5: { FALL: { mean: 204, sd: 17 }, WINTER: { mean: 206, sd: 17 }, SPRING: { mean: 208, sd: 17 } },
  6: { FALL: { mean: 209, sd: 17 }, WINTER: { mean: 211, sd: 17 }, SPRING: { mean: 212, sd: 17 } },
};

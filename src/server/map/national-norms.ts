/**
 * National MAP Growth Reading norms (mean RIT and standard deviation by grade and season).
 * Source: NWEA, “2025 Norms quick reference” (MAP Growth),
 * https://www.nwea.org/resource-center/fact-sheet/87992/MAP-Growth-2025-norms-quick-reference_NWEA_onesheet.pdf/
 * Put in the database (BenchmarkReference) the first time; admins can update them on the MAP RIT page.
 * Kept in code (not a data file) so the deployed server always has them.
 *
 * 🐛 fix (audit finding, Oct 2026 — "كل الطلاب on غلط لصفوف غير 4-6"): this table used to cover only grades 4-6
 * (the grades the platform originally shipped for). A school with classes outside that range (Grade 11 here) got
 * NO national norm at all for those students — nationalNorm() in rit.ts returns null, and bandOf() in
 * personal-plan.ts then silently defaulted EVERY such student to "ON level" instead of a real comparison. Filled in
 * every other grade from the SAME NWEA source document (Reading: K-12, Language Usage: Grades 2-11 — NWEA's own
 * table has no Language Usage row for K, 1 or 12), cross-checked against the grades 4-6 already here (same numbers).
 * An admin can still override any of these, or add a grade NWEA's own table doesn't cover, from the MAP RIT page.
 */
export const NATIONAL_NORMS_SOURCE = "NWEA 2025 MAP Growth Reading student achievement norms (nwea.org, 2025 Norms quick reference)";
export const NATIONAL_READING_NORMS: Record<number, Record<"FALL" | "WINTER" | "SPRING", { mean: number; sd: number }>> = {
  0: { FALL: { mean: 138, sd: 9 }, WINTER: { mean: 146, sd: 11 }, SPRING: { mean: 152, sd: 13 } },
  1: { FALL: { mean: 155, sd: 13 }, WINTER: { mean: 163, sd: 14 }, SPRING: { mean: 168, sd: 16 } },
  2: { FALL: { mean: 170, sd: 17 }, WINTER: { mean: 177, sd: 17 }, SPRING: { mean: 182, sd: 17 } },
  3: { FALL: { mean: 185, sd: 18 }, WINTER: { mean: 190, sd: 18 }, SPRING: { mean: 194, sd: 18 } },
  4: { FALL: { mean: 196, sd: 18 }, WINTER: { mean: 199, sd: 18 }, SPRING: { mean: 202, sd: 18 } },
  5: { FALL: { mean: 204, sd: 17 }, WINTER: { mean: 206, sd: 17 }, SPRING: { mean: 208, sd: 17 } },
  6: { FALL: { mean: 209, sd: 17 }, WINTER: { mean: 211, sd: 17 }, SPRING: { mean: 212, sd: 17 } },
  7: { FALL: { mean: 212, sd: 17 }, WINTER: { mean: 214, sd: 17 }, SPRING: { mean: 215, sd: 17 } },
  8: { FALL: { mean: 216, sd: 17 }, WINTER: { mean: 217, sd: 17 }, SPRING: { mean: 218, sd: 17 } },
  9: { FALL: { mean: 216, sd: 18 }, WINTER: { mean: 217, sd: 18 }, SPRING: { mean: 217, sd: 18 } },
  10: { FALL: { mean: 218, sd: 18 }, WINTER: { mean: 218, sd: 18 }, SPRING: { mean: 218, sd: 18 } },
  11: { FALL: { mean: 218, sd: 18 }, WINTER: { mean: 218, sd: 18 }, SPRING: { mean: 218, sd: 19 } },
  12: { FALL: { mean: 218, sd: 19 }, WINTER: { mean: 217, sd: 19 }, SPRING: { mean: 216, sd: 19 } },
};
/** 🐛 r91 fix ("Language Usage بيتقاس بمعايير Reading بالغلط"): the same NWEA source's Language Usage table — was
 * missing entirely, so every page computing a Language Usage percentile/band fell back to the Reading norms above.
 * NWEA's own document has no Language Usage norms for Kindergarten, Grade 1 or Grade 12 — those are genuinely
 * absent from the source, not a gap on our side. */
export const NATIONAL_LANGUAGE_NORMS: Record<number, Record<"FALL" | "WINTER" | "SPRING", { mean: number; sd: number }>> = {
  2: { FALL: { mean: 170, sd: 17 }, WINTER: { mean: 178, sd: 16 }, SPRING: { mean: 183, sd: 17 } },
  3: { FALL: { mean: 184, sd: 17 }, WINTER: { mean: 190, sd: 17 }, SPRING: { mean: 193, sd: 17 } },
  4: { FALL: { mean: 195, sd: 17 }, WINTER: { mean: 198, sd: 16 }, SPRING: { mean: 201, sd: 16 } },
  5: { FALL: { mean: 202, sd: 16 }, WINTER: { mean: 205, sd: 16 }, SPRING: { mean: 207, sd: 16 } },
  6: { FALL: { mean: 206, sd: 16 }, WINTER: { mean: 209, sd: 16 }, SPRING: { mean: 210, sd: 16 } },
  7: { FALL: { mean: 210, sd: 16 }, WINTER: { mean: 212, sd: 16 }, SPRING: { mean: 213, sd: 16 } },
  8: { FALL: { mean: 214, sd: 16 }, WINTER: { mean: 215, sd: 16 }, SPRING: { mean: 217, sd: 16 } },
  9: { FALL: { mean: 214, sd: 17 }, WINTER: { mean: 215, sd: 17 }, SPRING: { mean: 216, sd: 17 } },
  10: { FALL: { mean: 216, sd: 17 }, WINTER: { mean: 217, sd: 17 }, SPRING: { mean: 217, sd: 17 } },
  11: { FALL: { mean: 218, sd: 17 }, WINTER: { mean: 218, sd: 17 }, SPRING: { mean: 218, sd: 18 } },
};

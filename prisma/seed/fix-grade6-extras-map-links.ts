/**
 * `npx tsx prisma/seed/fix-grade6-extras-map-links.ts -- --school=ALANJAL` (or `npm run db:seed -- …` if wired up)
 *
 * 🩹 One-off repair (Oct 2026 stability/stability audit follow-up): the `gradeSixExtras` pack created and
 * published 100 questions each for "Analyzing Figurative, Connotative, and Technical Language" (Mother to
 * Son) and "Analyzing Informational Text Elements" (Shakespeare in Harlem) but never placed them on the
 * Curriculum Map, so the Skill-plan page showed both lessons' "Analyze Craft and Structure" as "Not ready"
 * even though every question exists and is published. This links them retroactively.
 *
 * Changes NO schema, deletes nothing, never touches a question that is already linked — safe to run again
 * (re-running reports "already linked" for everything it did last time and links nothing new).
 */
import { runSeed } from "./run";
import { linkGradeSixExtrasToMap } from "../../src/server/curriculum-map/fix-grade6-extras";

const school = process.argv.find((a) => a.startsWith("--school="))?.split("=")[1] ?? "ALANJAL";

void runSeed("Grade 6 extras → Curriculum Map link repair", 200, async (repo) => {
  const row = await repo.findUnique("School", { code: school });
  if (!row) return { school, error: `No school with code "${school}" was found.` };
  const results = await linkGradeSixExtrasToMap(repo, String(row.id));
  return { school, results };
});

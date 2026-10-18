/**
 * 🗺️ The live, on-page "skill plan" view of the Curriculum Map (owner: "I want a page like the reference screenshot
 * — a unit sidebar, weeks + essential question, skills grouped and numbered by category, a star that shows Assign").
 *
 * Reuses the EXACT same data the printable map PDF is built from (curriculumMapPdfData / MAP_CATEGORY_GROUPS /
 * essentialQuestion in map-pdf.ts) — same units, same per-Text-Set skill groups, same ordering — so the on-page view
 * and the printed one never drift apart. This file only re-exports that data under the "skill plan" name used by the
 * new UI, with the grade read-permission check the live page needs (the PDF route checks this itself separately).
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { curriculumMapPdfData, type MapPdfData } from "./map-pdf";

export type { MapPdfData, MapPdfUnit, MapPdfSection, MapPdfSkill } from "./map-pdf";
export { MAP_CATEGORY_GROUPS, sectionLabel } from "./map-pdf";

/** The grade's Curriculum Map, grouped and ordered exactly as the printable map — for the live skill-plan page. */
export async function skillPlanData(repo: Repo, actor: Actor, grade: number): Promise<MapPdfData | null> {
  assertCan(actor, "curriculum:read");
  if (!actor.schoolId) return null;
  return curriculumMapPdfData(repo, actor.schoolId, grade);
}

/**
 * 🗺️ The live, on-page "skill plan" view of the Curriculum Map (owner: "I want a page like the reference screenshot
 * — a unit sidebar, weeks + essential question, skills grouped and numbered by category, a star that shows Assign").
 *
 * Reuses the EXACT same data the printable map PDF is built from (curriculumMapPdfData / MAP_CATEGORY_GROUPS /
 * essentialQuestion in map-pdf.ts) — same units, same per-Text-Set skill groups, same ordering — so the on-page view
 * and the printed one never drift apart. This file only re-exports that data under the "skill plan" name used by the
 * new UI, with the grade read-permission check the live page needs (the PDF route checks this itself separately).
 *
 * 🔗 r86 (owner: "فين concept vocabulary مش موجوده في skill plan... حولها زي الـ Lessons تاب بالظبط، بنفس ربط
 * الأسئلة، مع الإبقاء على دروس الجرامر"): Concept Vocabulary and Analyze Craft and Structure used to come ONLY from
 * the platform's own Skill/LessonSkill rows — real for Grades 4–5 (built from named skills), but Grade 6's Concept
 * Vocabulary has no such Skill at all (its booklets give raw words, not a named skill), so that category simply
 * never showed up there. The Lessons tab never had this gap: it reads straight from CurriculumMapNode (the school's
 * map, as written) and assigns a selection's Concept Vocabulary / Analyze Craft and Structure / Review from THAT —
 * the exact same place a teacher already uses from Lessons, already linked to real questions. `lessonSectionsByLesson`
 * / `withLessonSections` (both now in map-pdf.ts, shared with this file's own PDF export) read the SAME data
 * `curriculumLessons` (Lessons tab) is built from, so Skill plan can show those three categories exactly as Lessons
 * does — same titles, same Ready/Not ready, same ⭐ Assign. Grammar and punctuation (and Writing, Spelling & word
 * study) are NOT covered by the Curriculum Map's categories at all, so they keep coming from the platform's own
 * Skill rows, unchanged (see MAP_CATEGORY_GROUPS / groupOfCategory in map-pdf.ts).
 * (Respond to Reading is left out here too: it has its own separate Below/On/Above assign flow, not this one.)
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { curriculumMapPdfData, lessonSectionsByLesson, withLessonSections, type MapPdfData, type MapPdfLessonSection } from "./map-pdf";

export type { MapPdfData, MapPdfUnit, MapPdfSection, MapPdfSkill, MapPdfLessonSection } from "./map-pdf";
export { MAP_CATEGORY_GROUPS, sectionLabel } from "./map-pdf";

/** The grade's Curriculum Map, grouped and ordered exactly as the printable map, with `lessonSections` (Concept
 * Vocabulary / Analyze Craft and Structure / Review, read from the Lessons tab's own data) filled in — for the
 * live skill-plan page. */
export async function skillPlanData(repo: Repo, actor: Actor, grade: number): Promise<MapPdfData | null> {
  assertCan(actor, "curriculum:read");
  if (!actor.schoolId) return null;
  const [base, lessonSections] = await Promise.all([
    curriculumMapPdfData(repo, actor.schoolId, grade),
    lessonSectionsByLesson(repo, actor, grade).catch(() => new Map<string, MapPdfLessonSection[]>()),
  ]);
  if (!base) return null;
  return withLessonSections(base, lessonSections);
}

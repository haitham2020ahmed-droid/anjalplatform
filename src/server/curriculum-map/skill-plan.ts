/**
 * 🗺️ The live, on-page "skill plan" view of the Curriculum Map (owner: "I want a page like the reference screenshot
 * — a unit sidebar, weeks + essential question, skills grouped and numbered by category, a star that shows Assign").
 *
 * Reuses the EXACT same data the printable map PDF is built from (curriculumMapPdfData / MAP_CATEGORY_GROUPS /
 * essentialQuestion in map-pdf.ts) — same units, same per-Text-Set skill groups, same ordering — so the on-page view
 * and the printed one never drift apart. This file only re-exports that data under the "skill plan" name used by the
 * new UI, with the grade read-permission check the live page needs (the PDF route checks this itself separately).
 *
 * 🔗 r85 (owner: "the Lessons tab shows every selection and skill the school's own Curriculum Map names — even
 * before it has questions on the platform — so Skill plan should show exactly the same set, not a shorter one"):
 * the Lessons tab reads straight from CurriculumMapNode (the school's map, as written — curriculumMapView), while
 * Skill plan used to read ONLY the platform's own Skill/LessonSkill rows, so a selection the school added to the
 * map before anyone built its questions showed "No platform skills linked yet." even though the Lessons tab named
 * its skills plainly. Fixed by reading BOTH and merging: every skill name the map names for a selection's Concept
 * Vocabulary / Analyze Craft and Structure categories that has no matching platform Skill yet is still shown, as
 * plain text under "In the lesson plan, not yet on the platform" (MapPdfSection.pending) — same name the Lessons
 * tab uses, just not clickable or ⭐-assignable until a teacher/admin actually links or writes it.
 * (Respond to Reading / Unit writing is left out of `pending`: its platform skill is shared across a whole unit,
 * not one selection, so "declared here vs. linked here" is not a meaningful comparison per selection.)
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { curriculumMapPdfData, type MapPdfData } from "./map-pdf";
import { curriculumMapView } from "./view";
import { lessonDetail } from "./lesson-details";

export type { MapPdfData, MapPdfUnit, MapPdfSection, MapPdfSkill } from "./map-pdf";
export { MAP_CATEGORY_GROUPS, sectionLabel } from "./map-pdf";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
/** "Reread / Diagrams and Headings \ Compare and Contrast" → ["Reread", "Diagrams and Headings", "Compare and Contrast"] */
const splitSkillNames = (text: string | null | undefined): string[] => s(text).split(/\s*[\\/]\s*/).map((x) => x.trim()).filter(Boolean);

/** Skill names the Curriculum Map itself names (Concept Vocabulary + Analyze Craft and Structure only — see the
 * header note on Respond to Reading), keyed `${unitNumber}|${selectionNumber}`. Empty when this grade has no map. */
async function declaredSkillsByLesson(repo: Repo, actor: Actor, grade: number): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const v = await curriculumMapView(repo, actor, grade);
  if (v.level !== grade || !v.book) return out; // not this grade's own map (e.g. the actor has no map for it at all)
  for (const u of v.book.children) {
    const um = /^G\d+\.U(\d+)$/.exec(u.code);
    if (!um) continue;
    for (const ts of u.children) {
      // Text Set (Grades 4–5: "TS{n}") or Selection (Grade 6 / StudySync: "SEL{n}") — both are numbered the same
      // way as the matching Lesson.number, just named differently per book (see seed.ts expectedNodes)
      const tm = /^G\d+\.U\d+\.(?:TS|SEL)(\d+)$/.exec(ts.code);
      if (!tm) continue;
      const names: string[] = [];
      for (const cat of ts.children) {
        if (cat.categoryType === "RESPOND_TO_READING") continue;
        for (const n of splitSkillNames(cat.skills)) if (!names.includes(n)) names.push(n);
      }
      // r## fix (owner: "the Lessons tab shows skill names here, Skill plan says 'not linked yet'"): the Lessons
      // tab's vocabulary and reading-skill names can come from the school's own curated lesson-details.json
      // (unitCards/LessonCard, lesson-details.ts) — vocabulary has NO other source at all, and reading skills
      // fall back to it whenever the map node's own `skills` text is empty. declaredSkillsByLesson only read the
      // map node directly, so a selection with curated names but an empty map node showed as "not linked" here
      // even though Lessons named it plainly. Merge the same curated names in, same lookup unitCards uses.
      const d = lessonDetail(grade, ts.sharedRead) ?? lessonDetail(grade, ts.title);
      for (const n of [...(d?.vocabulary ?? []), ...(d?.readingSkills ?? [])]) if (!names.includes(n)) names.push(n);
      if (names.length) out.set(`${um[1]}|${tm[1]}`, names);
    }
  }
  return out;
}

/** The grade's Curriculum Map, grouped and ordered exactly as the printable map, with `pending` filled in — for the live skill-plan page. */
export async function skillPlanData(repo: Repo, actor: Actor, grade: number): Promise<MapPdfData | null> {
  assertCan(actor, "curriculum:read");
  if (!actor.schoolId) return null;
  const [base, declared] = await Promise.all([
    curriculumMapPdfData(repo, actor.schoolId, grade),
    declaredSkillsByLesson(repo, actor, grade).catch(() => new Map<string, string[]>()),
  ]);
  if (!base) return null;
  if (!declared.size) return base;
  return {
    ...base,
    units: base.units.map((u) => ({
      ...u,
      sections: u.sections.map((sec) => {
        const names = declared.get(`${u.number}|${sec.number}`);
        if (!names) return sec;
        const linked = new Set(sec.skills.map((k) => k.name.trim().toLowerCase()));
        const pending = names.filter((n) => !linked.has(n.toLowerCase()));
        return pending.length ? { ...sec, pending } : sec;
      }),
    })),
  };
}

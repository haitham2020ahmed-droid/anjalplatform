import { getActor, repo, requireActor } from "@/server/auth/next";
import { curriculumMapPdfData, lessonSectionsByLesson } from "@/server/curriculum-map/map-pdf";

export const metadata = { title: "Debug: Skill Plan" };

/**
 * 🩺 TEMPORARY diagnostic page (Oct 2026) — added to find out live, exactly as the real Skill Plan page would see
 * it, why "Mother to Son" (Grade 6, Unit 2) isn't appearing. SUPER_ADMIN only, read-only, no schema/data changes.
 * Delete this file once the Mother to Son issue is understood and fixed.
 */
export default async function DebugSkillPlan({ searchParams }: { searchParams: Promise<{ grade?: string }> }) {
  const actor = await requireActor({ roles: ["SUPER_ADMIN"], permission: "curriculum:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const grade = Number(sp.grade) || 6;

  const base = await curriculumMapPdfData(repo, actor.schoolId ?? "", grade);
  const overlay = await lessonSectionsByLesson(repo, actor, grade).catch((e) => ({ error: String(e) }));

  const unit2 = base?.units.find((u) => u.number === 2);
  const mts = unit2?.sections.find((s) => /mother to son/i.test(s.title ?? "") || s.number === 4);

  return (
    <pre style={{ whiteSpace: "pre-wrap", padding: 20, fontSize: 12, direction: "ltr" }}>
      {JSON.stringify(
        {
          actor: { schoolId: actor.schoolId, role: actor.role, email: me.email },
          grade,
          baseFound: Boolean(base),
          unit2Found: Boolean(unit2),
          unit2SectionCount: unit2?.sections.length,
          unit2SectionNumbers: unit2?.sections.map((s) => ({ number: s.number, title: s.title, skillsCount: s.skills.length })),
          mtsRawSection: mts ?? null,
          overlay,
        },
        null,
        2,
      )}
    </pre>
  );
}

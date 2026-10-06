import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { UnitSkills } from "@/components/curriculum/unit-skills";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getStudentCurriculum, getUnitSkillCards } from "@/server/queries/student-curriculum";

/** Step 4–5: the skills of one unit as cards. The query refuses units outside the student's curriculum. */
export default async function UnitPage({ params }: { params: Promise<{ unitId: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const { unitId } = await params;
  const me = (await getActor())!.user;
  const curriculum = await getStudentCurriculum(repo, actor.studentId!);
  if (!curriculum.units.some((u) => u.unitId === unitId)) notFound();
  const { unit, cards } = await getUnitSkillCards(repo, actor.studentId!, unitId);
  return (
    <AppShell name={String(me.displayName)}>
      <UnitSkills unit={unit} cards={cards} grade={curriculum.grade} bookTitle={curriculum.bookTitle} />
    </AppShell>
  );
}

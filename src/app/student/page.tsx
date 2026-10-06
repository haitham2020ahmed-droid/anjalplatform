import { AppShell } from "@/components/app-shell";
import { UnitList } from "@/components/curriculum/unit-list";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getStudentCurriculum } from "@/server/queries/student-curriculum";
import { latestDiagnostic } from "@/server/assessment/diagnostic";

/** Step 1–3 of the learning flow: the student's grade, book and units. */
export default async function StudentHome() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const curriculum = await getStudentCurriculum(repo, actor.studentId!);
  const needsPlacement = !(await latestDiagnostic(repo, actor.studentId!));
  return (
    <AppShell name={String(me.displayName)}>
      <UnitList curriculum={curriculum} firstName={String(me.displayName).split(" ")[0]} needsPlacement={needsPlacement} />
    </AppShell>
  );
}

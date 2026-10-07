import { AppShell } from "@/components/app-shell";
import { AssignedSkills } from "@/components/student/assigned-skills";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { latestDiagnostic } from "@/server/assessment/diagnostic";
import { assignedSkills, placementRequired } from "@/server/student/assigned";

/** Student home: only the skills the teacher assigned (no full curriculum). */
export default async function StudentHome() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [view, required, diagnostic] = await Promise.all([assignedSkills(repo, actor), placementRequired(repo, actor.schoolId!), latestDiagnostic(repo, actor.studentId!)]);
  return (
    <AppShell name={String(me.displayName)}>
      <AssignedSkills view={view} firstName={String(me.displayName).split(" ")[0]} placement={required && !diagnostic} />
    </AppShell>
  );
}

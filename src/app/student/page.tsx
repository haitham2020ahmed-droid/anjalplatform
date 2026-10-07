import { AppShell } from "@/components/app-shell";
import { AssignedSkills, type StudentExtras } from "@/components/student/assigned-skills";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { latestDiagnostic } from "@/server/assessment/diagnostic";
import { assignedSkills, placementRequired } from "@/server/student/assigned";
import { readingLexile } from "@/server/readmaster/service";
import { lexileBands, levelForLexile } from "@/server/curriculum-map/lexile";

/** Student home: welcome card (Lexile, RIT), the three big areas, and only the work the teacher assigned. */
export default async function StudentHome({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const sp = await searchParams;
  const area = sp.area === "map" ? "MAP" : sp.area === "curriculum" ? "CURRICULUM" : "ALL";
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [view, required, diagnostic, lexile, maps, student] = await Promise.all([
    assignedSkills(repo, actor), placementRequired(repo, actor.schoolId!), latestDiagnostic(repo, actor.studentId!),
    readingLexile(repo, actor.studentId!), repo.findMany("MapResult", { studentId: actor.studentId! }), repo.findUnique("Student", { id: actor.studentId! }),
  ]);
  // latest overall Reading RIT and its Spring goal (Fall RIT + projected growth)
  const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : String(v)).getTime();
  const reading = maps.filter((m) => /read/i.test(String(m.subject)) && !m.goalName).sort((a, b) => t(b.testDate) - t(a.testDate));
  const withGoal = reading.find((m) => m.projectedGrowth !== null && m.projectedGrowth !== undefined);
  const grade = student?.gradeId ? Number((await repo.findUnique("Grade", { id: student.gradeId }))?.level ?? 0) : 0;
  const extras: StudentExtras = {
    lexile: lexile.lexile, readingLevel: levelForLexile((await lexileBands(repo, actor.schoolId ?? null))[grade], lexile.lexile),
    rit: reading[0] ? Number(reading[0].rit) : null, ritGoal: withGoal ? Number(withGoal.rit) + Number(withGoal.projectedGrowth) : null,
  };
  return (
    <AppShell name={String(me.displayName)}>
      <AssignedSkills view={view} firstName={String(me.displayName).split(" ")[0]} placement={required && !diagnostic} area={area} extras={extras} />
    </AppShell>
  );
}

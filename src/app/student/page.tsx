import { AppShell } from "@/components/app-shell";
import { AssignedSkills, type StudentExtras } from "@/components/student/assigned-skills";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { latestDiagnostic } from "@/server/assessment/diagnostic";
import { assignedSkills, placementRequired } from "@/server/student/assigned";
import { readingLexile } from "@/server/readmaster/service";
import { studentSkillPlans } from "@/server/curriculum-map/plans";
import { streakAndPoints } from "@/server/student/streak";
import { openGamesFor } from "@/server/game/live";
import { lexileBands, levelForLexile } from "@/server/curriculum-map/lexile";

export const metadata = { title: "My work" };

/** Student home: welcome card (Lexile, RIT), the three big areas, and only the work the teacher assigned. */
export default async function StudentHome({ searchParams }: { searchParams: Promise<{ area?: string }> }) {
  const sp = await searchParams;
  const area = sp.area === "map" ? "MAP" : sp.area === "curriculum" ? "CURRICULUM" : sp.area === "nafs" ? "NAFS" : sp.area === "grammar" ? "GRAMMAR" : "ALL";
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
  // the rest in parallel (not one after another)
  const [gradeRow, bands, plans, streak, games] = await Promise.all([
    student?.gradeId ? repo.findUnique("Grade", { id: student.gradeId }) : Promise.resolve(null),
    lexileBands(repo, actor.schoolId ?? null), studentSkillPlans(repo, actor), streakAndPoints(repo, actor.studentId!), openGamesFor(repo, actor),
  ]);
  const grade = Number(gradeRow?.level ?? 0);
  const extras: StudentExtras = {
    games,
    lexile: lexile.lexile, readingLevel: levelForLexile(bands[grade], lexile.lexile),
    rit: reading[0] ? Number(reading[0].rit) : null, ritGoal: withGoal ? Number(withGoal.rit) + Number(withGoal.projectedGrowth) : null,
    grade, plans: plans.length, ...streak,
  };
  return (
    <AppShell name={String(me.displayName)}>
      <AssignedSkills view={view} firstName={String(me.displayName).split(" ")[0]} placement={required && !diagnostic} area={area} extras={extras} />
    </AppShell>
  );
}

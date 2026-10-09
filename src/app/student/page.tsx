import { AppShell } from "@/components/app-shell";
import { AssignedSkills, type StudentExtras } from "@/components/student/assigned-skills";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { latestDiagnostic } from "@/server/assessment/diagnostic";
import { assignedSkills, placementRequired } from "@/server/student/assigned";
import { readingLexile } from "@/server/readmaster/service";
import { studentSkillPlans, todaysPlanStep } from "@/server/curriculum-map/plans";
import { reviewDue, weekStats } from "@/server/student/weekly";
import { TodayPlanCard } from "@/components/student/today-plan";
import { myDiagnostic } from "@/server/diagnostic/test";
import { weeklyCheck } from "@/server/student/weekly-check";
import Link from "next/link";
import { streakAndPoints } from "@/server/student/streak";
import { openGamesFor } from "@/server/game/live";
import { lexileBands, levelForLexile } from "@/server/curriculum-map/lexile";
import { studentRespondWork } from "@/server/curriculum-map/respond-assign";
import { studentBadges } from "@/server/student/badges";
import { dueMistakes, myExitTicket, studentWeek } from "@/server/teacher/classroom";
import { StudentTour } from "@/components/student/student-tour";
import { myTests } from "@/server/map/sim";
import { classChallenge, questionOfTheDay } from "@/server/teacher/extras";
import { myTasks } from "@/server/teacher/writing";
import { QuestionOfTheDay } from "@/components/student/qotd";

export const metadata = { title: "My work" };

/** Student home: welcome card (Lexile, RIT), the three big areas, and only the work the teacher assigned. */
export default async function StudentHome({ searchParams }: { searchParams: Promise<{ area?: string; goal?: string }> }) {
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
  const [gradeRow, bands, plans, streak, games, respond, badges] = await Promise.all([
    student?.gradeId ? repo.findUnique("Grade", { id: student.gradeId }) : Promise.resolve(null),
    lexileBands(repo, actor.schoolId ?? null), studentSkillPlans(repo, actor), streakAndPoints(repo, actor.studentId!), openGamesFor(repo, actor), studentRespondWork(repo, actor), studentBadges(repo, actor.studentId!),
  ]);
  const [week, exitTicket, review, comments, tests] = await Promise.all([studentWeek(repo, actor), myExitTicket(repo, actor), dueMistakes(repo, actor.studentId!), repo.findMany("WorkComment", { studentId: actor.studentId! }, { select: ["createdAt"] }), myTests(repo, actor)]);
  const [qotd, challenge, writing] = await Promise.all([questionOfTheDay(repo, actor), student?.gradeId ? classChallenge(repo, String(student.schoolId), String(student.gradeId)) : Promise.resolve([]), myTasks(repo, actor)]);
  const [today, myWeek, spaced, diag, check] = await Promise.all([todaysPlanStep(repo, actor), weekStats(repo, actor.studentId!), reviewDue(repo, actor.studentId!), myDiagnostic(repo, actor), weeklyCheck(repo, actor)]);
  const myClass = (await repo.findMany("ClassMembership", { studentId: actor.studentId!, leftAt: null }, { select: ["classId"] }))[0]?.classId;
  const testsToDo = tests.windows.filter((w) => w.open).reduce((n, w) => n + w.sessions.filter((x) => x.status !== "DONE").length, 0);
  const fresh = badges.filter((b) => b.earnedAt && Date.now() - new Date(b.earnedAt).getTime() < 3 * 86_400_000).sort((a, b) => String(b.earnedAt).localeCompare(String(a.earnedAt)))[0];
  const todo = respond.filter((r) => !r.finishedAt);
  const grade = Number(gradeRow?.level ?? 0);
  const extras: StudentExtras = {
    games,
    lexile: lexile.lexile, readingLevel: levelForLexile(bands[grade], lexile.lexile),
    rit: reading[0] ? Number(reading[0].rit) : null, ritGoal: withGoal ? Number(withGoal.rit) + Number(withGoal.projectedGrowth) : null,
    grade, plans: plans.length, ...streak, respond: { todo: todo.length, next: todo[0]?.setCode ?? null },
    badges: badges.filter((b) => b.earned).length, newBadge: fresh ? { icon: fresh.icon, name: fresh.name } : null,
    week, exitTicket: exitTicket ? { id: exitTicket.id, title: exitTicket.title } : null, reviewDue: review.due.length,
    newComments: comments.filter((c) => Date.now() - t(c.createdAt) < 7 * 86_400_000).length, goalMsg: sp.goal ?? null, mapTests: testsToDo,
    challenge: challenge.length ? { mine: challenge.find((c) => c.classId === myClass) ?? null, all: challenge } : null,
    writingTodo: writing.filter((w) => w.status === "NOT_STARTED" || w.status === "DRAFT").length,
  };
  return (
    <AppShell name={String(me.displayName)}>
      <StudentTour />
      {diag && diag.status !== "DONE" && (
        <Link href={diag.href} className="lift mb-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-amber-400 to-orange-400 p-5 text-amber-950 shadow-md">
          <span><span className="block text-xs font-bold uppercase tracking-wider">📝 Start of the year</span><span className="block text-2xl font-extrabold">{diag.status === "STARTED" ? "Finish your Diagnostic Test" : "Take your Diagnostic Test"}</span><span className="block text-sm">{diag.status === "STARTED" ? `${diag.answered} of ${diag.total} answered — your answers are saved.` : `${diag.total} questions. Do your best: it shows your strengths and what to learn next.`}</span></span>
          <span className="rounded-xl bg-brand-navy px-6 py-3 text-lg font-bold text-white">{diag.status === "STARTED" ? "Continue ▶" : "Start ▶"}</span>
        </Link>
      )}
      <TodayPlanCard step={today} week={myWeek} review={spaced} check={diag && diag.status !== "DONE" ? null : check} />
      {extras.rit !== null && (
        <nav aria-label="My learning path" className="mb-5 grid gap-2 sm:grid-cols-3">
          {[
            { href: "/student/map", icon: "🗺️", title: "My MAP", sub: `RIT ${extras.rit}${extras.ritGoal ? ` · goal ${extras.ritGoal}` : ""}` },
            { href: `/map-report/study-plan/${actor.studentId}`, icon: "📑", title: "My study plan", sub: "What I am ready to learn next" },
            { href: "/student/skills", icon: "🧩", title: "My skills", sub: "Practise at my level" },
          ].map((x, i) => (
            <a key={x.href} href={x.href} className="group flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200 transition hover:ring-brand-teal">
              <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-brand-navy text-lg text-white">{x.icon}</span>
              <span className="min-w-0"><span className="block font-semibold text-brand-navy"><span className="text-slate-400">{i + 1}.</span> {x.title}</span><span className="block truncate text-xs text-slate-500">{x.sub}</span></span>
            </a>
          ))}
        </nav>
      )}
      <AssignedSkills view={view} firstName={String(me.displayName).split(" ")[0]} placement={required && !diagnostic} area={area} extras={extras}
        qotd={qotd ? <QuestionOfTheDay q={qotd.question} area={qotd.area} answered={qotd.answered} /> : null} />
    </AppShell>
  );
}

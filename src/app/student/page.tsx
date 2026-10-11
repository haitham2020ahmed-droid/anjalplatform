import { AppShell } from "@/components/app-shell";
import { coachSummary } from "@/server/fluency/coach";
import { FluencyCoachIcon } from "@/components/fluency/coach-icon";
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
import { nextStep } from "@/server/student/next-step";
import { studentReadRiseSummary } from "@/server/readrise/engine";
import { ReadRiseStudentCard } from "@/components/readrise/student-card";

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
  const [today, myWeek, spaced, diag, check, coach] = await Promise.all([todaysPlanStep(repo, actor), weekStats(repo, actor.studentId!), reviewDue(repo, actor.studentId!), myDiagnostic(repo, actor), weeklyCheck(repo, actor), coachSummary(repo, actor.studentId!)]);
  const [step, readRise] = await Promise.all([nextStep(repo, actor), studentReadRiseSummary(repo, actor.studentId!)]);
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
      {step.kind !== "DIAGNOSTIC" && step.href && (
        <Link href={step.href} data-testid="next-step" className="lift mb-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-brand-navy to-indigo-700 p-5 text-white shadow-md">
          <span className="min-w-0 flex-1"><span className="block text-xs font-bold uppercase tracking-wider text-indigo-200">▶ My Next Step</span><span className="block text-2xl font-extrabold">{step.title}</span><span className="block text-sm text-indigo-100">{step.why}</span></span>
          <span className="rounded-xl bg-white px-6 py-3 text-lg font-bold text-brand-navy">{step.cta} ▶</span>
        </Link>
      )}
      {step.path && step.path.length > 1 && (
        <section className="-mt-3 mb-5 rounded-3xl bg-white p-4 ring-1 ring-indigo-100" data-testid="my-path">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">🧭 My learning path</p>
          <ol className="mt-2 flex flex-wrap gap-2">{step.path.map((x, k) => (
            <li key={x.href + k}><Link href={x.href} className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-indigo-100 hover:ring-indigo-300"><span className="tabular-nums text-indigo-400">{k + 1}</span>{x.action === "FOUNDATION" ? "🧱" : x.action === "REVIEW" ? "🔁" : x.action === "STRETCH" ? "🚀" : "🎯"} {x.name}</Link></li>
          ))}</ol>
          <p className="mt-1 text-xs text-slate-500">🧱 build a skill underneath · 🎯 your next skill · 🔁 a quick review · 🚀 a challenge</p>
        </section>
      )}
      <TodayPlanCard step={today} week={myWeek} review={spaced} check={diag && diag.status !== "DONE" ? null : check} />
      <Link href="/student/fluency-coach" className="lift mb-5 flex flex-wrap items-center gap-4 rounded-3xl bg-gradient-to-r from-teal-50 via-white to-indigo-50 p-4 ring-1 ring-teal-200">
        <FluencyCoachIcon size={56} />
        <span className="min-w-0 flex-1"><span className="block text-lg font-extrabold text-brand-navy">Fluency Coach</span><span className="block text-sm text-slate-600">{coach.plan ? `Goal ${coach.plan.goal} words a minute · next check ${coach.plan.nextCheck}` : "Read aloud, record your voice, and get feedback on every word."}{coach.latest ? ` · last check ${coach.latest.wcpm} WCPM` : ""}</span></span>
        <span className="rounded-xl bg-brand-navy px-5 py-2.5 font-bold text-white">🎙 Read</span>
      </Link>
      <div className="mb-5"><ReadRiseStudentCard summary={readRise} /></div>
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

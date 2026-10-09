import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { teacherClasses } from "@/server/teacher/queries";
import { teacherAlerts } from "@/server/insights/progress";
import { practiceStats } from "@/server/insights/student-data";
import { coordinatorGrades } from "@/server/teacher/coordinators";
import { onboarding } from "@/server/teacher/week-plan";
import { scanAlerts } from "@/server/insights/alerts";
import { FirstWeekChecklist } from "@/components/teacher/checklist";
import { ClassRows } from "@/components/home/class-rows";
import { classesAtAGlance } from "@/server/insights/overview";
import { goalProgress } from "@/server/admin/school-goals";
import { GoalsTable } from "@/components/home/goals-table";

export const metadata = { title: "My classes" };

export default async function TeacherHome() {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const classes = await teacherClasses(repo, actor);
  // new student alerts (at most every 3 hours; teachers and the head of department get one notification)
  if (actor.schoolId) await scanAlerts(repo, actor.schoolId).catch(() => 0);
  const now = new Date();
  const alerts = actor.role === "TEACHER" ? await teacherAlerts(repo, actor, now) : [];
  const coordinator = (await coordinatorGrades(repo, actor)).length > 0;
  const ob = actor.role === "TEACHER" ? await onboarding(repo, actor) : null;
  const ids = actor.role === "TEACHER" && actor.teacherStudentIds ? [...actor.teacherStudentIds] : [];
  const practice = await practiceStats(repo, ids, now);
  const studentCount = ids.length;
  const active = [...practice.values()].filter((p) => p.lastActive && new Date(p.lastActive).getTime() >= now.getTime() - 7 * 86_400_000).length;
  const needHelp = new Set(alerts.filter((a) => a.kind !== "NOT_STARTED").map((a) => a.studentId)).size;
  const classIds = classes.map((c) => String(c.classId));
  const weekEnd = now.getTime() + 7 * 86_400_000;
  const dueWeek = classIds.length ? (await repo.findMany("Assignment", { classId: { in: classIds }, deletedAt: null }, { select: ["dueAt"] })).filter((a) => a.dueAt && new Date(a.dueAt instanceof Date ? a.dueAt.toISOString() : String(a.dueAt)).getTime() >= now.getTime() && new Date(a.dueAt instanceof Date ? a.dueAt.toISOString() : String(a.dueAt)).getTime() <= weekEnd).length : 0;
  const draftPlans = classIds.length ? await repo.count("MapPlan", { classId: { in: classIds }, status: "DRAFT" }) : 0;
  const rows = await classesAtAGlance(repo, actor, now);
  const goalRows = classIds.length ? await goalProgress(repo, actor, await repo.findMany("Class", { id: { in: classIds } }), now) : null;
  const first = String(me.displayName).split(" ")[0];
  const hour = (now.getUTCHours() + 3) % 24;   // Riyadh
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Riyadh" });
  const kpis = [
    { href: "/teacher/progress", label: "Practised this week", value: `${active}`, of: `of ${studentCount}`, tone: studentCount && active / studentCount < 0.5 ? "text-amber-700" : "text-brand-navy" },
    { href: "/teacher/calendar", label: "Work due this week", value: String(dueWeek), of: "assignments", tone: "text-brand-navy" },
    { href: "/teacher/progress?show=risk", label: "Students who need help", value: String(needHelp), of: "right now", tone: needHelp ? "text-red-700" : "text-emerald-700" },
    { href: "/teacher/map-plans?tab=plans", label: "MAP plans to send", value: String(draftPlans), of: "drafts", tone: draftPlans ? "text-brand-purple" : "text-emerald-700" },
  ];
  const groups = [
          ["Teach", "from-sky-50", [["📅", "My week", "Suggested plan · goals · rhythm · exit tickets", "/teacher/week"], ["🧭", "Curriculum Map", "Assign by place, level or student", "/admin/curriculum-map"], ["📋", "MAP plans & groups", "Bands, draft plans to check and send, small groups", "/teacher/map-plans"], ["🖨", "Worksheets", "Printable sheets from chosen questions + key", "/teacher/worksheet"], ["✍️", "Writing & reading aloud", "Rubric scoring · students record themselves reading", "/teacher/writing"], ["🗂️", "Skill plans", "A map of places to send to students", "/teacher/plans"], ["🎮", "Live game", "A Kahoot-style quiz with a PIN and QR code", "/teacher/games"], ["📋", "Personalized plan", "From MAP: groups, goals, standards — Word / PDF", "/teacher/personal-plan"], ["🚨", "Intervention", "Who needs attention now (MAP + platform)", "/teacher/intervention"], ["📚", "Question Bank", "Find, ☆ star and assign questions", "/admin/questions?status=PUBLISHED"], ["⭐", "ReadMaster", "Leveled articles (Lexile)", "/admin/readmaster"], ["🗺️", "MAP", "MAP skills by goal area", "/teacher/curriculum"], ["✍️", "Respond to Reading", "Send by level · track “I finished”", "/teacher/respond"], ["🔤", "Grammar", "Grammar skills of every grade", "/admin/grammar"]]],
          ["Track", "from-emerald-50", [["🚨", "Alerts", "Act, write what you did, mark handled", "/teacher/alerts"], ["🗓️", "Calendar", "Due dates, exit tickets, tests — five weeks", "/teacher/calendar"], ["🧭", "MAP practice test", "Who is on track before the real MAP", "/teacher/map-test"], ["📈", "MAP growth", "Fall → Winter → Spring, met growth or not", "/teacher/growth"], ["📈", "Students dashboard", "Work, accuracy, time, MAP progress, plans", "/teacher/progress"], ["✏️", "Enter MAP data", "Type the class scores (Reading / Language)", "/teacher/map-entry"], ["🎯", "Levels & tests", "Above / On / Below · Placement", "/teacher/levels"], ["📊", "Curriculum results", "How the class did on each section", "/teacher/curriculum-results"], ["📈", "MAP scores", "Compared with the national average", "/teacher/map-rit"], ["💡", "MAP recommendations", "Skills each student needs, from MAP", "/teacher/map-recommendations"], ["🗓️", "Weekly assignments", "Status of everything assigned", "/teacher/assignments"]]],
          ["Review", "from-amber-50", [["📖", "Dictionary", "Meanings students look up · unit vocabulary", "/admin/dictionary"], ["🤖", "Review AI questions", "Drafts waiting for you", "/admin/questions?status=DRAFT&ai=1"], ["✍️", "My questions", "Questions you wrote", "/admin/questions?status=DRAFT&mine=1"]]],
  ] as const;
  return (
    <AppShell name={String(me.displayName)}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{today}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-brand-navy">{greet}, {first}</h1>
          <p className="mt-1 text-slate-600">{classes.length} class{classes.length === 1 ? "" : "es"} · {classes.reduce((n, c) => n + Number(c.students ?? 0), 0)} students</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/curriculum-map" className="rounded-xl bg-brand-navy px-4 py-2.5 font-medium text-white hover:bg-brand-purple">⭐ Assign work</Link>
          <Link href="/teacher/map-reports" className="rounded-xl bg-white px-4 py-2.5 font-medium text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📑 MAP reports</Link>
          <Link href="/teacher/week" className="rounded-xl bg-white px-4 py-2.5 font-medium text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📅 My week</Link>
          {coordinator && <Link href="/teacher/grade-summary" className="rounded-xl bg-white px-4 py-2.5 font-medium text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🏫 Grade summary</Link>}
        </div>
      </header>

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.href} href={k.href} className="group rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:ring-brand-teal">
            <dt className="text-sm text-slate-500">{k.label}</dt>
            <dd className="mt-1 flex items-baseline gap-1.5"><span className={`text-3xl font-semibold tabular-nums ${k.tone}`}>{k.value}</span><span className="text-sm text-slate-500">{k.of}</span></dd>
          </Link>
        ))}
      </dl>

      {ob && !ob.hidden && ob.done < ob.steps.length && <div className="mt-6"><FirstWeekChecklist steps={ob.steps} back="/teacher" /></div>}

      {goalRows && (
        <section aria-labelledby="goals-h" className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div className="mb-2 flex items-baseline justify-between"><h2 id="goals-h" className="text-lg font-semibold text-brand-navy">🎯 School goals this week</h2><span className="text-xs text-slate-500">set by the school</span></div>
          <GoalsTable data={goalRows} />
        </section>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="classes-h">
          <div className="mb-3 flex items-baseline justify-between"><h2 id="classes-h" className="text-lg font-semibold text-brand-navy">My classes</h2><Link href="/teacher/classes" className="text-sm font-medium text-brand-teal hover:underline">All class pages</Link></div>
          <ClassRows rows={rows} admin={false} />
        </section>
        <section aria-labelledby="alerts-h" className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex items-baseline justify-between"><h2 id="alerts-h" className="text-lg font-semibold text-brand-navy">Needs your attention</h2><Link href="/teacher/alerts" className="text-sm font-medium text-brand-teal hover:underline">Alerts</Link></div>
          {alerts.length === 0 ? <p className="mt-3 text-sm text-slate-600">No student needs attention right now.</p> : (
            <ul className="mt-2 divide-y divide-slate-100">
              {alerts.slice(0, 8).map((a, i) => (
                <li key={i} className="py-2">
                  <Link href={`/admin/student-file/${a.studentId}`} className="flex items-start gap-2 rounded-lg hover:bg-slate-50">
                    <span aria-hidden="true">{a.kind === "AT_RISK" ? "⚠️" : a.kind === "DROPPED" ? "📉" : "⏰"}</span>
                    <span className="min-w-0"><span className="block truncate font-medium text-slate-900">{a.name}</span><span className="block truncate text-xs text-slate-500">{a.className} · {a.detail}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {alerts.length > 8 && <p className="mt-2 text-sm"><Link href="/teacher/progress?show=risk" className="font-medium text-brand-teal hover:underline">See all {alerts.length}</Link></p>}
        </section>
      </div>

      <section className="mt-8" aria-labelledby="tools-h">
        <h2 id="tools-h" className="text-lg font-semibold text-brand-navy">Everything you can do</h2>
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          {groups.map(([group, , tools]) => (
            <div key={group} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
              <h3 className="px-2 pb-1 pt-1 text-sm font-semibold text-slate-500">{group === "Teach" ? "Teach" : group === "Track" ? "Track progress" : "Review content"}</h3>
              <ul>
                {tools.map(([icon, title, text, href]) => (
                  <li key={href}>
                    <Link href={href} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
                      <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-lg ring-1 ring-slate-100">{icon}</span>
                      <span className="min-w-0"><span className="block font-medium text-slate-900">{title}</span><span className="block truncate text-xs text-slate-500">{text}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

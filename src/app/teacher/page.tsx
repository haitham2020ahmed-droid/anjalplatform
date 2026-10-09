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
  return (
    <AppShell name={String(me.displayName)}>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy via-[#2b3f8f] to-brand-purple p-6 text-white shadow-lg">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-brand-teal/30 blur-2xl" />
        <p className="relative text-sm text-white/80">Welcome back,</p>
        <h1 className="relative text-3xl font-extrabold tracking-tight">{String(me.displayName).split(" ")[0]} 👋</h1>
        <p className="relative mt-1 text-white/85">{classes.length} class{classes.length === 1 ? "" : "es"} · {classes.reduce((n, c) => n + Number(c.students ?? 0), 0)} students</p>
      </section>
      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([["👥 Active this week", `${active} of ${studentCount}`, ""], ["🗓️ Due this week", String(dueWeek), ""], ["🆘 Need help", String(needHelp), needHelp ? "text-red-700" : ""], ["🔔 Alerts", String(alerts.length), alerts.length ? "text-amber-700" : ""]] as const).map(([l, n, tone]) => (
          <div key={l} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><dt className="text-sm font-semibold text-slate-500">{l}</dt><dd className={`mt-1 text-3xl font-extrabold text-brand-navy ${tone}`}>{n}</dd></div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/admin/curriculum-map" className="rounded-xl bg-brand-navy px-4 py-2.5 font-semibold text-white hover:bg-brand-purple">⭐ Assign</Link>
        <Link href="/teacher/levels" className="rounded-xl bg-white px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🎯 Student levels</Link>
        <Link href="/teacher/respond" className="rounded-xl bg-white px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">✍️ Respond to Reading</Link>
        <Link href="/teacher/map-entry" className="rounded-xl bg-white px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">✏️ Enter MAP data</Link>
        <Link href="/teacher/progress" className="rounded-xl bg-white px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📈 Students dashboard</Link>
        {coordinator && <Link href="/teacher/grade-summary" className="rounded-xl bg-white px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🏫 Grade summary</Link>}
      </div>
      {ob && !ob.hidden && ob.done < ob.steps.length && <div className="mt-6"><FirstWeekChecklist steps={ob.steps} back="/teacher" /></div>}
      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-amber-200" aria-labelledby="alerts-h">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="alerts-h" className="text-lg font-extrabold text-brand-navy">🔔 Students who need attention</h2><Link href="/teacher/alerts" className="rounded-lg bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-800 ring-1 ring-red-200 hover:bg-red-100">🚨 Alerts &amp; follow-up →</Link></div>
        {alerts.length === 0 ? <p className="mt-2 text-slate-600">All good — no alerts right now. 🎉</p> : (
          <ul className="mt-2 divide-y divide-slate-100">
            {alerts.slice(0, 12).map((a, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><span aria-hidden="true">{a.kind === "AT_RISK" ? "⚠️" : a.kind === "DROPPED" ? "📉" : "⏰"}</span> <Link href={`/teacher/progress/${a.studentId}`} className="font-semibold text-brand-navy hover:underline">{a.name}</Link> <span className="text-xs text-slate-500">{a.className}</span><span className="block text-sm text-slate-600">{a.detail}</span></span>
                <Link href={`/teacher/progress/${a.studentId}`} className="rounded-lg px-3 py-1 text-sm font-semibold text-brand-teal ring-1 ring-slate-200 hover:ring-brand-teal">Open →</Link>
              </li>
            ))}
          </ul>
        )}
        {alerts.length > 12 && <p className="mt-2 text-sm"><Link href="/teacher/progress?show=risk" className="font-semibold text-brand-teal underline">See all ({alerts.length})</Link></p>}
      </section>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {([
          ["Teach", "from-sky-50", [["📅", "My week", "Suggested plan · goals · rhythm · exit tickets", "/teacher/week"], ["🧭", "Curriculum Map", "Assign by place, level or student", "/admin/curriculum-map"], ["📋", "MAP plans & groups", "Bands, draft plans to check and send, small groups", "/teacher/map-plans"], ["🖨", "Worksheets", "Printable sheets from chosen questions + key", "/teacher/worksheet"], ["✍️", "Writing & reading aloud", "Rubric scoring · students record themselves reading", "/teacher/writing"], ["🗂️", "Skill plans", "A map of places to send to students", "/teacher/plans"], ["🎮", "Live game", "A Kahoot-style quiz with a PIN and QR code", "/teacher/games"], ["📋", "Personalized plan", "From MAP: groups, goals, standards — Word / PDF", "/teacher/personal-plan"], ["🚨", "Intervention", "Who needs attention now (MAP + platform)", "/teacher/intervention"], ["📚", "Question Bank", "Find, ☆ star and assign questions", "/admin/questions?status=PUBLISHED"], ["⭐", "ReadMaster", "Leveled articles (Lexile)", "/admin/readmaster"], ["🗺️", "MAP", "MAP skills by goal area", "/teacher/curriculum"], ["✍️", "Respond to Reading", "Send by level · track “I finished”", "/teacher/respond"], ["🔤", "Grammar", "Grammar skills of every grade", "/admin/grammar"]]],
          ["Track", "from-emerald-50", [["🚨", "Alerts", "Act, write what you did, mark handled", "/teacher/alerts"], ["🗓️", "Calendar", "Due dates, exit tickets, tests — five weeks", "/teacher/calendar"], ["🧭", "MAP practice test", "Who is on track before the real MAP", "/teacher/map-test"], ["📈", "MAP growth", "Fall → Winter → Spring, met growth or not", "/teacher/growth"], ["📈", "Students dashboard", "Work, accuracy, time, MAP progress, plans", "/teacher/progress"], ["✏️", "Enter MAP data", "Type the class scores (Reading / Language)", "/teacher/map-entry"], ["🎯", "Levels & tests", "Above / On / Below · Placement", "/teacher/levels"], ["📊", "Curriculum results", "How the class did on each section", "/teacher/curriculum-results"], ["📈", "MAP scores", "Compared with the national average", "/teacher/map-rit"], ["💡", "MAP recommendations", "Skills each student needs, from MAP", "/teacher/map-recommendations"], ["🗓️", "Weekly assignments", "Status of everything assigned", "/teacher/assignments"]]],
          ["Review", "from-amber-50", [["📖", "Dictionary", "Meanings students look up · unit vocabulary", "/admin/dictionary"], ["🤖", "Review AI questions", "Drafts waiting for you", "/admin/questions?status=DRAFT&ai=1"], ["✍️", "My questions", "Questions you wrote", "/admin/questions?status=DRAFT&mine=1"]]],
        ] as const).map(([group, tint, tools]) => (
          <section key={group} className={`rounded-3xl bg-gradient-to-br bg-linear-to-br ${tint} to-white p-4 ring-1 ring-slate-200`}>
            <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">{group}</h2>
            <ul className="mt-2 grid gap-2">
              {tools.map(([icon, title, text, href]) => (
                <li key={href}>
                  <Link href={href} className="lift group flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                    <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-50 text-2xl transition group-hover:scale-110">{icon}</span>
                    <span className="min-w-0"><span className="block font-bold text-brand-navy">{title}</span><span className="block truncate text-xs text-slate-500">{text}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <h2 className="mt-8 text-2xl font-bold text-brand-navy">My classes</h2>
      {classes.length === 0 ? <p className="mt-4 text-slate-600">You are not assigned to any classes yet. Ask your school admin to add you to a class.</p> : (
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {classes.map((c) => (
            <li key={c.classId}>
              <a href={`/teacher/classes/${c.classId}`} className="block rounded-2xl bg-white p-5 ring-1 ring-slate-200 hover:ring-brand-teal">
                <span className="text-sm text-slate-500">Grade {c.grade}</span>
                <span className="block text-2xl font-bold text-brand-navy">{c.name}</span>
                <span className="mt-2 block text-slate-700">{c.students} students</span>
                {c.openAlerts > 0 && <span className="mt-2 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-900">{c.openAlerts} {c.openAlerts === 1 ? "student alert" : "student alerts"}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

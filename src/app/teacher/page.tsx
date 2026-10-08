import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { teacherClasses } from "@/server/teacher/queries";

export const metadata = { title: "My classes" };

export default async function TeacherHome() {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const classes = await teacherClasses(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy via-[#2b3f8f] to-brand-purple p-6 text-white shadow-lg">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-brand-teal/30 blur-2xl" />
        <p className="relative text-sm text-white/80">Welcome back,</p>
        <h1 className="relative text-3xl font-extrabold tracking-tight">{String(me.displayName).split(" ")[0]} 👋</h1>
        <p className="relative mt-1 text-white/85">{classes.length} class{classes.length === 1 ? "" : "es"} · {classes.reduce((n, c) => n + Number(c.students ?? 0), 0)} students</p>
      </section>
      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-indigo-200">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-brand-navy"><span aria-hidden="true">🔁</span> The adaptive engine — every student on their own path</h2>
        <ol className="mt-3 flex flex-wrap items-center gap-2 text-sm font-bold" aria-label="The adaptive ladder">
          {[["🛟 Support", "grade below", "bg-orange-50 text-orange-900 ring-orange-200"], ["🟠 Below", "", "bg-amber-50 text-amber-900 ring-amber-200"], ["🔵 On", "", "bg-sky-50 text-sky-900 ring-sky-200"], ["🟢 Above", "", "bg-emerald-50 text-emerald-900 ring-emerald-200"], ["🚀 Challenge", "grade above", "bg-violet-50 text-violet-900 ring-violet-200"]].map(([l, sub, c], i) => (
            <li key={l} className="flex items-center gap-2">{i > 0 && <span aria-hidden="true" className="text-slate-400">→</span>}<span className={`rounded-full px-3 py-1 ring-1 ${c}`}>{l}{sub ? <span className="ms-1 text-xs font-semibold opacity-70">({sub})</span> : null}</span></li>
          ))}
        </ol>
        <p className="mt-2 text-sm text-slate-600">Students start at their Lexile / MAP level, move up after 4 of 5 correct and down when they struggle. The <Link href="/admin/curriculum-map/bridge" className="font-semibold text-brand-teal underline">🌉 Cross-Grade Bridge</Link> adds real easier and harder texts of the same skill. ReadMaster versions and MAP practice adapt the same way.</p>
      </section>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {([
          ["Teach", "from-sky-50", [["🧭", "Curriculum Map", "Assign by place, level or student", "/admin/curriculum-map"], ["🗂️", "Skill plans", "A map of places to send to students", "/teacher/plans"], ["🎮", "Live game", "A Kahoot-style quiz with a PIN and QR code", "/teacher/games"], ["📋", "Personalized plan", "From MAP: groups, goals, standards — Word / PDF", "/teacher/personal-plan"], ["🚨", "Intervention", "Who needs attention now (MAP + platform)", "/teacher/intervention"], ["📚", "Question Bank", "Find, ☆ star and assign questions", "/admin/questions?status=PUBLISHED"], ["⭐", "ReadMaster", "Leveled articles (Lexile)", "/admin/readmaster"], ["🗺️", "MAP", "MAP skills by goal area", "/teacher/curriculum"]]],
          ["Track", "from-emerald-50", [["🎯", "Levels & tests", "Above / On / Below · Placement", "/teacher/levels"], ["📊", "Curriculum results", "% correct on every place", "/teacher/curriculum-results"], ["📈", "MAP RIT", "Ranking vs national average", "/teacher/map-rit"], ["💡", "MAP recommendations", "Skills each student needs, from MAP", "/teacher/map-recommendations"], ["🗓️", "Weekly assignments", "Status of everything assigned", "/teacher/assignments"]]],
          ["Review", "from-amber-50", [["🤖", "Review AI questions", "Drafts waiting for you", "/admin/questions?status=DRAFT&ai=1"], ["✍️", "My questions", "Questions you wrote", "/admin/questions?status=DRAFT&mine=1"]]],
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

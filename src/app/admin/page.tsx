import Link from "next/link";
import { listQuestions } from "@/server/admin/questions";
import { countDeletionRequests } from "@/server/admin/question-requests";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { scanAlerts } from "@/server/insights/alerts";
import { can } from "@/server/auth/rbac";
import { ToolFinder } from "@/components/ui/tool-finder";
import { readiness } from "@/server/map/sim";
import { classesAtAGlance } from "@/server/insights/overview";
import { connectionsCached } from "@/server/admin/connections";
import { ClassRows } from "@/components/home/class-rows";
import { HEALTH_UI } from "@/components/connect/thread";

export const metadata = { title: "Administration" };

/** Admin home: one card per area the signed-in admin may use. */
/** Dashboard groups: content, students & results, people, school. */
const GROUPS = [
  { key: "content", icon: "📚", title: "Content: curriculum, questions, reading" },
  { key: "results", icon: "📊", title: "Students & results" },
  { key: "people", icon: "👥", title: "People" },
  { key: "school", icon: "🏫", title: "School & data" },
] as const;
function groupOf(href: string): (typeof GROUPS)[number]["key"] {
  if (/student-file|department|alerts|map-plans|map-test|growth|visit|term-report/.test(href)) return "results";
  if (/map-links|question-flags|dictionary|worksheet/.test(href)) return "content";
  if (/logins|teachers/.test(href)) return "people";
  if (/curriculum-map|\/questions|readmaster|question-bank|bank-gaps|item-quality|\/plans|\/curriculum$/.test(href)) return "content";
  if (/map-rit|map-recommendations|curriculum-results|levels|performance|analytics|intervention|personal-plan/.test(href)) return "results";
  if (/users|roster/.test(href)) return "people";
  return "school";
}

export default async function AdminHome() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  if (actor.schoolId) await scanAlerts(repo, actor.schoolId).catch(() => 0);
  const areas = [
    { href: "/admin/connections", title: "🔗 Connections", text: "Is everything joined up? Curriculum Map, skills, questions, MAP goal areas, the Learning Continuum, students and plans — each link checked, gaps listed with where to fix them.", show: can(actor, "reports:read") },
    { href: "/teacher/map-reports", title: "📑 MAP reports", text: "Personal study plans, family reports and group study plans for every class.", show: can(actor, "reports:read") },
    { href: "/admin/map-continuum", title: "📘 Learning Continuum", text: "Import the MAP Growth Learning Continuum: what each RIT band is ready to learn.", show: can(actor, "settings:school") },
    { href: "/admin/quick-students", title: "⚡ Students & MAP setup", text: "Add students by template or by hand, MAP scores, then the plans.", show: can(actor, "students:manage") },
    { href: "/admin/student-file", title: "🔎 Find a student · full file", text: "Any student of the school: results, MAP, plans, writing, badges, alerts, comments, notes, sign-ins — and see their pages as they do.", show: can(actor, "reports:read") },
    { href: "/admin/department", title: "🏫 Department week", text: "Every class side by side this week: practice, accuracy, work, MAP, alerts and the hardest skills per grade. PDF and Excel.", show: can(actor, "reports:read") },
    { href: "/teacher/alerts", title: "🚨 Student alerts & follow-up", text: "Students who need attention, what each teacher did, and what is not handled yet.", show: can(actor, "reports:read") },
    { href: "/teacher/map-plans", title: "📋 MAP plans & groups", text: "RIT bands per goal area, draft plans checked and sent by teachers, small groups, mid-unit checks.", show: can(actor, "reports:read") },
    { href: "/admin/map-links", title: "🔗 Bank ↔ MAP goal areas", text: "Link every skill of the question bank to its MAP goal area (suggested from the CCSS standard).", show: can(actor, "curriculum:edit") },
    { href: "/teacher/map-test", title: "🧭 MAP practice test", text: "A MAP-like adaptive test (50 Reading + 50 Language) before Winter and Spring: who is on track, plans from the results, accuracy vs the real MAP.", show: can(actor, "reports:read") },
    { href: "/teacher/growth", title: "📈 MAP growth report", text: "After Winter / Spring: who reached the expected growth, by class and grade.", show: can(actor, "reports:read") },
    { href: "/admin/visit", title: "👀 Class visit", text: "See any teacher's class exactly as the teacher does — read only.", show: can(actor, "reports:read") },
    { href: "/admin/term-report", title: "🧾 End-of-term report", text: "One printable report for the school leadership: MAP, practice, work, alerts.", show: can(actor, "reports:read") },
    { href: "/admin/logins", title: "🔑 Sign-ins", text: "Who signed in and when; students who have not signed in for a while.", show: can(actor, "students:read") },
    { href: "/admin/backup", title: "💾 Backup to Excel", text: "Download every score, answer count, MAP result and plan in one Excel file.", show: can(actor, "reports:export") },
    { href: "/admin/errors", title: "🩺 Errors", text: "Problems the platform met (for the developer), newest first.", show: can(actor, "settings:school") },
    { href: "/admin/question-flags", title: "🚩 Flagged questions", text: "Questions students marked as unclear.", show: can(actor, "questions:review") },
    { href: "/admin/dictionary", title: "📖 Dictionary", text: "Meanings students look up; write the school's own definitions; unit vocabulary.", show: true },
    { href: "/admin/performance", title: "Teacher & student performance", text: "Every teacher, class and student at a glance: mastery, completion, overdue work, skills that need work.", show: can(actor, "analytics:school") },
    { href: "/admin/users", title: "Users", text: "Students, teachers, parents and admins; classes and parent links.", show: can(actor, "students:manage") || can(actor, "teachers:manage") },
    { href: "/admin/roster", title: "Import users", text: "Add or update many users at once from a CSV or Excel file.", show: can(actor, "students:manage") },
    { href: "/admin/item-quality", title: "🔬 Question quality", text: "From students' answers: questions too easy or too hard for their level, often guessed, or with an unused option.", show: can(actor, "questions:read") },
    { href: "/admin/bank-gaps", title: "🕳 Question bank gaps", text: "Where to write questions first: questions per MAP goal area vs. the students who need it.", show: can(actor, "questions:read") },
    { href: "/teacher/intervention", title: "🚨 Intervention", text: "Students who need attention now, from MAP and the platform.", show: can(actor, "assignments:create") },
    { href: "/teacher/personal-plan", title: "📋 Personalized plans", text: "Generated from MAP for every class: Word / PDF.", show: can(actor, "assignments:create") },
    { href: "/admin/roster/clean", title: "🧹 Clean roster", text: "Archive or delete students (school, grade or class) before loading a new roster.", show: can(actor, "students:manage") },
    { href: "/admin/readmaster", title: "⭐ ReadMaster", text: "Leveled articles (Achieve3000-style): the same text in Below / On / Above versions; each student reads their Lexile's version, which moves after every article.", show: can(actor, "questions:read") },
    { href: "/teacher/plans", title: "🗂️ Skill plans", text: "Curriculum Map places assigned together; students open the plan as a map.", show: can(actor, "assignments:read") },
    { href: "/teacher/map-recommendations", title: "💡 MAP recommendations", text: "Skills each student needs, from their MAP scores.", show: can(actor, "reports:read") },
    { href: "/teacher/map-rit", title: "🗺️ MAP Reading RIT", text: "Students ranked by RIT against the national average (NWEA norms) and their class average, Grades 4–6. Enter scores or import the MAP file.", show: can(actor, "reports:read") },
    { href: "/teacher/curriculum-results", title: "📊 Curriculum results", text: "Every class’s answers and % correct on each place of the Curriculum Map.", show: can(actor, "reports:read") },
    { href: "/teacher/levels", title: "🎯 Student levels", text: "Above / On / Below Level of every student (set by teachers or by the Placement test).", show: can(actor, "students:read") },
    { href: "/admin/questions/unclassified", title: "🏷️ Classify curriculum questions", text: "Give curriculum questions without a skill a platform skill, so they also count in practice and reports.", show: can(actor, "questions:publish") },
    { href: "/admin/curriculum-map", title: "🧭 Curriculum Map", text: "Grades 4–6: Book → Unit → Text Set / Selection → Category → Level. Marks where questions will be linked later.", show: can(actor, "curriculum:read") },
    { href: "/admin/questions?status=PUBLISHED", title: "📚 Question Bank", text: "Every question on the platform in one library: search, filter, preview, edit, select and assign. Separate from the Curriculum Map.", show: can(actor, "questions:read") },
    { href: "/admin/questions/import", title: "Import questions", text: "Upload questions from the official CSV or Excel template; review, fix and import.", show: can(actor, "questions:edit") },
    { href: "/admin/question-bank", title: "Question bank coverage (AI)", text: "Questions per skill and difficulty; generate missing questions as drafts for review.", show: can(actor, "questions:read") },
    // “Curriculum” (units, lessons, skills, standards) is hidden from the dashboard for now; /admin/curriculum still works
    { href: "/admin/curriculum", title: "Curriculum", text: "Units, lessons, skills, standards and prerequisites.", show: false },
    { href: "/admin/imports", title: "MAP and other results", text: "Import official MAP Growth and other results.", show: can(actor, "imports:run") },
    { href: "/admin/analytics", title: "School analytics and reports", text: "Progress, comparisons, standards; PDF and Excel reports.", show: can(actor, "analytics:school") },
    { href: "/admin/settings", title: "Settings", text: "Calendar, classes, report branding, adaptive engine.", show: can(actor, "settings:school") || can(actor, "settings:engine") },
  ].filter((a) => a.show);
  // what is waiting for an admin's decision
  const canApprove = can(actor, "questions:publish");
  const [waiting, deletions] = canApprove ? await Promise.all([
    listQuestions(repo, actor, { status: "UNDER_REVIEW", limit: 1, page: 1 }).then((r) => r.total),
    countDeletionRequests(repo, actor),
  ]) : [0, 0];
  // today at a glance (cheap counts)
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [students, activeRows, alertsOpen, flags] = await Promise.all([
    repo.count("Student", { schoolId: actor.schoolId }),
    repo.findMany("PracticeSession", { startedAt: { gte: weekAgo } }, { select: ["studentId"] }),
    repo.count("StudentAlert", { schoolId: actor.schoolId, status: "OPEN" }),
    repo.count("QuestionFlag", { schoolId: actor.schoolId, status: "OPEN" }),
  ]);
  const active = new Set(activeRows.map((r) => String(r.studentId))).size;
  // is the question bank big enough for MAP plans and the practice test? (cached pools: cheap)
  const gradeLevels = (await repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["level"] })).map((g) => Number(g.level)).filter((g) => g >= 1);
  const ready = (await Promise.all(gradeLevels.map((g) => readiness(repo, actor, g).catch(() => [])))).flat();
  const short = ready.flatMap((r) => r.groups.filter((g) => !g.ok).map((g) => `G${r.grade} ${g.name}`));
  const tiles = [
    { href: "/admin/department", label: "Practised this week", value: students ? `${Math.round((100 * Math.min(active, students)) / students)}%` : "—", sub: `${Math.min(active, students)} of ${students} students`, tone: "text-brand-navy" },
    { href: "/teacher/alerts", label: "Alerts not handled", value: String(alertsOpen), sub: "students who need attention", tone: alertsOpen ? "text-red-700" : "text-emerald-700" },
    { href: "/admin/question-flags", label: "Flagged questions", value: String(flags), sub: "marked unclear by students", tone: flags ? "text-amber-700" : "text-emerald-700" },
    { href: "/teacher/map-test", label: "MAP question bank", value: short.length ? `⚠️ ${short.length}` : "✅", sub: short.length ? `areas short of questions: ${short.slice(0, 3).join(", ")}${short.length > 3 ? "…" : ""}` : "ready for plans and the practice test", tone: short.length ? "text-amber-700" : "text-emerald-700" },
  ];
  const [rows, conn] = await Promise.all([classesAtAGlance(repo, actor), connectionsCached(repo, actor).catch(() => null)]);
  const now = new Date();
  const hour = (now.getUTCHours() + 3) % 24;
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Riyadh" });
  const weak = conn ? conn.stages.flatMap((st) => st.checks.filter((c) => c.health === "BAD" || c.health === "WARN").map((c) => ({ st, c }))).slice(0, 4) : [];
  return (
    <AppShell name={String(me.displayName)}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{today}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-brand-navy">{greet}, {String(me.displayName).split(" ")[0]}</h1>
          <p className="mt-1 text-slate-600">School administration · {rows.length} classes · {students} students</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/department" className="rounded-xl bg-brand-navy px-4 py-2.5 font-medium text-white hover:bg-brand-purple">🏫 Department week</Link>
          <Link href="/teacher/map-reports" className="rounded-xl bg-white px-4 py-2.5 font-medium text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📑 MAP reports</Link>
          <Link href="/admin/student-file" className="rounded-xl bg-white px-4 py-2.5 font-medium text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🔎 Find a student</Link>
        </div>
      </header>
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((x) => <Link key={x.href} href={x.href} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:ring-brand-teal"><span className="block text-sm text-slate-500">{x.label}</span><span className={`mt-1 block text-3xl font-semibold tabular-nums ${x.tone}`}>{x.value}</span><span className="block truncate text-xs text-slate-500">{x.sub}</span></Link>)}
      </section>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {conn && (
            <Link href="/admin/connections" className="block rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:ring-brand-teal">
              <span className="flex items-baseline justify-between"><span className="text-lg font-semibold text-brand-navy">🔗 Connections</span><span className="text-2xl font-semibold tabular-nums text-brand-navy">{conn.score}%</span></span>
              <span className="mt-1 block text-sm text-slate-600">How well the curriculum, questions, MAP, the continuum, students and plans are joined.</span>
              {weak.length > 0 && <ul className="mt-3 space-y-1.5">{weak.map(({ c }) => <li key={c.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate text-slate-700">{c.label}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ring-1 ${HEALTH_UI[c.health].chip}`}>{c.ok}/{c.total}</span></li>)}</ul>}
            </Link>
          )}
          {canApprove && (
            <>
              <Link href="/admin/questions?status=UNDER_REVIEW" className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:ring-brand-teal">
                <span><span className="block font-semibold text-brand-navy">Questions waiting for approval</span><span className="block text-xs text-slate-500">New questions and teachers&apos; edits</span></span>
                <span className={`grid h-10 min-w-10 place-items-center rounded-xl px-2 text-lg font-semibold ${waiting ? "bg-amber-400 text-brand-navy" : "bg-slate-100 text-slate-400"}`}>{waiting}</span>
              </Link>
              <Link href="/admin/questions/requests" className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:ring-brand-teal">
                <span><span className="block font-semibold text-brand-navy">Deletion requests</span><span className="block text-xs text-slate-500">Teachers asking to remove a question</span></span>
                <span className={`grid h-10 min-w-10 place-items-center rounded-xl px-2 text-lg font-semibold ${deletions ? "bg-red-500 text-white" : "bg-slate-100 text-slate-400"}`}>{deletions}</span>
              </Link>
            </>
          )}
      </div>
      <section aria-labelledby="classes-h" className="mt-8">
          <h2 id="classes-h" className="mb-3 text-lg font-semibold text-brand-navy">Classes at a glance</h2>
          <ClassRows rows={rows} admin />
        </section>
      <h2 className="mt-8 text-lg font-semibold text-brand-navy">Everything you can do</h2>
      <div className="mt-6"><ToolFinder /></div>
      {GROUPS.map((g) => {
        const list = areas.filter((a) => groupOf(a.href) === g.key);
        if (!list.length) return null;
        return (
          <section key={g.key} data-tool-group="" className="mt-6">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-500"><span aria-hidden="true" className="text-base">{g.icon}</span>{g.title}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((a) => (
                <Link key={a.href} href={a.href} data-tool={`${a.title} ${a.text}`} className="group block rounded-2xl bg-white p-4 ring-1 ring-slate-200 transition hover:ring-brand-teal">
                  <h4 className="font-semibold text-brand-navy">{a.title}</h4>
                  <p className="mt-1 text-sm text-slate-600">{a.text}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </AppShell>
  );
}

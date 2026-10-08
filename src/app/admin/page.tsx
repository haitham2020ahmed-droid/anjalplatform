import Link from "next/link";
import { listQuestions } from "@/server/admin/questions";
import { countDeletionRequests } from "@/server/admin/question-requests";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";

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
  if (/curriculum-map|\/questions|readmaster|question-bank|\/plans|\/curriculum$/.test(href)) return "content";
  if (/map-rit|map-recommendations|curriculum-results|levels|performance|analytics/.test(href)) return "results";
  if (/users|roster/.test(href)) return "people";
  return "school";
}

export default async function AdminHome() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const areas = [
    { href: "/admin/performance", title: "Teacher & student performance", text: "Every teacher, class and student at a glance: mastery, completion, overdue work, skills that need work.", show: can(actor, "analytics:school") },
    { href: "/admin/users", title: "Users", text: "Students, teachers, parents and admins; classes and parent links.", show: can(actor, "students:manage") || can(actor, "teachers:manage") },
    { href: "/admin/roster", title: "Import users", text: "Add or update many users at once from a CSV or Excel file.", show: can(actor, "students:manage") },
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
  return (
    <AppShell name={String(me.displayName)}>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy via-[#2b3f8f] to-brand-purple p-6 text-white shadow-lg">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-48 w-48 rounded-full bg-brand-teal/30 blur-2xl" />
        <p className="relative text-sm text-white/80">School administration</p>
        <h1 className="relative text-3xl font-extrabold tracking-tight">Welcome, {String(me.displayName).split(" ")[0]} 👋</h1>
      </section>
      {canApprove && (
        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/admin/questions?status=UNDER_REVIEW" className="lift flex items-center justify-between gap-3 rounded-2xl bg-white p-5 ring-1 ring-amber-300">
            <span><span className="block text-lg font-bold text-brand-navy">✅ Questions waiting for approval</span><span className="block text-sm text-slate-600">New questions and teachers’ edits</span></span>
            <span className={`grid h-12 min-w-12 place-items-center rounded-2xl px-3 text-xl font-extrabold ${waiting ? "bg-amber-400 text-brand-navy" : "bg-slate-100 text-slate-400"}`}>{waiting}</span>
          </Link>
          <Link href="/admin/questions/requests" className="lift flex items-center justify-between gap-3 rounded-2xl bg-white p-5 ring-1 ring-red-200">
            <span><span className="block text-lg font-bold text-brand-navy">🗑 Deletion requests</span><span className="block text-sm text-slate-600">Teachers asking to remove a question</span></span>
            <span className={`grid h-12 min-w-12 place-items-center rounded-2xl px-3 text-xl font-extrabold ${deletions ? "bg-red-500 text-white" : "bg-slate-100 text-slate-400"}`}>{deletions}</span>
          </Link>
        </section>
      )}
      {GROUPS.map((g) => {
        const list = areas.filter((a) => groupOf(a.href) === g.key);
        if (!list.length) return null;
        return (
          <section key={g.key} className="mt-8">
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><span aria-hidden="true" className="text-base">{g.icon}</span>{g.title}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((a) => (
                <Link key={a.href} href={a.href} className="lift group block rounded-2xl bg-white p-5 ring-1 ring-slate-200">
                  <h3 className="text-lg font-bold text-brand-navy group-hover:text-brand-purple">{a.title}</h3>
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

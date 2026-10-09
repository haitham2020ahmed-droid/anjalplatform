import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { QuickAddForm } from "./quick-form";

export const metadata = { title: "Quick add students" };

/** ⚡ Students + MAP at the start of the year: by template or by hand, then the plans are made. */
export default async function QuickStudentsPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "students:manage" });
  const me = (await getActor())!.user;
  const [grades, years] = await Promise.all([repo.findMany("Grade", { schoolId: actor.schoolId! }), repo.findMany("AcademicYear", { schoolId: actor.schoolId! })]);
  const year = years.find((y) => y.isCurrent);
  const gradeOf = new Map(grades.map((g) => [String(g.id), Number(g.level)]));
  const classes = (await repo.findMany("Class", { schoolId: actor.schoolId!, deletedAt: null })).filter((c) => !year || c.academicYearId === year.id).map((c) => ({ id: String(c.id), name: String(c.name), grade: gradeOf.get(String(c.gradeId)) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name));
  const step = "rounded-2xl bg-white p-4 ring-1 ring-slate-200";
  const btn = "mt-2 inline-block rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/users", label: "Users" }} icon="⚡" title="Students & MAP Scores"
        subtitle="Add students and their MAP scores with a template (Excel) or by hand. As soon as MAP scores are saved, every student gets an individual plan and each class gets 3-level group plans." />
      <ol className="grid gap-3 md:grid-cols-3 print:hidden">
        <li className={step}><p className="font-bold text-brand-navy">1 · Students</p><p className="text-sm text-slate-600">Template: <b>Import users</b> (one row per student: username, name, number, grade, class). Or by hand: paste the names below.</p><Link href="/admin/roster" className={btn}>📥 Import users (template)</Link></li>
        <li className={step}><p className="font-bold text-brand-navy">2 · MAP scores</p><p className="text-sm text-slate-600">Template: <b>MAP data</b> → download the template (your students are already in it) → fill → import. Or type them in the class table.</p><Link href="/teacher/map-rit" className={btn}>📥 MAP template / import</Link> <Link href="/teacher/map-entry" className={btn}>✏️ Type MAP scores</Link></li>
        <li className={step}><p className="font-bold text-brand-navy">3 · Plans</p><p className="text-sm text-slate-600">Individual plans (one per student) and 3-level group plans (Below · On · Above) — view, edit, send and print.</p><Link href="/teacher/map-plans?tab=plans" className={btn}>📋 Individual plans</Link> <Link href="/teacher/map-plans?tab=levels" className={btn}>🎚 3-level groups</Link></li>
      </ol>
      <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:p-0 print:shadow-none print:ring-0">
        <h2 className="text-xl font-bold text-brand-navy print:hidden">⚡ Quick add students to a class (by hand)</h2>
        <p className="mb-3 mt-1 text-sm text-slate-600 print:hidden">Usernames are made from the names (e.g. <span className="font-mono">omar.alharbi</span>), student numbers AJ26-001 … when you have none, and a temporary password for each. A name already in the class is skipped.</p>
        {classes.length ? <QuickAddForm classes={classes} /> : <p className="text-slate-600">No class yet: create the classes first (Import users creates them).</p>}
      </section>
    </AppShell>
  );
}

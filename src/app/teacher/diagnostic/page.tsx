import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { listDiagnostics, PERIOD_LABEL } from "@/server/diagnostic/test";
import { classGrowth } from "@/server/diagnostic/growth";
import { readableClasses } from "@/server/teacher/coordinators";
import { ClassGrowthPanel } from "@/app/diagnostic/panels";

export const metadata = { title: "Diagnostic Test" };

const tabCls = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-bold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`;

/** 📝 The Diagnostic Tests of the teacher's grades (BOY · MOY · EOY): progress, the class analysis, and growth across the year. */
export default async function TeacherDiagnostic({ searchParams }: { searchParams: Promise<{ tab?: string; grade?: string; classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const tab = sp.tab === "growth" ? "growth" : "tests";
  const classes = await readableClasses(repo, actor);
  const gradeIds = new Set(classes.map((c) => String(c.gradeId)));
  const gradeRows = (await repo.findMany("Grade", { schoolId: actor.schoolId })).filter((g) => gradeIds.has(String(g.id)));
  const grades = gradeRows.map((g) => Number(g.level)).sort((a, b) => a - b);
  const classesOf = (grade: number) => classes.filter((c) => String(c.gradeId) === String(gradeRows.find((g) => Number(g.level) === grade)?.id)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const tests = (await listDiagnostics(repo, actor)).filter((t) => grades.includes(t.grade) && t.status !== "DRAFT");
  const grade = grades.includes(Number(sp.grade)) ? Number(sp.grade) : grades[0];
  let growth = null; let growthError: string | null = null;
  if (tab === "growth" && grade) {
    try { growth = await classGrowth(repo, actor, { grade, classId: sp.classId || null }); }
    catch (e) { if (!(e instanceof ForbiddenError)) throw e; growthError = e.message; }
  }
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="📝" title="Diagnostic Test" subtitle="Three times a year (beginning, middle and end of year): who finished, the class analysis with benchmark categories, each student’s report, and growth across the year." />
      <nav aria-label="Diagnostic views" className="mb-5 flex flex-wrap gap-2">
        <Link href="/teacher/diagnostic" aria-current={tab === "tests" ? "page" : undefined} className={tabCls(tab === "tests")}>📝 Tests</Link>
        <Link href={`/teacher/diagnostic?tab=growth${grade ? `&grade=${grade}` : ""}`} aria-current={tab === "growth" ? "page" : undefined} className={tabCls(tab === "growth")}>📈 Growth</Link>
        <Link href="/teacher/strategy-groups" className={tabCls(false)}>🧭 Reading Strategy Groups</Link>
      </nav>
      {tab === "growth" ? (
        <>
          <nav aria-label="Grade and class" className="mb-5 flex flex-wrap gap-2">
            {grades.map((g) => classesOf(g).map((c) => { const on = growth?.classId === String(c.id); return <Link key={String(c.id)} href={`/teacher/diagnostic?tab=growth&grade=${g}&classId=${c.id}`} aria-current={on ? "page" : undefined} className={tabCls(on)}>{String(c.name)}</Link>; }))}
          </nav>
          {growthError ? <p className="text-slate-700">{growthError}</p> : growth ? <ClassGrowthPanel g={growth} /> : <p className="text-slate-700">You have no class yet.</p>}
        </>
      ) : !tests.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No Diagnostic Test is open for your grade yet. The school admin opens it at the start, middle and end of the year.</p> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {tests.map((t) => (
            <li key={t.id} className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-purple">{t.period} · {PERIOD_LABEL[t.period]}{t.form === "focus" ? " · focus form" : ""}</p>
              <p className="text-lg font-bold text-brand-navy">📝 {t.title}</p>
              <p className="text-sm text-slate-600">{t.status === "OPEN" ? "Open" : "Closed"} · {t.questions} questions{t.closesAt ? ` · closes ${t.closesAt}` : ""}</p>
              <div className="mt-3 flex items-center gap-3"><div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-teal" style={{ width: `${t.students ? Math.round((100 * t.finished) / t.students) : 0}%` }} /></div><span className="text-sm font-semibold tabular-nums text-slate-700">{t.finished}/{t.students} finished (grade)</span></div>
              <div className="mt-4 flex flex-wrap gap-2">{classesOf(t.grade).map((c) => <Link key={String(c.id)} href={`/diagnostic/${t.id}/report?classId=${c.id}`} className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-bold text-white hover:bg-brand-purple">📊 {String(c.name)} analysis</Link>)}</div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}

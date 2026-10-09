import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { listDiagnostics } from "@/server/diagnostic/test";
import { readableClasses } from "@/server/teacher/coordinators";

export const metadata = { title: "Diagnostic Test" };

/** 📝 The Diagnostic Tests of the teacher's grades: progress and the class analysis. */
export default async function TeacherDiagnostic() {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const classes = await readableClasses(repo, actor);
  const gradeIds = new Set(classes.map((c) => String(c.gradeId)));
  const gradeRows = (await repo.findMany("Grade", { schoolId: actor.schoolId })).filter((g) => gradeIds.has(String(g.id)));
  const grades = gradeRows.map((g) => Number(g.level));
  const classesOf = (grade: number) => classes.filter((c) => String(c.gradeId) === String(gradeRows.find((g) => Number(g.level) === grade)?.id)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const tests = (await listDiagnostics(repo, actor)).filter((t) => grades.includes(t.grade) && t.status !== "DRAFT");
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="📝" title="Diagnostic Test" subtitle="The beginning-of-year test of your grade: who finished, the full class analysis with a support plan, and each student’s report to send home." />
      {!tests.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No Diagnostic Test is open for your grade yet. The school admin opens it at the start of the year.</p> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {tests.map((t) => (
            <li key={t.id} className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
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

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { listDiagnostics, schoolYear } from "@/server/diagnostic/test";
import { buildDiagnosticAction } from "@/app/diagnostic/actions";

export const metadata = { title: "Diagnostic Test" };
const STATUS: Record<string, string> = { DRAFT: "bg-amber-100 text-amber-900", OPEN: "bg-emerald-100 text-emerald-900", CLOSED: "bg-slate-200 text-slate-700" };

/** 📝 The beginning-of-year Diagnostic Test of each grade: build, review, open, follow, report. */
export default async function AdminDiagnostic({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [tests, grades] = await Promise.all([listDiagnostics(repo, actor), repo.findMany("Grade", { schoolId: actor.schoolId })]);
  const levels = grades.filter((g) => g.isActive !== false).map((g) => Number(g.level)).sort((a, b) => a - b);
  const year = schoolYear();
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="📝" title="Diagnostic Test"
        subtitle="One real test at the start of the year for each grade (about 50 questions covering every strand and standard). It finds each student’s strengths and needs, sets their level, and gives every teacher a full analysis with a support plan." />
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <Section title={`Build a Test · ${year}`} icon="🛠️" hint="The platform picks the questions from the Question Bank, Curriculum Map and ReadMaster: Literature, Informational Text, Vocabulary and Grammar & Conventions, every standard in turn, easy to hard. You review it before it opens." className="mb-6">
        <form action={buildDiagnosticAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Grade<select name="grade" className="rounded-xl border border-slate-300 px-3 py-2">{levels.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">Questions<input type="number" name="size" min={20} max={60} defaultValue={50} className="w-24 rounded-xl border border-slate-300 px-3 py-2" /></label>
          <button className="rounded-xl bg-brand-navy px-6 py-2.5 font-bold text-white hover:bg-brand-purple">🛠️ Build the test</button>
          <p className="text-xs text-slate-500">Building again (while it is a draft) picks a fresh set.</p>
        </form>
      </Section>
      <Section title="Tests" icon="📋">
        {!tests.length ? <p className="text-slate-600">No test yet. Build one above.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-2 pe-3">Test</th><th className="px-3">Status</th><th className="px-3">Questions</th><th className="px-3">Window</th><th className="px-3">Finished</th><th className="px-3" /></tr></thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-3 pe-3"><Link href={`/admin/diagnostic/${t.id}`} className="font-semibold text-brand-navy hover:underline">{t.title}</Link></td>
                    <td className="px-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[t.status] ?? ""}`}>{t.status === "DRAFT" ? "Draft — review" : t.status === "OPEN" ? "Open" : "Closed"}</span></td>
                    <td className="px-3 tabular-nums">{t.questions}</td>
                    <td className="px-3 text-slate-600">{t.opensAt ?? "—"}{t.closesAt ? ` → ${t.closesAt}` : ""}</td>
                    <td className="px-3"><span className="flex items-center gap-2"><span className="block h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-brand-teal" style={{ width: `${t.students ? Math.round((100 * t.finished) / t.students) : 0}%` }} /></span><span className="tabular-nums">{t.finished}/{t.students}</span></span></td>
                    <td className="px-3 text-end">{t.status !== "DRAFT" && <Link href={`/diagnostic/${t.id}/report`} className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-purple">📊 Analysis</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </AppShell>
  );
}

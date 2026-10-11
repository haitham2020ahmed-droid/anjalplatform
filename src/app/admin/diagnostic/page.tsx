import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { diagnosticReadiness, listDiagnostics, schoolYear } from "@/server/diagnostic/test";
import { STRAND_LABEL } from "@/server/diagnostic/standards";
import { buildAllDiagnosticsAction, buildDiagnosticAction } from "@/app/diagnostic/actions";

export const metadata = { title: "Diagnostic Test" };
const STATUS: Record<string, string> = { DRAFT: "bg-amber-100 text-amber-900", OPEN: "bg-emerald-100 text-emerald-900", CLOSED: "bg-slate-200 text-slate-700" };

/** 📝 The beginning-of-year Diagnostic Test of each grade: build, review, open, follow, report. */
export default async function AdminDiagnostic({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [tests, grades, ready] = await Promise.all([listDiagnostics(repo, actor), repo.findMany("Grade", { schoolId: actor.schoolId }), diagnosticReadiness(repo, actor)]);
  const levels = grades.filter((g) => g.isActive !== false).map((g) => Number(g.level)).sort((a, b) => a - b);
  const year = schoolYear();
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="📝" title="Diagnostic Test"
        subtitle="Three times a year (beginning, middle and end): 50 questions on the same skills for every grade, adaptive — each right answer brings a harder question, each wrong one an easier one, across grades. It finds each student’s reading level in every skill and MAP goal area, sets their level, estimates their MAP RIT, and gives every teacher a full analysis. The two MAP tests later in the year show the growth." />
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <Section title={`Build the Tests · ${year}`} icon="🛠️" hint="The questions come from the Question Bank, Curriculum Map and ReadMaster (published, marked by the platform), from two grades below to two grades above. You review each test before it opens." className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <Link href="/diagnostic/build" className="rounded-xl px-4 py-2.5 text-sm font-bold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🗓️ Middle / End of Year test (full or focus form)</Link>
          <form action={buildAllDiagnosticsAction}><button className="rounded-xl bg-brand-navy px-6 py-2.5 font-bold text-white hover:bg-brand-purple">🛠️ Build for every grade (the same 50 skills)</button></form>
          <form action={buildDiagnosticAction} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">One grade<select name="grade" className="rounded-xl border border-slate-300 px-3 py-2">{levels.map((g) => <option key={g} value={g}>Grade {g}</option>)}</select></label>
            <button className="rounded-xl px-4 py-2.5 text-sm font-bold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Build</button>
          </form>
          <p className="text-xs text-slate-500">Building again (while a test is a draft) uses the bank as it is now.</p>
        </div>
      </Section>

      <Section title="Is the Question Bank Ready?" icon="🧮" className="mb-6" hint="Each skill slot needs questions easier, on and harder than the grade, so the test can follow every student. Ready = every slot can be filled · Strong = 3 questions per slot spread over the three difficulties.">
        <div className="mb-3 flex flex-wrap gap-2">
          {ready.grades.map((g) => <span key={g.grade} className={`rounded-full px-3 py-1 text-sm font-bold ${g.strong ? "bg-emerald-100 text-emerald-900" : g.ready ? "bg-sky-100 text-sky-900" : "bg-rose-100 text-rose-900"}`}>Grade {g.grade}: {g.strong ? "Strong" : g.ready ? "Ready" : "Not ready"} · {g.pool} questions{g.short.length ? ` · add ${g.short.join(", ")}` : ""}</span>)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-2 pe-2">Skill (slots)</th>{ready.grades.map((g) => <th key={g.grade} className="px-2 text-center">Grade {g.grade}<span className="block font-normal">easier · on · harder</span></th>)}</tr></thead>
            <tbody>{ready.blueprint.map((b) => (
              <tr key={b.anchor} className="border-b border-slate-100">
                <td className="py-1.5 pe-2"><b className="font-mono text-brand-teal">{b.anchor}</b> {b.label} <span className="text-slate-500">· {STRAND_LABEL[b.strand]} · {b.slots}</span></td>
                {ready.grades.map((g) => { const x = g.anchors.find((y) => y.anchor === b.anchor)!; const ok = x.easier + x.on + x.harder >= 3 * x.slots && x.easier && x.on && x.harder; const some = x.easier + x.on + x.harder >= x.slots; return <td key={g.grade} className={`px-2 text-center tabular-nums ${ok ? "bg-emerald-50" : some ? "bg-amber-50" : "bg-rose-50 font-bold text-rose-800"}`}>{x.easier} · {x.on} · {x.harder}</td>; })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Section>
      <Section title="Tests" icon="📋">
        {!tests.length ? <p className="text-slate-600">No test yet. Build one above.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-2 pe-3">Test</th><th className="px-3">Status</th><th className="px-3">Questions</th><th className="px-3">Pool</th><th className="px-3">Window</th><th className="px-3">Finished</th><th className="px-3" /></tr></thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-3 pe-3"><Link href={`/admin/diagnostic/${t.id}`} className="font-semibold text-brand-navy hover:underline">{t.title}</Link></td>
                    <td className="px-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS[t.status] ?? ""}`}>{t.status === "DRAFT" ? "Draft — review" : t.status === "OPEN" ? "Open" : "Closed"}</span></td>
                    <td className="px-3 tabular-nums">{t.questions}{t.adaptive ? " · adaptive" : ""}</td>
                    <td className="px-3 tabular-nums text-slate-600">{t.adaptive ? t.pool : "—"}</td>
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

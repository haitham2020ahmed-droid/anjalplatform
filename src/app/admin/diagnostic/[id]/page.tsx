import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { diagnosticQuestions } from "@/server/diagnostic/test";
import { STRAND_LABEL } from "@/server/diagnostic/standards";
import { closeDiagnosticAction, openDiagnosticAction, swapQuestionAction } from "@/app/diagnostic/actions";

export const metadata = { title: "Diagnostic Test" };
const LV = (n: number) => (n <= 3 ? "Below" : n === 4 ? "On" : "Above");

/** One grade's test: what it covers, every question (swap any while it is a draft), open / close. */
export default async function DiagnosticDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { id } = await params;
  const sp = await searchParams;
  const v = await diagnosticQuestions(repo, actor, id);
  const t = v.test;
  const draft = t.status === "DRAFT";
  const box = "rounded-xl border border-slate-300 px-3 py-2";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/diagnostic", label: "Diagnostic Test" }} icon="📝" title={t.title} subtitle={`${t.questions} questions · ${draft ? "Draft: review the questions, then open the test" : t.status === "OPEN" ? `Open · ${t.finished}/${t.students} finished` : "Closed"}`}>
        {!draft && <Link href={`/diagnostic/${id}/report`} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">📊 Analysis</Link>}
      </PageHeader>
      {sp.msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Section title="Strands" icon="🧱">
          <ul className="space-y-2 text-sm">{v.byStrand.map((x) => <li key={x.strand} className="flex items-center justify-between gap-2"><span>{STRAND_LABEL[x.strand]}</span><span className="flex items-center gap-2"><span className="block h-2 w-24 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-brand-teal" style={{ width: `${Math.round((100 * x.n) / Math.max(1, t.questions))}%` }} /></span><b className="w-6 text-end tabular-nums">{x.n}</b></span></li>)}</ul>
        </Section>
        <Section title={`Standards (${v.byStandard.length})`} icon="🎯" className="lg:col-span-2">
          <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">{v.byStandard.map((x) => <li key={x.code} className="flex justify-between gap-2"><span><b className="font-mono text-xs text-brand-teal">{x.code}</b> {x.label}</span><span className="tabular-nums text-slate-600">{x.n}</span></li>)}</ul>
        </Section>
      </div>
      {t.status !== "CLOSED" && (
        <Section title={draft ? "Open the Test" : "Test Window & Levels"} icon="🚀" tone="emerald" className="mb-6" hint={draft ? "Every class of the grade gets the test; students are notified. Questions cannot change after this." : "Change the dates or the level bands, or close the test."}>
          <form action={openDiagnosticAction} className="flex flex-wrap items-end gap-3 text-sm">
            <input type="hidden" name="id" value={id} />
            <label className="flex flex-col gap-1 font-semibold text-slate-700">Opens<input type="date" name="opensAt" defaultValue={t.opensAt ?? ""} className={box} /></label>
            <label className="flex flex-col gap-1 font-semibold text-slate-700">Closes (optional)<input type="date" name="closesAt" defaultValue={t.closesAt ?? ""} className={box} /></label>
            <label className="flex flex-col gap-1 font-semibold text-slate-700">Above Level from<span className="flex items-center gap-1"><input type="number" name="above" min={50} max={100} defaultValue={t.bands.above} className={`${box} w-20`} />%</span></label>
            <label className="flex flex-col gap-1 font-semibold text-slate-700">On Level from<span className="flex items-center gap-1"><input type="number" name="on" min={20} max={99} defaultValue={t.bands.on} className={`${box} w-20`} />%</span></label>
            <button className="rounded-xl bg-emerald-600 px-6 py-2.5 font-bold text-white hover:bg-emerald-700">{draft ? "🚀 Open the test" : "Save"}</button>
          </form>
          {!draft && <form action={closeDiagnosticAction} className="mt-3"><input type="hidden" name="id" value={id} /><button className="rounded-xl px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-50">Close the test</button></form>}
          <p className="mt-2 text-xs text-slate-600">Below Level: under {t.bands.on}% · On Level: {t.bands.on}–{t.bands.above - 1}% · Above Level: {t.bands.above}% and over. The result sets each student’s starting level everywhere on the platform.</p>
        </Section>
      )}
      <Section title="Questions" icon="❓" hint={draft ? "Not happy with a question? 🔄 Swap gives another question of the same standard." : undefined}>
        <ol className="divide-y divide-slate-100">
          {v.questions.map((q) => (
            <li key={q.id} className="flex flex-wrap items-start gap-3 py-2.5 text-sm">
              <span className="w-8 shrink-0 pt-0.5 text-end font-semibold tabular-nums text-slate-400">{q.n}</span>
              <span className="min-w-0 flex-1"><span className="block text-slate-900">{q.stem}</span><span className="mt-0.5 block text-xs text-slate-500"><b className="font-mono text-brand-teal">{q.area.code}</b> {q.area.label} · {STRAND_LABEL[q.area.strand]} · {LV(q.level)} · {q.type}</span></span>
              <Link href={`/admin/questions/${q.id}`} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">👁 Open</Link>
              {draft && <form action={swapQuestionAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="questionId" value={q.id} /><input type="hidden" name="n" value={q.n} /><button className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200">🔄 Swap</button></form>}
            </li>
          ))}
        </ol>
      </Section>
    </AppShell>
  );
}

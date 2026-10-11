import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { MAP_AREAS } from "@/server/map/nwea-area";
import { classificationPreview, savedCounts, standardFixes } from "@/server/map/question-areas";
import { applyClassificationAction, reviewFixesAction } from "./actions";

export const metadata = { title: "MAP Classification" };

/**
 * 🧭 The question bank on NWEA MAP Growth: every question's MAP test and instructional area. Preview first (nothing
 * saved), download the backup, then Apply. Standards read from the wording wait here for an admin.
 */
export default async function MapClassificationPage({ searchParams }: { searchParams: Promise<{ tab?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const tab = sp.tab === "preview" || sp.tab === "review" || sp.tab === "fixed" ? sp.tab : "now";
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const card = "rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200";
  const btn = "rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  const head = <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2">Grade</th>{MAP_AREAS.map((a) => <th key={a.key} className="px-2" title={a.name}>{a.test === "Reading" ? "📖" : "✍️"} {a.short}</th>)}<th className="px-2">Not classified</th><th className="px-2">Total</th></tr>;
  const saved = tab === "now" ? await savedCounts(repo, actor) : [];
  const savedGrades = [...new Set(saved.map((r) => r.grade))].sort((a, b) => (a ?? 99) - (b ?? 99));
  const pv = tab === "preview" ? await classificationPreview(repo, actor) : null;
  const fixes = tab === "review" ? await standardFixes(repo, actor, "SUGGESTED") : tab === "fixed" ? await standardFixes(repo, actor, "APPLIED") : null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/questions", label: "Question Bank" }} icon="🧭" title="MAP Classification"
        subtitle="Every question of the bank (Question Bank, Grammar, Curriculum Map, ReadMaster, Diagnostic) with its NWEA MAP test and instructional area, decided from its CCSS standard as in NWEA’s Learning Continuum. Preview first — nothing is saved — then download the backup and Apply. No question is ever deleted." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/map-classification" className={chip(tab === "now")}>📊 Saved now</Link>
        <Link href="/admin/map-classification?tab=preview" className={chip(tab === "preview")}>👀 Preview & Apply</Link>
        <Link href="/admin/map-classification?tab=review" className={chip(tab === "review")}>📝 Standards to check</Link>
        <Link href="/admin/map-classification?tab=fixed" className={chip(tab === "fixed")}>🔧 Standards fixed</Link>
      </nav>

      {tab === "now" && (
        <section className={card}>
          <h2 className="text-lg font-bold text-brand-navy">Questions per instructional area (saved)</h2>
          <div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm"><thead>{head}</thead><tbody>
            {savedGrades.map((g) => { const rows = saved.filter((r) => r.grade === g); const n = (name: string) => rows.find((r) => r.area === name)?.n; return (
              <tr key={String(g)} className="border-b last:border-0"><td className="py-1.5 font-semibold">{g ? `Grade ${g}` : "No grade"}</td>{MAP_AREAS.map((a) => <td key={a.key} className="px-2 tabular-nums">{n(a.name) ?? 0}</td>)}<td className={`px-2 tabular-nums ${n("Not classified") ? "font-bold text-amber-700" : ""}`}>{n("Not classified") ?? 0}</td><td className="px-2 font-bold tabular-nums">{rows.reduce((t, r) => t + r.n, 0)}</td></tr>
            ); })}
          </tbody></table></div>
          <p className="mt-3 text-sm text-slate-600">Filter the bank by area: <Link href="/admin/questions?status=PUBLISHED&area=NONE" className="font-semibold text-brand-teal underline">not classified yet</Link> · <Link href="/admin/questions?status=DRAFT&aicheck=1" className="font-semibold text-brand-teal underline">✨ AI filled · check</Link></p>
        </section>
      )}

      {pv && (
        <>
          <section className={card}>
            <h2 className="text-lg font-bold text-brand-navy">1 · What Apply would save (nothing saved yet)</h2>
            <div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm"><thead>{head}</thead><tbody>
              {Object.entries(pv.preview.counts).sort((a, b) => a[0].localeCompare(b[0])).map(([g, c]) => (
                <tr key={g} className="border-b last:border-0"><td className="py-1.5 font-semibold">{g === "?" ? "No grade" : `Grade ${g}`}</td>{MAP_AREAS.map((a) => <td key={a.key} className="px-2 tabular-nums">{c[a.key] ?? 0}</td>)}<td className={`px-2 tabular-nums ${c.NONE ? "font-bold text-amber-700" : ""}`}>{c.NONE ?? 0}</td><td className="px-2 font-bold tabular-nums">{Object.values(c).reduce((t, x) => t + x, 0)}</td></tr>
              ))}
            </tbody></table></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-5">
              {[["Questions", pv.preview.total], ["Area changes", pv.preview.changed], ["Standards fixed", pv.preview.fixes.length], ["Standards to check", pv.preview.suggestions.length], ["Not classified", pv.preview.unclassified.length]].map(([k, v]) => <div key={String(k)} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200"><p className="text-xs text-slate-500">{k}</p><p className="text-2xl font-extrabold tabular-nums text-brand-navy">{v}</p></div>)}
            </div>
            <p className="mt-2 text-xs text-slate-500">{pv.preview.kept} question(s) keep the area an admin or the import file gave. {pv.preview.byText} decided from the wording only (their standard waits in “Standards to check”).</p>
            <div className="mt-3 flex flex-wrap gap-2"><a href="/api/map-classification?kind=preview" className={btn}>⬇️ Preview as a sheet (every question)</a></div>
          </section>
          {pv.preview.fixes.length > 0 && (
            <section className={`${card} mt-4`}>
              <h2 className="font-bold text-brand-navy">🔧 Standards Apply will fix ({pv.preview.fixes.length})</h2>
              <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-sm">{pv.preview.fixes.slice(0, 200).map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1"><span className="text-slate-700">G{r.grade} · {r.stem.slice(0, 90)}</span><span className="text-xs"><b>{r.fix!.from ?? "—"} → {r.fix!.to}</b> · {r.fix!.reason}</span></li>)}</ul>
            </section>
          )}
          {pv.preview.unclassified.length > 0 && (
            <section className={`${card} mt-4 ring-amber-200`}>
              <h2 className="font-bold text-amber-900">⚠️ Not classified ({pv.preview.unclassified.length})</h2>
              <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-sm">{pv.preview.unclassified.slice(0, 200).map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-1"><Link href={`/admin/questions/${r.id}`} className="text-brand-navy hover:underline">{r.grade ? `G${r.grade} · ` : ""}{r.stem.slice(0, 100)}</Link><span className="text-xs text-amber-800">{r.note}</span></li>)}</ul>
            </section>
          )}
          <form action={applyClassificationAction} className={`${card} mt-4 ring-emerald-200`}>
            <h2 className="text-lg font-bold text-brand-navy">2 · Backup, then Apply</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <a href="/api/map-classification?kind=backup" className={btn}>💾 Download the backup (every question now)</a>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="backup" value="1" /> I downloaded the backup</label>
              <button className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700">✅ Apply to the whole bank</button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Apply saves the areas and fixes only the clearly wrong standards (the old one is kept in “Standards fixed”). Standards read from the wording are only suggested. You can run it again any time; areas set by hand stay.</p>
          </form>
        </>
      )}

      {fixes && (
        <form action={reviewFixesAction} className={card}>
          <h2 className="text-lg font-bold text-brand-navy">{tab === "review" ? `📝 Suggested standards to check (${fixes.total})` : `🔧 Standards fixed automatically (${fixes.total})`}</h2>
          <p className="text-sm text-slate-600">{tab === "review" ? "Read from the question's wording. Approve: the question takes the standard (and its MAP area). Reject: it keeps its standard." : "The old standard of each question is kept here."}</p>
          <div className="mt-3 overflow-x-auto"><table className="min-w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">{tab === "review" && <th className="py-2"><span className="sr-only">Tick</span></th>}<th className="py-2">Question</th><th>Grade</th><th>Skill</th><th>From</th><th>To</th><th>Why</th></tr></thead>
            <tbody>{fixes.rows.map((r) => (
              <tr key={r.id} className="border-b align-top last:border-0">
                {tab === "review" && <td className="py-1.5 pe-2"><input type="checkbox" name="fix" value={r.id} aria-label={`Tick: ${r.stem.slice(0, 40)}`} /></td>}
                <td className="max-w-md py-1.5"><Link href={`/admin/questions/${r.questionId}`} className="text-brand-navy hover:underline">{r.stem}</Link></td>
                <td>{r.grade ?? "—"}</td><td className="text-xs">{r.skill}</td><td className="font-mono text-xs">{r.from ?? "—"}</td><td className="font-mono text-xs font-bold">{r.to}</td><td className="text-xs text-slate-600">{r.reason}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {!fixes.rows.length && <p className="mt-3 text-slate-600">Nothing here.</p>}
          {tab === "review" && fixes.rows.length > 0 && <div className="mt-3 flex gap-2"><button name="op" value="approve" className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white">✅ Approve ticked</button><button name="op" value="reject" className="rounded-xl bg-white px-4 py-2 font-semibold text-red-700 ring-1 ring-red-200">Reject ticked</button></div>}
        </form>
      )}
    </AppShell>
  );
}

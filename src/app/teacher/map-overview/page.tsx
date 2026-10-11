import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { cutScores, QUINTILES, schoolOverview, SUBJECT_NAME, type OverviewRow } from "@/server/map/nwea-reports";
import { Q_COLORS } from "@/components/map/nwea-charts";
import { saveCutScoresAction } from "./actions";

export const metadata = { title: "MAP School Overview" };
const sign = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v}`);

/** 🏫 MAP overview: every grade and class side by side (a teacher sees their own classes). */
export default async function MapOverview({ searchParams }: { searchParams: Promise<{ subject?: string; term?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const subject = sp.subject === "LANGUAGE" ? "LANGUAGE" : "READING";
  const d = await schoolOverview(repo, actor, subject, sp.term);
  const admin = actor.role !== "TEACHER";
  const cuts = admin ? await cutScores(repo, String(actor.schoolId)) : null;
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-300 hover:ring-brand-teal"}`;
  const link = (p: Record<string, string>) => `/teacher/map-overview?${new URLSearchParams({ subject, ...(d.term ? { term: d.term } : {}), ...p })}`;
  const Table = ({ rows, title }: { rows: OverviewRow[]; title: string }) => (
    <section className="mt-5 overflow-x-auto rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-bold text-brand-navy">{title}</h2>
      <table className="mt-3 min-w-full text-sm">
        <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-1.5">{title === "By grade" ? "Grade" : "Class"}</th><th>Tested</th><th>Mean RIT</th><th>National</th><th>Diff</th><th>Median %ile</th><th className="min-w-56">Percentile bands</th><th>Growth</th><th>Met</th><th>Flags</th></tr></thead>
        <tbody>{rows.map((r) => {
          const tot = r.quintiles.reduce((t, c) => t + c, 0) || 1, diff = r.meanRit !== null && r.national !== null ? Math.round((r.meanRit - r.national) * 10) / 10 : null;
          return (
            <tr key={r.className} className="border-b last:border-0">
              <td className="py-1.5 font-semibold">{r.classId ? <Link className="text-brand-navy hover:underline" href={`/map-report/class/${r.classId}/profile?${new URLSearchParams({ subject, term: d.term })}`}>{r.className}</Link> : r.className}</td>
              <td className="tabular-nums">{r.n}</td><td className="tabular-nums font-bold">{r.meanRit ?? "—"}</td><td className="tabular-nums text-slate-500">{r.national ?? "—"}</td>
              <td className={`tabular-nums ${diff !== null && diff < 0 ? "text-red-700" : "text-emerald-700"}`}>{sign(diff)}</td><td className="tabular-nums">{r.medianPct ?? "—"}</td>
              <td><div className="flex h-4 overflow-hidden rounded-full bg-slate-100" title={r.quintiles.map((c, i) => `${QUINTILES[i]}: ${c}`).join(" · ")}>{r.quintiles.map((c, i) => c ? <div key={i} style={{ width: `${(100 * c) / tot}%`, background: Q_COLORS[i] }} /> : null)}</div></td>
              <td className="tabular-nums">{sign(r.meanGrowth)}</td><td className="tabular-nums">{r.pctMet !== null ? `${r.pctMet}%` : "—"}</td><td className={`tabular-nums ${r.flagged ? "text-red-700" : "text-slate-400"}`}>{r.flagged}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </section>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="🏫" title={`MAP Overview · ${SUBJECT_NAME[subject]}`}
        subtitle="Every grade and class side by side: mean RIT against the national mean, the percentile bands, growth and tests to check. Open a class for its Class Profile." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {(["READING", "LANGUAGE"] as const).map((x) => <Link key={x} href={link({ subject: x })} className={chip(x === subject)}>{x === "READING" ? "📖 Reading" : "✍️ Language Usage"}</Link>)}
        <span className="mx-1 h-6 w-px bg-slate-300" />
        {d.terms.slice(0, 6).map((t) => <Link key={t} href={link({ term: t })} className={chip(t === d.term)}>{t}</Link>)}
        <span className="ms-auto"><PrintButton /></span>
      </div>
      {!d.term ? <p className="mt-5 rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No MAP results yet.</p> : <><Table rows={d.grades} title="By grade" /><Table rows={d.classes} title="By class" /></>}
      <p className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">{QUINTILES.map((q, i) => <span key={q} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: Q_COLORS[i] }} />{q}</span>)}</p>
      {cuts && (
        <form action={saveCutScoresAction} className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-slate-200 print:hidden">
          <h2 className="text-lg font-bold text-brand-navy">🎯 Proficiency cut scores (Spring RIT)</h2>
          <p className="text-sm text-slate-600">Used for “projected proficiency” when the NWEA data file does not include it: a student whose Spring goal reaches the cut is projected proficient. Leave empty to not show it.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(["READING", "LANGUAGE"] as const).map((sj) => (
              <fieldset key={sj} className="rounded-2xl p-3 ring-1 ring-slate-200"><legend className="px-1 text-sm font-semibold">{SUBJECT_NAME[sj]}</legend>
                <div className="flex flex-wrap gap-3">{[3, 4, 5, 6, 7].map((g) => <label key={g} className="text-sm">Grade {g}<input name={`cut:${sj}:${g}`} defaultValue={cuts[sj][g] ?? ""} inputMode="numeric" className="mt-1 block w-20 rounded-lg border border-slate-300 px-2 py-1 text-center" /></label>)}</div>
              </fieldset>
            ))}
          </div>
          <button className="mt-3 rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">💾 Save</button>
        </form>
      )}
    </AppShell>
  );
}

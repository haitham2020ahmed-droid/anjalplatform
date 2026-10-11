import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AtAGlance, Callout, ReportHeader, ReportSection, ReportTable } from "@/components/report-kit";
import { getT } from "@/i18n/server";
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
  const { t } = await getT();
  const cuts = admin ? await cutScores(repo, String(actor.schoolId)) : null;
  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-300 hover:ring-brand-teal"}`;
  const link = (p: Record<string, string>) => `/teacher/map-overview?${new URLSearchParams({ subject, ...(d.term ? { term: d.term } : {}), ...p })}`;
  const Table = ({ rows, title }: { rows: OverviewRow[]; title: string }) => (
    <ReportSection title={title} icon={title === "By grade" ? "🏫" : "👥"}>
      <ReportTable label={title}
        cols={[{ key: "c", label: title === "By grade" ? "Grade" : "Class" }, { key: "n", label: "Tested", num: true }, { key: "m", label: "Mean RIT", num: true }, { key: "nat", label: "National", num: true }, { key: "d", label: "Diff", num: true }, { key: "p", label: "Median %ile", num: true }, { key: "q", label: "Percentile bands", sort: false, className: "min-w-56" }, { key: "g", label: "Growth", num: true }, { key: "met", label: "Met", num: true }, { key: "f", label: "Flags", num: true }]}
        rows={rows.map((r) => {
          const tot = r.quintiles.reduce((t, c) => t + c, 0) || 1, diff = r.meanRit !== null && r.national !== null ? Math.round((r.meanRit - r.national) * 10) / 10 : null;
          return {
            id: r.className, flag: diff !== null && diff < 0 ? "warn" as const : undefined, sort: { c: r.className, m: r.meanRit, d: diff, p: r.medianPct, g: r.meanGrowth, met: r.pctMet, f: r.flagged },
            cells: {
              c: r.classId ? <Link className="text-brand-navy hover:underline" href={`/map-report/class/${r.classId}/profile?${new URLSearchParams({ subject, term: d.term })}`}>{r.className}</Link> : r.className,
              n: r.n, m: <b>{r.meanRit ?? "—"}</b>, nat: <span className="text-slate-500">{r.national ?? "—"}</span>,
              d: <span className={diff !== null && diff < 0 ? "text-red-700" : "text-emerald-700"}>{diff !== null && diff < 0 ? "▼ " : diff !== null && diff > 0 ? "▲ " : ""}{sign(diff)}</span>, p: r.medianPct ?? "—",
              q: <div className="flex h-4 min-w-40 overflow-hidden rounded-full bg-slate-100" dir="ltr" role="img" aria-label={r.quintiles.map((c, i) => `${QUINTILES[i]}: ${c}`).join(" · ")} title={r.quintiles.map((c, i) => `${QUINTILES[i]}: ${c}`).join(" · ")}>{r.quintiles.map((c, i) => c ? <div key={i} style={{ width: `${(100 * c) / tot}%`, background: Q_COLORS[i] }} /> : null)}</div>,
              g: sign(r.meanGrowth), met: r.pctMet !== null ? `${r.pctMet}%` : "—", f: <span className={r.flagged ? "text-red-700" : "text-slate-400"}>{r.flagged}</span>,
            },
          };
        })} />
      <p className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">{QUINTILES.map((q, i) => <span key={q} className="inline-flex items-center gap-1"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: Q_COLORS[i] }} />{q}</span>)}</p>
    </ReportSection>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="🏫" title={`MAP Overview · ${SUBJECT_NAME[subject]}`}
        subtitle="Every grade and class side by side: mean RIT against the national mean, the percentile bands, growth and tests to check. Open a class for its Class Profile."
        who={admin ? t("Whole school") : t("My classes")} when={d.term || undefined}
        filters={<div className="flex flex-wrap items-center gap-2">
          {(["READING", "LANGUAGE"] as const).map((x) => <Link key={x} href={link({ subject: x })} className={chip(x === subject)}>{x === "READING" ? "📖 Reading" : "✍️ Language Usage"}</Link>)}
          <span className="mx-1 h-6 w-px bg-slate-300" />
          {d.terms.slice(0, 6).map((tm) => <Link key={tm} href={link({ term: tm })} className={chip(tm === d.term)}>{tm}</Link>)}
        </div>} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {!d.term ? <p className="mt-5 rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No MAP results yet.</p> : (
        <>
          <AtAGlance items={[
            { icon: "🧪", label: "Tested", value: d.grades.reduce((n, r) => n + r.n, 0), meaning: "students with a score this term" },
            { icon: "📉", label: "Below the national mean", value: d.classes.filter((r) => r.meanRit !== null && r.national !== null && r.meanRit < r.national).length, meaning: t("of {n} classes", { n: d.classes.length }), tone: d.classes.some((r) => r.meanRit !== null && r.national !== null && r.meanRit < r.national) ? "warn" : "good" },
            { icon: "🚩", label: "Flags", value: d.grades.reduce((n, r) => n + r.flagged, 0), meaning: "tests to check (retest flags)", tone: d.grades.some((r) => r.flagged) ? "warn" : "neutral" },
          ]} />
          <Callout kind="meaning" className="mb-5" items={[t("Diff = the class mean RIT minus the national mean: ▼ below, ▲ above."), t("Percentile bands show how many students are in each fifth of the national scores.")]} />
          <Table rows={d.grades} title="By grade" /><Table rows={d.classes} title="By class" />
        </>
      )}
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

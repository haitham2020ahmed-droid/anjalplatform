import Link from "next/link";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { nafsClasses } from "@/server/nafs/tests";
import { dashboardDownload, groupOf, GROUP_NAME, nafsDashboardCached, studentHref, type Dashboard } from "@/server/nafs/dashboard";
import { centerHref } from "@/server/nafs/center";
import { ClassLineCards, LineCells, LineHeads } from "./student-line";
import { PrintButton } from "@/components/plans/print-button";
import { Combo } from "@/components/ui/combo";
import { DashboardTab, Delta, GROUP_CLS, Pc } from "./dashboard-tab";
import { LineChart, Sparkline } from "./charts";
import { Card, PctBar } from "./sub-nav";
import { CompareView } from "./compare-tab";
import { REPORT_VIEWS } from "@/server/nafs/center";

const CARD = "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line print:break-inside-avoid print:shadow-none";
const SEL = "min-h-11 rounded-xl bg-surface px-3 ring-1 ring-line";

/**
 * 🇸🇦 NAFS center → 4. REPORTS: the overall performance report across EVERYTHING the students did in NAFS (adaptive
 * practice, NAFS tests, Ministry booklets, practice) — simple and organised: summary cards, the 13 standards with bars,
 * the students with strengths and weaknesses, the trend, downloads. "Full detail" opens the deeper analysis (the old
 * Dashboard, merged here: skills analysis, attempt by attempt, groups, classes compared).
 */
export async function OverallTab({ actor, t, sp }: { actor: Actor; t: TFn; sp: Record<string, string | undefined> }) {
  const classes = await nafsClasses(repo, actor);
  if (!classes.length) return <p className={`${CARD} text-sm text-muted`}>{t("You have no Grade 6 class yet.")}</p>;
  const view = REPORT_VIEWS.find((x) => x.key === sp.view)?.key ?? "";
  const detail = view === "detail";
  const views = (
    <nav aria-label={t("Reports")} className="flex flex-wrap gap-1.5 print:hidden">
      {REPORT_VIEWS.map(({ key: k, label }) => (
        <Link key={k} href={centerHref("reports", { view: k, class: sp.class, ...(k === "compare" ? {} : { from: sp.from, to: sp.to }) })} aria-current={k === view ? "page" : undefined}
          className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ring-1 ${k === view ? "bg-teal-700 text-white ring-teal-700" : "bg-surface text-ink-2 ring-line"}`}>{k === "compare" ? "⬆️⬇️ " : ""}{t(label)}</Link>
      ))}
    </nav>
  );
  if (view === "compare") return <div className="grid gap-4">{views}<CompareView actor={actor} t={t} sp={sp} /></div>;
  if (detail) return <div className="grid gap-4">{views}<DashboardTab actor={actor} t={t} sp={sp} /></div>;
  const classId = classes.find((c) => c.id === sp.class)?.id ?? null;
  const d = await nafsDashboardCached(repo, actor, { classId, from: sp.from, to: sp.to });
  const r = d.scope.range;
  return (
    <div className="grid gap-4">
      {views}
      <form method="get" action="/teacher/nafs" className={`${CARD} flex flex-wrap items-end gap-3 print:hidden`}>
        <input type="hidden" name="tab" value="reports" />
        <div className="grid min-w-52 gap-1 text-sm font-semibold text-ink-2"><span>{t("Class")}</span><Combo name="class" label={t("Class")} defaultValue={classId ?? ""} options={[{ value: "", label: d.scope.admin ? t("All Grade 6 classes (the school)") : t("All my Grade 6 classes") }, ...classes.map((c) => ({ value: c.id, label: c.name }))]} /></div>
        <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("From")}<input type="date" name="from" defaultValue={r.from ?? ""} className={SEL} /></label>
        <label className="grid gap-1 text-sm font-semibold text-ink-2">{t("To")}<input type="date" name="to" defaultValue={r.to ?? ""} className={SEL} /></label>
        <button className="min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
        <a href={dashboardDownload("xlsx", classId, r)} className="inline-flex min-h-11 items-center rounded-xl bg-surface px-4 font-semibold text-ink ring-1 ring-line">⬇ {t("Excel")}</a>
        <a href={dashboardDownload("pdf", classId, r)} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-xl bg-surface px-4 font-semibold text-ink ring-1 ring-line">⬇ {t("PDF")}</a>
        <PrintButton label={t("Print")} />
      </form>
      <p className="text-xs text-muted">{t("Everything the students did in NAFS: adaptive practice, NAFS tests, Ministry booklets and practice — never the platform's levels or ReadRise.")}</p>
      <Overview d={d} t={t} />
      {!d.attempts.length ? <p className={`${CARD} text-sm text-muted`}>{t("No NAFS results in these dates yet. Give a NAFS test or adaptive practice first.")}</p> : <>
        <Standards d={d} t={t} />
        <Trend d={d} t={t} />
        <Students d={d} t={t} />
        <p className="text-sm"><Link href={centerHref("plan", { class: classId, from: r.from, to: r.to })} className="font-semibold text-teal-ink underline">🧭 {t("Suggested plan from these results")}</Link></p>
      </>}
    </div>
  );
}

function Overview({ d, t }: { d: Dashboard; t: TFn }) {
  const o = d.overview;
  return (
    <>
    <ClassLineCards c={d.cls} t={t} finishedLabel="Took a NAFS test" />
    <section aria-label={t("Summary")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card n={o.students} label={t("Students")} sub={t("{n} took a NAFS test", { n: o.tested })} />
      <Card n={<Pc v={o.avgScore} />} label={t("Average test score")} sub={<>{t("Tests taken")}: {o.testsTaken} · {t("{n} tests", { n: o.tests })}</>} />
      <Card n={<Pc v={o.practicePct} />} label={t("Practice accuracy")} sub={<>{t("Practice sessions")}: {o.practiceSessions} · {t("{n} answers", { n: o.practiceAnswers })}</>} />
      <Card n={o.trend ? <Delta v={o.trend.delta} /> : "—"} label={t("Change from the previous test")} sub={o.trend ? `${o.trend.previous.pct}% → ${o.trend.latest.pct}%` : t("Two tests are needed.")} />
      <Card n={d.groups.find((g) => g.key === "SUPPORT")?.count ?? 0} label={t(GROUP_NAME.SUPPORT)} sub={t("From each student's latest NAFS test.")} />
      <Card n={d.noTest.length} label={t("No NAFS test yet")} />
      <Link href={centerHref("marking")} className="block"><Card n={o.waiting} label={t("Written answers waiting for marking")} /></Link>
    </section>
    </>
  );
}

function Standards({ d, t }: { d: Dashboard; t: TFn }) {
  return (
    <section className={CARD} aria-labelledby="ost-h">
      <h2 id="ost-h" className="text-lg font-semibold text-ink">{t("Ministry standards (S01–S13)")}</h2>
      <p className="text-sm text-muted">{t("Tests and practice together; weakest first.")}</p>
      <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[44rem] text-sm">
        <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Standard")}</th><th className="w-1/3">{t("All")}</th><th>{t("Tests %")}</th><th>{t("Practice %")}</th><th>{t("Items")}</th><th>{t("Trend")}</th></tr></thead>
        <tbody className="divide-y divide-line">{[...d.standards].sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101)).map((x) => (
          <tr key={x.key}>
            <td className="py-2 pe-2 text-ink"><b className="me-1 font-mono" dir="ltr">{x.short}</b>{t(x.name)}</td>
            <td><PctBar v={x.pct} label="" /></td>
            <td className="text-center"><Pc v={x.testPct} /></td><td className="text-center"><Pc v={x.practicePct} /></td>
            <td className="text-center tabular-nums">{x.items}</td>
            <td className="text-center"><Sparkline points={x.trend.map((p) => p.pct)} label={t("Trend")} /></td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  );
}

function Trend({ d, t }: { d: Dashboard; t: TFn }) {
  const a = d.attempts.slice(-20);
  return (
    <section className={CARD} aria-labelledby="otr-h">
      <h2 id="otr-h" className="text-lg font-semibold text-ink">{t("Trend")}</h2>
      <LineChart title={t("Score attempt by attempt")} labels={a.map((_x, i) => `${i + 1}`)} series={[
        { name: t("Tests"), cls: "text-indigo-600", points: a.map((x) => (x.kind === "TEST" ? x.pct : null)) },
        { name: t("Practice"), cls: "text-teal-600", dash: true, points: a.map((x) => (x.kind === "PRACTICE" ? x.pct : null)) },
      ]} />
      <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">{a.map((x, i) => <li key={`${x.kind}:${x.id}`}><b className="tabular-nums">{i + 1}.</b> {x.title} <Pc v={x.pct} /></li>)}</ol>
    </section>
  );
}

function Students({ d, t }: { d: Dashboard; t: TFn }) {
  const latest = new Map(d.students.map((x) => [x.id, x]));
  return (
    <section className={CARD} aria-labelledby="ostu-h">
      <h2 id="ostu-h" className="text-lg font-semibold text-ink">{t("Students")}</h2>
      <p className="text-sm text-muted">{t("Group words are for teachers only: students never see them.")}</p>
      <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[52rem] text-sm">
        <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Student")}</th><LineHeads t={t} finished={false} /><th title={t("NAFS tests handed in")}>{t("Tests finished")}</th><th>{t("Latest")}</th><th>{t("Change from previous")}</th><th>{t("Group")}</th></tr></thead>
        <tbody className="divide-y divide-line">{d.heat.students.map((st) => {
          const l = latest.get(st.id);
          const g = groupOf(l?.latest ?? null);
          return (
            <tr key={st.id} className="align-top">
              <td className="py-2 pe-2"><Link href={studentHref(st.id, d.scope.range)} className="font-semibold text-ink hover:underline">{st.name}</Link><span className="block text-xs text-muted">{st.className}</span></td>
              <LineCells x={st} t={t} finished={false} />
              <td className="text-center tabular-nums">{st.tests}</td>
              <td className="text-center"><Pc v={l?.latest} /></td>
              <td className="text-center"><Delta v={l?.dPrev} /></td>
              <td className="text-center">{g ? <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${GROUP_CLS[g]}`}>{t(GROUP_NAME[g])}</span> : <span className="text-xs text-muted">—</span>}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </section>
  );
}

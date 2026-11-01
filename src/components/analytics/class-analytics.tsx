/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { ClassComparison, StandardRow } from "../../server/analytics/reports";
import { makeT, type Lang } from "../../i18n";
import { getT } from "../../i18n/server";
import { BarList } from "../charts/bar-chart";
import { AtAGlance, Callout, ReportHeader, ReportSection, ReportTable } from "../report-kit";

const PERIODS: [string, string][] = [["LAST_7_DAYS", "Last 7 days"], ["LAST_30_DAYS", "Last 30 days"], ["TERM", "This term"], ["SEMESTER", "Semester"], ["SCHOOL_YEAR", "School year"]];
const v = (x: number | null, suffix = "") => (x === null ? "–" : `${x}${suffix}`);
const STAR_ICON: Record<string, string> = { Mastered: "⭐", "In progress": "◐", "Needs review": "🔄" };

/**
 * 📈 Class progress. Growth = the change of the STARS in the period (⭐ earned, 🔄 needs review, students whose stars
 * went up / down — skills/star-read.ts), never the engine's score change. Every label goes through t().
 */
export async function ClassAnalyticsView({ className, classHref, period, periodKey, c, standards, notAssessed, lang }: {
  className: string; classHref: string; period: string; periodKey: string; c: ClassComparison; standards: StandardRow[]; notAssessed: number; lang?: Lang;
}) {
  const t = lang ? makeT(lang) : (await getT()).t;
  const g = c.classStars;
  return (
    <div>
      <ReportHeader back={{ href: classHref, label: t("Back to class") }} icon="📈" title={t("Class {name}: progress and stars", { name: className })}
        subtitle={t("Growth is the change of the skill stars in the period. All scores are this platform's own measures, not MAP or other official scores.")}
        who={className} when={t(period)}
        filters={<nav aria-label={t("Reporting period")} className="flex flex-wrap gap-2">
          {PERIODS.map(([k, l]) => (
            <a key={k} href={`?period=${k}`} aria-current={k === periodKey ? "page" : undefined}
              className={["rounded-full px-4 py-1.5 text-sm font-semibold", k === periodKey ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"].join(" ")}>{t(l)}</a>
          ))}
        </nav>} />
      <AtAGlance items={[
        { icon: "⭐", label: t("New stars this period"), value: String(g.gained), meaning: g.avgGained === null ? t("no practice yet") : t("{n} per student on average", { n: g.avgGained }) },
        { icon: "⬆️", label: t("Students whose stars went up"), value: v(g.upPct, "%"), meaning: t("{n}% had a star go down", { n: g.downPct ?? 0 }) },
        { icon: "👩‍🎓", label: t("Students with practice data"), value: t("{n} of {total}", { n: g.withData, total: g.students }), tone: g.withData < g.students ? "warn" : "good" },
        { icon: "⭐", label: t("Median star score"), value: v(c.masterySummary.median), meaning: t("middle half {a}–{b}", { a: v(c.masterySummary.p25), b: v(c.masterySummary.p75) }) },
      ]} />
      <Callout kind="next" className="mb-5" items={[
        standards[0] ? <>{t("Reteach the lowest standard:")} <b>{standards[0].short}</b> ({standards[0].accuracyPct}%)</> : null,
        g.withData < g.students ? t("{n} students have no practice data yet: ask them to practise this week.", { n: g.students - g.withData }) : null,
      ]} />
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rk-section rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">{t("⭐ New stars by month")}</h2>
          <p className="text-sm text-slate-500">{t("Skills the students mastered in each month of the period.")}</p>
          <div className="mt-3"><BarList items={g.byMonth.map((m) => ({ label: m.label, value: m.stars }))} color="bg-amber-400" /></div>
        </div>
        <div className="rk-section rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">{t("Star change this period")}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-4">
            <div><dt className="text-sm text-slate-500">{t("⭐ New stars")}</dt><dd className="text-3xl font-bold tabular-nums text-brand-navy">{g.gained}</dd></div>
            <div><dt className="text-sm text-slate-500">{t("🔄 Needs review")}</dt><dd className="text-3xl font-bold tabular-nums text-brand-navy">{g.toReview}</dd></div>
            <div className="col-span-2"><dt className="text-sm text-slate-500">{t("Students by star trend")}</dt><dd className="tabular-nums text-slate-800">⬆️ {g.up} · ➖ {g.same} · ⬇️ {g.down}</dd></div>
          </dl>
          <h3 className="mt-5 font-semibold text-brand-navy">{t("⭐ Skill stars of the class")}</h3>
          <div className="mt-2"><BarList items={c.distribution.map((d) => ({ label: `${STAR_ICON[d.label] ?? ""} ${t(d.label)}`, value: d.count }))} /></div>
          <p className="mt-2 text-sm text-slate-500">{t("Students' average star score: median {m}, middle half {a}–{b}", { m: v(c.masterySummary.median), a: v(c.masterySummary.p25), b: v(c.masterySummary.p75) })}</p>
        </div>
      </section>

      <ReportSection title={t("How the Class Compares")} icon="⚖️" className="mt-6">
        <ReportTable label={t("How the Class Compares")}
          cols={[{ key: "g", label: t("Group") }, { key: "n", label: t("Students with data"), num: true }, { key: "m", label: t("Avg star score"), num: true }, { key: "a", label: t("Accuracy"), num: true }, { key: "gr", label: t("New stars per student"), num: true }]}
          rows={[
            ...c.rows.map((r) => ({ id: r.label, sort: { m: r.suppressed ? null : r.avgMastery, a: r.suppressed ? null : r.accuracyPct, gr: r.suppressed ? null : r.avgStarsGained },
              cells: r.suppressed ? { g: <span className="text-brand-navy">{t(r.label)}</span>, n: r.studentsWithData, m: <span className="text-slate-500">{t("Hidden: fewer than 5 students have data (protects privacy)")}</span>, a: "", gr: "" }
                : { g: <span className="text-brand-navy">{t(r.label)}</span>, n: r.studentsWithData, m: v(r.avgMastery), a: v(r.accuracyPct, "%"), gr: r.avgStarsGained === null ? "–" : `⭐ ${r.avgStarsGained}` } })),
            ...c.external.map((e) => ({ id: e.scope, cells: { g: <span className="text-brand-navy">{t(e.scope === "NATIONAL" ? "National" : "District")}</span>, n: "", m: <span className="text-slate-600">{e.available ? `${e.value} (${t(e.metric === "ACCURACY_PCT" ? "accuracy" : "average mastery")}), ${t("source:")} ${e.source}` : t(e.message)}</span>, a: "", gr: "" } })),
          ]} />
      </ReportSection>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rk-section rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">{t("⭐ Stars earned by skill")}</h2>
          <p className="text-sm text-slate-500">{t("How many students earned the skill's star in this period.")}</p>
          <div className="mt-3"><BarList items={g.skills.slice(0, 8).map((s) => ({ label: s.name, value: s.gained }))} color="bg-amber-400" /></div>
          {g.skills.length === 0 && <p className="mt-2 text-slate-600">{t("No new stars in this period yet.")}</p>}
        </section>
        <section className="rk-section rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">{t("Standards")}</h2>
          <p className="text-sm text-slate-500">{t("Accuracy by Common Core standard, lowest first. {n} grade standards have no questions answered yet.", { n: notAssessed })}</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {standards.map((s) => (
              <li key={s.code} className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3 py-2">
                <span><span className="font-semibold text-brand-navy">{s.short}</span> <span className="text-slate-600">{s.description.slice(0, 110)}{s.description.length > 110 ? "…" : ""}</span></span>
                <span className={`text-end font-semibold tabular-nums ${s.accuracyPct >= 80 ? "text-emerald-700" : s.accuracyPct >= 60 ? "text-amber-700" : "text-red-700"}`}>{s.accuracyPct < 60 ? "! " : ""}{s.accuracyPct}%<br /><span className="text-xs text-slate-500">{t("{n} answers", { n: s.attempts })}</span></span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

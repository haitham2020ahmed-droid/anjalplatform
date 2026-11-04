import type { FamilyDoc, FamilySubject } from "@/server/map/map-reports";
import type { ReportSection } from "@/server/reports/family-reports";
import { PercentileBar, ReportHead, ReportPage, RitChart, RitLegend, ordinal } from "./report-ui";
import { ReportSummary } from "@/components/report-kit/report-summary";
import type { Summary } from "@/lib/report-summary";
import { pctChange } from "@/lib/report-summary";
import { homeTopicFor } from "@/server/reports/family-week-words";
import { getT } from "@/i18n/server";
import type { Lang, TFn } from "@/i18n";

/** The words of this report: `t` translates the interface text, `nth` writes a percentile rank (45th / 45). */
interface Words { t: TFn; nth: (n: number) => string }
const wordsOf = (t: TFn, lang: Lang): Words => ({ t, nth: (n) => (lang === "ar" ? String(n) : ordinal(n)) });

/** The weakest goal area across every subject (lowest RIT), for the one-activity fallback when no highlights were
 *  computed yet (familyNextSkills, map-reports.ts) — pure, reads only what the page already loaded. */
function weakestAreaName(d: FamilyDoc): string | null {
  const all = d.subjects.flatMap((x) => x.areas);
  if (!all.length) return null;
  return [...all].sort((a, b) => a.rit - b.rit)[0].name;
}

/** 👪 Family Report: what MAP Growth is, then for each subject achievement, growth, the RIT history and the goal;
 *  then the student's practice on the platform and questions to ask the teacher. Two printed pages. */
/** r72: `summary` = the parent-friendly summary (mapFamilySummary), at the end of the report (buttons not printed).
 *  `highlights` = the short "What to practise next" skill list (familyNextSkills, map-reports.ts) — unlike the
 *  summary's "See the study plan" button (print:hidden, inside the Action plan), this renders in the page body so
 *  it survives print/PDF. Undefined when the caller has not computed it; an empty array shows the fallback line. */
export async function FamilyView({ d, first = true, summary, highlights, performance, t: tIn, lang: langIn }: { d: FamilyDoc; first?: boolean; summary?: Summary; highlights?: string[]; performance?: ReportSection[]; t?: TFn; lang?: Lang }) {
  const cur = tIn && langIn ? null : await getT();
  const w = wordsOf(tIn ?? cur!.t, langIn ?? cur!.lang);
  const { t } = w;
  const name = d.student.first.toUpperCase();
  return (
    <>
      <ReportPage first={first}>
        <ReportHead s={d.student} title={t("Family Report")} term={d.term} />
        <div className="mt-3 grid gap-x-8 gap-y-1 text-[12px] leading-snug text-slate-700 md:grid-cols-2 print:grid-cols-2">
          <div>
            <p><b>{t("What is this report?")}</b> {t("A summary of how your child is doing in English, from the most recent MAP Growth test and their practice on the platform.")}</p>
            <p className="mt-2"><b>{t("What is MAP Growth?")}</b> {t("A test that adapts to your child’s answers in real time to measure their level.")}</p>
          </div>
          <div>
            <p><b>{t("Achievement")}</b> — {t("how well your child has learned the skills, compared with students of the same grade nationwide.")} <b>{t("Growth")}</b> — {t("your child’s own progress over time, compared with students who started at the same score.")}</p>
            <p className="mt-2"><b>{t("What is a RIT score?")}</b> {t("The overall score for a subject, on a scale from 100 to 350.")}</p>
          </div>
        </div>
        {d.subjects.map((x) => <SubjectBlock key={x.subject} x={x} name={name} w={w} />)}
        {!d.subjects.length && <p className="mt-6 rounded-xl bg-slate-50 p-4 text-slate-600">{t("No MAP results yet.")}</p>}
      </ReportPage>
      <ReportPage>
        <ReportHead s={d.student} title={t("Family Report")} term={d.term} />
        <section className="mt-5">
          <h3 className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-brand-navy">📈 {t("Practice on the platform · last 30 days")}</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5 print:grid-cols-5">
            {[["Days practised", d.practice.days], ["Answers", d.practice.answers], ["Correct", d.practice.accuracy === null ? "—" : `${d.practice.accuracy}%`], ["Minutes", d.practice.minutes], ["Skills mastered", d.practice.mastered]].map(([l, v]) => (
              <div key={String(l)} className="rounded-xl bg-white p-3 text-center ring-1 ring-slate-200"><p className="text-2xl font-black text-brand-navy tabular-nums">{v}</p><p className="text-xs text-slate-500">{t(String(l))}</p></div>
            ))}
          </div>
        </section>
        {highlights !== undefined && (
          <section className="mt-5 break-inside-avoid rounded-xl bg-teal-50 p-4 ring-1 ring-teal-200">
            <h3 className="font-bold text-teal-900">🧭 {t("What to practise next")}</h3>
            {highlights.length ? (
              <ul className="mt-1 list-disc space-y-0.5 ps-6 text-[13px] text-teal-900">{highlights.map((x) => <li key={x}>{x}</li>)}</ul>
            ) : <p className="mt-1 text-[13px] text-teal-900">{t("{name}’s study plan is not set yet.", { name })}</p>}
            {/* r+1: ONE concrete home activity for the week, from the weakest skill/area already shown above —
               not just a list of names (homeTopicFor, family-week-words.ts: the same activities the weekly family
               report already uses, keyword-matched, no new data). */}
            {(highlights[0] ?? weakestAreaName(d)) && (
              <p className="mt-2 text-[13px] text-teal-900"><b>{t("This week at home:")}</b> {homeTopicFor(highlights[0] ?? weakestAreaName(d)!).activity}</p>
            )}
          </section>
        )}
        {d.note && (
          <section className="mt-5 break-inside-avoid rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <h3 className="font-bold text-amber-900">📝 {t("A note from {name}’s teacher", { name })}</h3>
            <p className="mt-1 whitespace-pre-wrap text-[13px] text-amber-900">{d.note}</p>
          </section>
        )}
        {d.subjects.some((x) => x.areas.length) && (
          <section className="mt-5">
            <h3 className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold text-brand-navy">🧩 {t("Goal areas")}</h3>
            <div className="mt-2 grid gap-3 md:grid-cols-2 print:grid-cols-2">{d.subjects.filter((x) => x.areas.length).map((x) => (
              <table key={x.subject} className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-1">{x.name}</th><th>RIT</th><th>{t("Level")}</th></tr></thead>
                <tbody>{x.areas.map((a) => <tr key={a.name} className="border-b last:border-0"><td className="py-1">{a.icon} {a.name}</td><td className="tabular-nums">{a.rit}</td><td>{a.descriptor ? t(a.descriptor) : "—"}</td></tr>)}</tbody></table>
            ))}</div>
          </section>
        )}
        <section className="mt-6 text-[13px] text-slate-700">
          <p><b>{t("How can I use this information to help my child?")}</b> {t("Talk to your child’s teacher. Questions you can ask:")}</p>
          <ul className="mt-2 list-disc space-y-0.5 ps-6">
            <li>{t("What strategies are used in class that I can reinforce at home?")}</li>
            <li>{t("Does my child need extra help in a specific area?")}</li>
            <li>{t("Which skills on the platform should my child practise this month?")}</li>
            <li>{t("When will my child’s progress be measured again?")}</li>
            <li>{t("How is my child doing compared with grade-level expectations?")}</li>
          </ul>
          <p className="mt-3"><b>{t("At home:")}</b> {t("15–20 minutes of practice on the platform, 4 days a week, makes a clear difference. Reading together every day helps every goal area.")}</p>
        </section>
        {summary && <ReportSummary summary={summary} />}
        <p className="mt-8 text-[11px] text-slate-400">{t("Percentiles marked ≈ and growth percentiles are estimated by the platform from national norms; NWEA’s own reports are the official results. Confidential: for the student’s family and school.")}</p>
      </ReportPage>
      {d.subjects.length > 0 && <SummaryTablePage d={d} w={w} />}
      {performance !== undefined && performance.length > 0 && <PerformancePage d={d} sections={performance} w={w} />}
    </>
  );
}

function SubjectBlock({ x, name, w }: { x: FamilySubject; name: string; w: Words }) {
  const { t, nth } = w;
  const l = x.latest!;
  return (
    <section className="mt-4 break-inside-avoid">
      <h2 className="rounded-lg bg-slate-100 px-3 py-1.5 text-lg font-bold text-brand-navy">📖 {t("English")} | {x.name}</h2>
      <div className="mt-2 grid gap-6 md:grid-cols-2 print:grid-cols-2">
        <div>
          <p className="text-sm"><b>{l.descriptor ? t("{level} Achievement", { level: t(l.descriptor) }) : t("Achievement")}</b>{l.percentile !== null && <> {l.percentileFromFile ? "" : "≈ "}{t("{n} Percentile", { n: nth(l.percentile) })}</>}</p>
          <RitChart points={x.points} first={name} />
          <RitLegend first={name} approx={x.points.some((p) => p.national !== null && !p.nationalExact)} />
          <p className="mt-1 text-[12.5px] text-slate-700">{t("{name}’s overall score (RIT) was {rit} in {term}.", { name, rit: l.rit, term: t(l.term) })}{l.percentile !== null && <> {t("That is the {nth} percentile of Grade {grade} students: better than {n}% of them.", { nth: nth(l.percentile), grade: l.grade, n: l.percentile })}</>}</p>
        </div>
        <div>
          {x.growth ? (
            <>
              <p className="text-sm"><b>{t("{level} Growth", { level: t(x.growth.descriptor) })}</b> ≈ {t("{n} Percentile", { n: nth(x.growth.percentile) })}</p>
              <div className="mt-1"><PercentileBar pct={x.growth.percentile} label={`${name} ${nth(x.growth.percentile)}`} /></div>
              <p className="mt-1 text-[12.5px] text-slate-700">{t("{name} grew {rit} RIT from {from} to {to}.", { name, rit: `${x.growth.rit >= 0 ? "+" : ""}${x.growth.rit}`, from: t(x.growth.from), to: t(x.growth.to) })} {t("Students who started at the same score grew about {n} ({source}), so this is more progress than about {pct}% of them.", { n: x.growth.expected, source: t(x.growth.projected ? "NWEA projection" : "national norms"), pct: x.growth.percentile })}</p>
              {/* r+1: % improvement alongside the RIT points, from the same before/after this growth already
                 compares — never a bare discouraging negative %. */}
              {(() => { const pct = pctChange(l.rit, l.rit - x.growth!.rit); return (
                <p className="mt-1 text-[12.5px] font-semibold text-teal-700">
                  {pct !== null && pct > 0 ? t("+{pct}% since {from} — great progress!", { pct, from: t(x.growth!.from) }) : t("Holding steady since {from}.", { from: t(x.growth!.from) })}
                </p>
              ); })()}
            </>
          ) : <p className="text-sm text-slate-500">{t("Growth appears after the next MAP test (it compares two tests).")}</p>}
          {x.goal && <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-[12.5px] text-teal-900 ring-1 ring-teal-200">🎯 {t("Goal for {term}:", { term: t(x.goal.term) })} <b>RIT {x.goal.target}</b> ({t("{n} from now", { n: `${x.goal.target - l.rit >= 0 ? "+" : ""}${x.goal.target - l.rit}` })}).</p>}
        </div>
      </div>
    </section>
  );
}

/** 👪 Page 3 — a Ministry-of-Education-style summary table (owner request, Oct 2026): the student's identity
 *  fields, then one row per subject with its Fall RIT, Projected Spring RIT, the class and national average RIT.
 *  (Nationality was requested too, but the platform does not record it, so it is left out by the owner's choice.) */
function SummaryTablePage({ d, w: { t } }: { d: FamilyDoc; w: Words }) {
  const rows = d.subjects.filter((x) => x.latest);
  return (
    <ReportPage>
      <ReportHead s={d.student} title={t("Family Report")} term={d.term} />
      <section className="mt-5">
        <h2 className="rounded-lg bg-slate-100 px-3 py-1.5 text-lg font-bold text-brand-navy">📋 {t("Summary")}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[13px] text-slate-700 sm:grid-cols-4 print:grid-cols-4">
          <p><b>{t("Student Name:")}</b> {d.student.name}</p>
          <p><b>{t("Class:")}</b> {d.student.className || "—"}</p>
          <p><b>{t("Semester:")}</b> {d.term ? t(d.term) : "—"}</p>
          <p><b>{t("Student ID:")}</b> {d.student.number || "—"}</p>
        </div>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b-2 border-brand-navy text-left text-xs text-slate-600">
              <th className="py-1.5">{t("Subject")}</th>
              <th className="py-1.5">{t("Fall RIT Score")}</th>
              <th className="py-1.5">{t("Projected Spring RIT")}</th>
              <th className="py-1.5">{t("Class Average RIT")}</th>
              <th className="py-1.5">{t("National Average RIT")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const national = x.points[x.points.length - 1]?.national ?? null;
              return (
                <tr key={x.subject} className="border-b last:border-0">
                  <td className="py-2 font-semibold text-brand-navy">{x.name}</td>
                  <td className="py-2 tabular-nums">{x.fallRit ?? "—"}</td>
                  <td className="py-2 tabular-nums">{x.goal ? x.goal.target : "—"}</td>
                  <td className="py-2 tabular-nums">{x.classAvgRit ?? "—"}</td>
                  <td className="py-2 tabular-nums">{national ?? "—"}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={5} className="py-3 text-slate-500">{t("No MAP results yet.")}</td></tr>}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-slate-400">{t("Fall RIT is this school year’s Fall test; the Projected Spring RIT is NWEA’s growth projection for Spring. Class and National Average RIT use each subject’s most recent test.")}</p>
      </section>
    </ReportPage>
  );
}

/** 👪 Page 4 — "Student&apos;s performance on the platform" (owner request, Oct 2026): writing, ReadRise, fluency,
 *  diagnostic test and overall practice/assignment activity, built by platformPerformanceSections (family-sections.ts)
 *  and rendered here as plain titled blocks (the same look the rest of this report already uses). */
function PerformancePage({ d, sections, w: { t } }: { d: FamilyDoc; sections: ReportSection[]; w: Words }) {
  return (
    <ReportPage>
      <ReportHead s={d.student} title={t("Family Report")} term={d.term} />
      <section className="mt-5">
        <h2 className="rounded-lg bg-slate-100 px-3 py-1.5 text-lg font-bold text-brand-navy">💻 {t("Performance on the platform")}</h2>
        {sections.map((sec) => (
          <div key={sec.heading} className="mt-4 break-inside-avoid">
            <h3 className="font-bold text-brand-navy">{sec.icon} {t(sec.heading)}</h3>
            <ul className="mt-1 list-disc space-y-0.5 ps-6 text-[13px] text-slate-700">{sec.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
        ))}
      </section>
    </ReportPage>
  );
}

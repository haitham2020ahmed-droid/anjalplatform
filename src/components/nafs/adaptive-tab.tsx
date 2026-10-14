import Link from "next/link";
import type { TFn } from "@/i18n";
import type { Actor } from "@/server/auth/rbac";
import { repo } from "@/server/auth/next";
import { nafsClasses } from "@/server/nafs/tests";
import { listNafsPractice, nafsPracticeReport } from "@/server/nafs/practice";
import { nafsAdaptiveReport, type Reached } from "@/server/nafs/adaptive-report";
import { centerHref, subOf } from "@/server/nafs/center";
import { codeName, DIFFICULTY_NAME } from "@/server/nafs/framework";
import { PrintButton } from "@/components/plans/print-button";
import { Combo } from "@/components/ui/combo";
import { PracticeTab } from "./practice-tab";
import { PracticeReportView } from "./practice-report";
import { Sparkline } from "./charts";
import { Card, PctBar, SubNav } from "./sub-nav";

const CARD = "rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line print:break-inside-avoid print:shadow-none";
const mm = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };
const REACHED: Record<Reached, string> = { 0: "—", 1: DIFFICULTY_NAME[1], 2: DIFFICULTY_NAME[2], 3: DIFFICULTY_NAME[3] };

/**
 * 🇸🇦 NAFS center → 1. ADAPTIVE: "Practice" (give adaptive practice, the practices given) and "Report" (the adaptive
 * results organised: per class, per student, per standard / skill — the level reached Easy / Medium / Hard, accuracy,
 * mastery, time, trend — and one practice in detail). The report of adaptive practice lives HERE only.
 */
export async function AdaptiveTab({ actor, t, sp }: { actor: Actor; t: TFn; sp: Record<string, string | undefined> }) {
  const sub = subOf("adaptive", sp.sub);
  return (
    <>
      <SubNav tab="adaptive" sub={sub} t={t} />
      {sub === "report" ? <AdaptiveReportView actor={actor} t={t} sp={sp} /> : <PracticeTab actor={actor} t={t} sp={sp} />}
    </>
  );
}

async function AdaptiveReportView({ actor, t, sp }: { actor: Actor; t: TFn; sp: Record<string, string | undefined> }) {
  const classes = await nafsClasses(repo, actor);
  if (!classes.length) return <p className={`${CARD} text-sm text-muted`}>{t("You have no Grade 6 class yet.")}</p>;
  const classId = classes.find((c) => c.id === sp.class)?.id ?? null;
  const [r, list] = await Promise.all([nafsAdaptiveReport(repo, actor, classId), listNafsPractice(repo, actor)]);
  const openId = list.find((x) => x.id === sp.open)?.id ?? null;
  const one = openId ? await nafsPracticeReport(repo, actor, openId).catch(() => null) : null;
  const s = r.summary;
  return (
    <div className="grid gap-4">
      <form method="get" action="/teacher/nafs" className={`${CARD} flex flex-wrap items-end gap-3 print:hidden`}>
        <input type="hidden" name="tab" value="adaptive" /><input type="hidden" name="sub" value="report" />
        <div className="grid min-w-52 gap-1 text-sm font-semibold text-ink-2"><span>{t("Class")}</span><Combo name="class" label={t("Class")} defaultValue={classId ?? ""} options={[{ value: "", label: t("All my Grade 6 classes") }, ...classes.map((c) => ({ value: c.id, label: c.name }))]} /></div>
        <div className="grid min-w-60 gap-1 text-sm font-semibold text-ink-2"><span>{t("Adaptive practice results")}</span><Combo name="open" label={t("Adaptive practice results")} defaultValue={openId ?? ""} options={[{ value: "", label: t("All practices together") }, ...list.map((x) => ({ value: x.id, label: x.title, hint: x.className }))]} /></div>
        <button className="min-h-11 rounded-xl bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
        <PrintButton label={t("Print")} />
      </form>
      {one && <PracticeReportView r={one} t={t} closeHref={centerHref("adaptive", { sub: "report", class: classId })} />}
      {!s.runs ? <p className={`${CARD} text-sm text-muted`}>{t("No adaptive practice results yet.")} <Link href={centerHref("adaptive")} className="font-semibold text-teal-ink underline">{t("Give adaptive practice")}</Link></p> : <>
        <section aria-label={t("Summary")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card n={s.practices} label={t("Practices given")} sub={t("{n} finished", { n: s.finished })} />
          <Card n={s.students} label={t("Students who practised")} />
          <Card n={s.answers} label={t("Answers")} sub={`${t("Accuracy")}: ${s.pct ?? "—"}%`} />
          <Card n={`${s.mastered}/${s.targetRuns}`} label={t("Skills mastered")} sub={t("4 of the last 5 right, at least 2 at Medium or Hard")} />
          <Card n={mm(s.seconds)} label={t("Time spent")} />
        </section>
        {r.classes.length > 1 && (
          <section className={CARD} aria-labelledby="ac-h">
            <h2 id="ac-h" className="text-lg font-semibold text-ink">{t("Per class")}</h2>
            <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[32rem] text-sm">
              <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Class")}</th><th>{t("Practised")}</th><th>{t("Answers")}</th><th className="w-1/3">{t("Accuracy")}</th><th>{t("Mastered")}</th></tr></thead>
              <tbody className="divide-y divide-line">{r.classes.map((c) => (
                <tr key={c.id}><td className="py-2 font-semibold text-ink"><Link href={centerHref("adaptive", { sub: "report", class: c.id })} className="hover:underline">{c.name}</Link></td><td className="text-center tabular-nums">{c.practised}/{c.students}</td><td className="text-center tabular-nums">{c.answers}</td><td><PctBar v={c.pct} label="" /></td><td className="text-center tabular-nums">{c.masteryPct === null ? "—" : `${c.masteryPct}%`}</td></tr>
              ))}</tbody>
            </table></div>
          </section>
        )}
        <section className={CARD} aria-labelledby="at-h">
          <h2 id="at-h" className="text-lg font-semibold text-ink">{t("Per standard and skill")}</h2>
          <p className="text-sm text-muted">{t("Weakest first. Level reached = the hardest difficulty each student answered right.")}</p>
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[46rem] text-sm">
            <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Standard / skill")}</th><th>{t("Students")}</th><th>{t("Answers")}</th><th className="w-1/4">{t("Accuracy")}</th><th>{t("Mastered")}</th><th>{t(DIFFICULTY_NAME[1])}</th><th>{t(DIFFICULTY_NAME[2])}</th><th>{t(DIFFICULTY_NAME[3])}</th><th>{t("Seconds per answer")}</th></tr></thead>
            <tbody className="divide-y divide-line">{r.targets.map((x) => (
              <tr key={x.code}>
                <td className="py-2 pe-2 text-ink">{codeName(x.code, t)}</td>
                <td className="text-center tabular-nums">{x.students}</td><td className="text-center tabular-nums">{x.answers}</td>
                <td><PctBar v={x.pct} label="" /></td>
                <td className="text-center tabular-nums">{x.mastered}/{x.students}</td>
                <td className="text-center tabular-nums">{x.reached[1]}</td><td className="text-center tabular-nums">{x.reached[2]}</td><td className="text-center tabular-nums">{x.reached[3]}</td>
                <td className="text-center tabular-nums">{x.secPerAnswer ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
        <section className={CARD} aria-labelledby="as-h">
          <h2 id="as-h" className="text-lg font-semibold text-ink">{t("Per student")}</h2>
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[56rem] text-sm">
            <thead><tr className="text-xs text-muted"><th className="py-2 text-start">{t("Student")}</th><th>{t("Practices")}</th><th>{t("Answers")}</th><th className="w-40">{t("Accuracy")}</th><th>{t("Mastered")}</th><th>{t("Level reached")}</th><th>{t("Time spent")}</th><th>{t("Trend")}</th><th className="text-start">{t("Strengths")}</th><th className="text-start">{t("To work on")}</th></tr></thead>
            <tbody className="divide-y divide-line">{r.students.map((x) => (
              <tr key={x.id} className="align-top">
                <td className="py-2 pe-2"><Link href={`/teacher/nafs/students/${encodeURIComponent(x.id)}`} className="font-semibold text-ink hover:underline">{x.name}</Link><span className="block text-xs text-muted">{x.className}</span></td>
                <td className="text-center tabular-nums">{x.practices}</td><td className="text-center tabular-nums">{x.answers}</td>
                <td><PctBar v={x.pct} label="" /></td>
                <td className="text-center tabular-nums">{x.mastered}/{x.tried}</td>
                <td className="text-center">{x.best ? t(REACHED[x.best]) : "—"}</td>
                <td className="text-center tabular-nums">{mm(x.seconds)}</td>
                <td className="text-center"><Sparkline points={x.trend} label={t("Trend")} /><span className="block text-[11px] tabular-nums text-muted" dir="ltr">{x.trend.map((p) => p ?? "—").join(" → ")}</span></td>
                <td className="text-xs text-emerald-800">{x.strengths.map((c) => codeName(c, t)).join(" · ") || "—"}</td>
                <td className="text-xs text-rose-800">{x.workOn.map((c) => codeName(c, t)).join(" · ") || "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      </>}
    </div>
  );
}

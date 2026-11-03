import { parentSummary, type ParentSummary } from "@/server/student/parent-summary";
import { coachSummary } from "@/server/fluency/coach";
import { AppShell } from "@/components/app-shell";
import { ReportDownloads } from "@/components/reports/report-downloads";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { parentChildren } from "@/server/queries/parent";
import Link from "next/link";
import { isReportShared } from "@/server/insights/parent-report";
import { weekStats, type WeekStats } from "@/server/student/weekly";
import { fluencyGoalWords } from "@/server/reports/family-words";
import { getT } from "@/i18n/server";
import type { Lang, TFn } from "@/i18n";

/** Parent home: each linked child with their progress report (Arabic or English PDF). */
export default async function ParentHome() {
  const actor = await requireActor({ roles: ["PARENT"] });
  const me = (await getActor())!.user;
  const { t, lang } = await getT();
  const children = await parentChildren(repo, actor);
  // each child's monthly summary, in parallel
  const summaries = new Map(await Promise.all(children.map(async (c) => [c.studentId, await parentSummary(repo, actor, c.studentId)] as const)));
  const weeks = new Map(await Promise.all(children.map(async (c) => [c.studentId, await weekStats(repo, c.studentId)] as const)));
  const shared = new Map(await Promise.all(children.map(async (c) => [c.studentId, await isReportShared(repo, String(actor.schoolId), c.studentId)] as const)));
  const coach = new Map(await Promise.all(children.map(async (c) => [c.studentId, await coachSummary(repo, c.studentId)] as const)));
  return (
    <AppShell name={String(me.displayName)}>
      <h1 className="text-3xl font-bold text-brand-navy">{t("My Children")}</h1>
      <p className="mt-1 text-slate-600">{t("English progress reports")}</p>
      {children.length === 0 ? (
        <p className="mt-6 text-slate-600">{t("No children are linked to your account yet. Please contact the school.")}</p>
      ) : (
        children.map((c) => (
          <div key={c.studentId} className="mt-6">
            <h2 className="text-xl font-bold text-brand-navy"><bdi>{c.name}</bdi></h2>
            <p className="text-sm text-slate-500">{c.className ? t("Grade {g}, class {c}", { g: c.grade, c: c.className }) : t("Grade {g}", { g: c.grade })}</p>
            {shared.get(c.studentId) && <Link href={`/parent/report/${c.studentId}`} className="lift mt-3 flex items-center justify-between rounded-2xl bg-emerald-50 px-5 py-4 font-bold text-emerald-900 ring-1 ring-emerald-300"><span>📄 {t("Report from the teacher")}</span><span>{t("Open")} ▶</span></Link>}
            {shared.get(c.studentId) && <div className="mt-2 flex flex-wrap gap-2"><Link href={`/map-report/family/${c.studentId}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">📈 {t("MAP Family Report")}</Link><Link href={`/map-report/study-plan/${c.studentId}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🧭 {t("Study Plan")}</Link></div>}
            <Link href={`/parent/family/${c.studentId}`} className="lift mt-3 flex items-center justify-between rounded-2xl bg-brand-navy px-5 py-4 font-bold text-white"><span>👪 {t("Family Report — everything in one place")}</span><span>{t("Open")} ▶</span></Link>
            {/* 🐛 L12 fix: a non-null assertion here would crash this whole page if `coach` ever missed an entry
                (e.g. a future change to how `children`/`coach` are built); a plain optional lookup degrades to
                "no fluency card for this child" instead. */}
            {(() => { const f = coach.get(c.studentId); return f && (f.latest || f.readings14) ? <p className="mt-3 rounded-2xl bg-teal-50 px-5 py-3 text-sm text-teal-950 ring-1 ring-teal-200">🎙 <b>{t("Reading fluency:")}</b> {f.latest ? `${t("{n} words correct per minute ({date})", { n: f.latest.wcpm, date: f.latest.date })} · ${t(fluencyGoalWords(f.latest.level))}` : t("practising")}{f.latestPractice ? ` · ${t("Last practice: {n}", { n: f.latestPractice.wcpm })}` : ""}{f.plan ? ` · ${t("this week's goal {g} · next check {d}", { g: f.plan.goal, d: f.plan.nextCheck })}` : ""}{f.plan?.words.length ? <> · {t("words to practise at home:")} <span data-content lang="en">{f.plan.words.slice(0, 6).join(", ")}</span></> : ""}</p> : null; })()}
            <ParentWeek w={weeks.get(c.studentId)!} t={t} />
            <ParentMonthly s={summaries.get(c.studentId)!} t={t} lang={lang} />
            {/* 🐛 L11 fix: the weekly family summary PDF now recognizes a linked parent (family-week.ts); this is
                the first entry point that lets a parent reach it, same per-student link the teacher's own page uses. */}
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <span className="text-sm font-semibold text-brand-navy">📋 {t("This week's family summary")}</span>
              <a href={`/api/family-week?studentId=${encodeURIComponent(c.studentId)}&lang=en&print=1`} target="_blank" rel="noopener" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal">English</a>
              <a href={`/api/family-week?studentId=${encodeURIComponent(c.studentId)}&lang=ar&print=1`} target="_blank" rel="noopener" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal">عربي</a>
            </div>
            <ReportDownloads title={t("Progress report (this term)")} report={{ kind: "student", studentId: c.studentId, period: "TERM" }} formats={["pdf"]} />
          </div>
        ))
      )}
    </AppShell>
  );
}

/** never level wording: the same friendly words as the family report */
const LV: Record<string, string> = { BELOW: "🌱 Growing toward the grade goal", ON: "✅ Meeting the grade goal", ABOVE: "⭐ Doing better than the grade goal" };

/** 👪 This month (the last 30 days), in plain words — the same numbers as every other practice page (practice-totals.ts). */
function ParentMonthly({ s, t, lang }: { s: ParentSummary; t: TFn; lang: Lang }) {
  return (
    <div className="mt-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="font-bold text-brand-navy">{t("This month")} <span className="text-sm font-normal text-slate-500">· {t("the last 30 days")}</span></p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{t("Practice")}</p><p className="text-xl font-extrabold text-brand-navy">{s.answers30}</p><p className="text-xs text-slate-500">{t("answers")}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{t("Correct")}</p><p className="text-xl font-extrabold text-brand-navy">{s.accuracy30 ?? "—"}{s.accuracy30 !== null && "%"}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{t("MAP Reading")}</p>
          <p className="text-xl font-extrabold text-brand-navy">{s.map ? s.map.rit : "—"}{s.map?.goal ? <span className="text-sm font-semibold text-slate-500"> → {t("goal {n}", { n: s.map.goal })}</span> : null}</p>{s.map && <p className="text-xs text-slate-500">{s.map.term}</p>}</div>
      </div>
      {(s.categories.length > 0 || s.overall) && (
        <ul className="mt-3 space-y-1 text-sm">
          {s.categories.length ? s.categories.map((c) => <li key={c.name} className="flex flex-wrap justify-between gap-2"><span>{t(c.name)}</span><b>{t(LV[c.level] ?? "")}</b></li>)
            : <li className="flex flex-wrap justify-between gap-2"><span>{t("Reading level")}</span><b>{t(LV[s.overall!] ?? "")}</b></li>}
        </ul>
      )}
      <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900">🏠 {lang === "ar" ? s.tip.ar : s.tip.en}</p>
    </div>
  );
}

/** 🗓️ This week (the Riyadh school week from Sunday): the weekly goal (parts of the plan), answers, minutes, days. */
function ParentWeek({ w, t }: { w: WeekStats; t: TFn }) {
  return (
    <div className="mt-3 rounded-2xl bg-gradient-to-r from-teal-50 to-sky-50 p-5 ring-1 ring-teal-200">
      <p className="font-bold text-brand-navy">{t("This week")} <span className="text-sm font-normal text-slate-500">· {t("since {date}", { date: w.since })}</span></p>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">{t("Weekly goal")}</p><p className="text-xl font-extrabold text-brand-navy">{Math.min(w.partsDone, w.partsGoal)}/{w.partsGoal}</p><p className="text-xs text-slate-500">{w.reached ? `🎉 ${t("reached")}` : t("parts of the plan")}</p></div>
        <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">{t("Answers")}</p><p className="text-xl font-extrabold text-brand-navy">{w.answers}</p><p className="text-xs text-slate-500">{t("{n} correct", { n: w.correct })}</p></div>
        <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">{t("Minutes")}</p><p className="text-xl font-extrabold text-brand-navy">{w.minutes}</p></div>
        <div className="rounded-xl bg-white p-3"><p className="text-xs text-slate-500">{t("Days active")}</p><p className="text-xl font-extrabold text-brand-navy">{w.days}/7</p></div>
      </div>
      {w.parts.length > 0 && <p className="mt-2 text-sm text-slate-700">✅ {t("Finished this week:")} <span data-content lang="en">{w.parts.join(" · ")}</span></p>}
      {w.answers === 0 && <p className="mt-2 text-sm text-amber-800">{t("No practice yet this week. 15 minutes a day makes a big difference.")}</p>}
    </div>
  );
}

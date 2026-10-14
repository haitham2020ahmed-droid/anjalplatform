/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * 🚀 ReadRise growth evidence for teachers (server-rendered, no client JS): the class "Growth" tab and one
 * student's growth page (level history with reasons, first-try trend, words read, articles per week, skills,
 * growth confidence, stretch success, the grade's expected range, the projection with its range, and the fit of
 * each text: its measured level vs the student's level).
 */
import Link from "next/link";
import { Section } from "@/components/page-header";
import { AtAGlance } from "@/components/report-kit";
import type { TFn } from "@/i18n";
import type { ClassGrowth, StudentGrowthReport } from "@/server/readrise/growth-report";
import { FIT_LABEL, skillLabel } from "@/server/readrise/growth-words";
import { LevelHistogram, ScaledLineChart, day, fmt, levelRange, signed } from "@/app/admin/readrise/_components/ui";

const POSITION_TEXT = { BELOW: "Below the grade range", WITHIN: "Within the grade range", ABOVE: "Above the grade range" } as const;
const FIT_STYLE = { EXACT: "bg-emerald-50 text-emerald-800 ring-emerald-200", STRETCH: "bg-indigo-50 text-indigo-800 ring-indigo-200", EASY: "bg-slate-100 text-slate-700 ring-slate-200" } as const;
const CONF_LEVEL = { HIGH: "narrow range", MEDIUM: "moderate range", LOW: "wide range" } as const;
const KIND_ICON = { START: "🏁", PLACEMENT: "🧭", UP: "▲", DOWN: "▼", TEACHER: "✎", OTHER: "•" } as const;
const pctBar = (p: number | null) => ((p ?? 0) >= 75 ? "bg-emerald-500" : (p ?? 0) >= 50 ? "bg-amber-400" : "bg-red-400");

/** The skill bars (weakest last so strengths read first). */
function SkillBars({ skills, t }: { skills: { skill: string; pct: number | null; correct: number; total: number }[]; t: TFn }) {
  if (!skills.length) return <p className="text-sm text-slate-600">{t("No first-try answers yet.")}</p>;
  return (
    <ul className="space-y-2">
      {skills.map((k) => (
        <li key={k.skill} className="grid grid-cols-[9rem_minmax(0,1fr)_6rem] items-center gap-3 text-sm">
          <span className="truncate font-semibold text-slate-700">{t(skillLabel(k.skill))}</span>
          <span className="h-3 rounded-full bg-slate-100"><span className={`block h-3 rounded-full ${pctBar(k.pct)}`} style={{ width: `${k.pct ?? 0}%` }} /></span>
          <span className="text-end tabular-nums text-slate-700">{fmt(k.pct, "%")} <span className="text-xs text-slate-400">({k.correct}/{k.total})</span></span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ one student

/** "Level confirmed by 6 readings" (translated). */
export function confidenceWords(c: StudentGrowthReport["confidence"], t: TFn): string {
  if (!c) return t("Not confirmed yet");
  if (c.label === "MIXED") return t("Mixed evidence: {n} readings support it, {m} under 50%", { n: c.readings, m: c.against });
  if (c.readings === 0) return t("Not confirmed yet");
  return c.readings === 1 ? t("Level confirmed by 1 reading") : t("Level confirmed by {n} readings", { n: c.readings });
}

export function StudentGrowthView({ g, t, backHref }: { g: StudentGrowthReport; t: TFn; backHref: string }) {
  const back = <p className="mb-4"><Link href={backHref} className="text-sm font-semibold text-brand-teal hover:underline">‹ {t("Back to the class")}</Link></p>;
  if (!g.placed || g.level === null) return <>{back}<p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{g.name}: {t("No placement yet")}</p></>;
  const growth = g.level - (g.startLevel ?? g.level);
  const pts = g.history.map((e) => e.level);
  const proj = g.projection;
  const range = levelRange([...pts, proj?.low ?? null, proj?.high ?? null], g.band);
  const conf = g.confidence;
  return (
    <div className="space-y-6">
      {back}
      <h2 className="text-xl font-bold text-brand-navy">{g.name}</h2>
      <AtAGlance title={null} items={[
        { icon: "📊", label: "ReadRise Level", value: g.level, meaning: g.position ? t(POSITION_TEXT[g.position]) + ` (${g.band.low}–${g.band.high})` : undefined, tone: g.position === "BELOW" ? "warn" : g.position === "ABOVE" ? "good" : "info" },
        { icon: "📈", label: "Growth since the start", value: signed(growth), meaning: t("from {from}", { from: g.startLevel ?? "—" }), tone: growth > 0 ? "good" : growth < 0 ? "bad" : "neutral" },
        { icon: "✅", label: "Growth confidence", value: conf ? conf.readings : 0, meaning: confidenceWords(g.confidence, t), tone: conf?.label === "STRONG" || conf?.label === "CONFIRMED" ? "good" : conf?.label === "MIXED" ? "warn" : "neutral" },
        { icon: "🔭", label: "Projected end of year", value: proj ? proj.mid : "—", meaning: proj ? t("range {low}–{high} · {conf}", { low: proj.low, high: proj.high, conf: t(CONF_LEVEL[proj.confidence]) }) : t("Needs 4 first-try readings over 2 weeks"), tone: "info" },
        { icon: "📚", label: "Words read", value: g.wordsRead.toLocaleString("en-US"), meaning: t("{n} readings · {w} a week (8 weeks)", { n: g.readings, w: g.avgPerWeek ?? 0 }), tone: "neutral" },
        { icon: "🧗", label: "Stretch success", value: fmt(g.stretch.pct, "%"), meaning: t("{n} of {m} stretch readings at 75%+", { n: g.stretch.succeeded, m: g.stretch.tried }), tone: (g.stretch.pct ?? 0) >= 75 ? "good" : "neutral" },
      ]} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Level history" icon="🧭" hint={t("Placement, then every change with its reason. The shaded area is the grade's expected range (guidance).")}>
          <ScaledLineChart labels={g.history.map((e) => e.at.slice(5, 10))} series={[{ name: t("ReadRise Level"), color: "#0f766e", points: pts }]} title={t("Level history")} min={range.min} max={range.max} ticks={range.ticks} band={{ ...g.band, label: t("Grade {g} expected range", { g: g.grade }) }} height={200} />
          <ol className="mt-3 space-y-1.5 text-sm">
            {g.history.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true" className={`w-5 text-center ${e.kind === "UP" ? "text-emerald-700" : e.kind === "DOWN" ? "text-red-700" : "text-slate-500"}`}>{KIND_ICON[e.kind]}</span>
                <span className="w-20 shrink-0 tabular-nums text-slate-500">{day(e.at)}</span>
                <span className="w-24 shrink-0 font-semibold tabular-nums">{e.from !== null ? `${e.from} → ${e.level}` : e.level}</span>
                <span className="min-w-0 text-slate-700">{e.reason}</span>
              </li>
            ))}
          </ol>
        </Section>
        <Section title="First-try scores" icon="🎯" hint={t("The last 20 first tries. 75%+ moves the level up, under 50% down.")}>
          {g.trend.length === 0 ? <p className="text-sm text-slate-600">{t("No first-try answers yet.")}</p> : <>
            <ScaledLineChart labels={g.trend.map((x) => x.at.slice(5, 10))} series={[{ name: t("First-try score"), color: "#4f46e5", points: g.trend.map((x) => x.score) }]} title={t("First-try scores")} min={0} max={100} ticks={[0, 25, 50, 75, 100]} band={{ low: 50, high: 75, label: t("50–75%: the level holds") }} height={200} unit="%" />
            <p className="mt-2 text-sm text-slate-700">{g.earlierAvg !== null ? t("Last 5 average {a}% (the 5 before: {b}%)", { a: g.recentAvg ?? 0, b: g.earlierAvg }) : t("Last 5 average {a}%", { a: g.recentAvg ?? 0 })}</p>
          </>}
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Accuracy by question skill" icon="🧠" hint={t("First tries only.")}>
          <SkillBars skills={g.skills} t={t} />
          {g.stronger.length > 0 && <p className="mt-3 text-sm text-emerald-800">💪 {t("Getting stronger")}: {g.stronger.map((k) => `${t(skillLabel(k.skill))} (${k.early}% → ${k.recent}%)`).join(", ")}</p>}
        </Section>
        <Section title="Articles per week" icon="📅" hint={t("First tries in each of the last 8 weeks.")}>
          <div className="flex h-28 items-end gap-2" role="img" aria-label={t("Articles per week")}>
            {g.perWeek.map((n, i) => (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
                <span className="text-[11px] font-semibold tabular-nums text-slate-600">{n || ""}</span>
                <span className="w-full rounded-t bg-teal-500" style={{ height: `${(100 * n) / Math.max(1, ...g.perWeek)}%`, minHeight: n ? 3 : 0 }} />
                <span className="mt-1 text-[10px] text-slate-500">{g.weeks[i]}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Recent readings: text level and fit" icon="🎚" hint={t("The text's measured level against the student's level when reading. Exact = within 75 points; stretch = harder; easy = easier.")}>
        {g.recent.length === 0 ? <p className="text-sm text-slate-600">{t("No readings yet.")}</p> : (
          <div className="rk-box">
            <table className="w-full min-w-[40rem] text-start text-sm">
              <thead><tr className="border-b text-xs text-slate-500"><th className="p-2 text-start">{t("Date")}</th><th className="p-2 text-start">{t("Article")}</th><th className="p-2">{t("Text level (measured)")}</th><th className="p-2">{t("Student level")}</th><th className="p-2">{t("Fit")}</th><th className="p-2">{t("Score")}</th><th className="p-2">{t("Reading")}</th></tr></thead>
              <tbody>{g.recent.map((x) => (
                <tr key={x.runId} className="border-b last:border-0">
                  <td className="p-2 tabular-nums text-slate-600">{day(x.at)}</td>
                  <td className="p-2 font-semibold text-brand-navy">{x.title}</td>
                  <td className="p-2 text-center tabular-nums">{x.textLevel}<span className="block text-[11px] text-slate-400">{t("version {v}", { v: x.versionLevel })}</span></td>
                  <td className="p-2 text-center tabular-nums">{x.studentLevel}</td>
                  <td className="p-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${FIT_STYLE[x.fit]}`}>{t(FIT_LABEL[x.fit])}</span></td>
                  <td className="p-2 text-center tabular-nums">{fmt(x.score, "%")}</td>
                  <td className="p-2 text-center text-xs text-slate-600">{t(x.stretch ? "stretch" : x.firstTry ? "first try" : "re-read")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ the class

export function ClassGrowthTab({ g, t, studentHref, assignHref }: { g: ClassGrowth; t: TFn; studentHref: (id: string) => string; assignHref: string }) {
  return (
    <div className="space-y-6">
      <AtAGlance title={null} items={[
        { icon: "📈", label: "Growth this term", value: signed(g.term.avg), meaning: t("average since {d} · median {m}", { d: g.termStart.slice(0, 10), m: signed(g.term.median) }), tone: (g.term.avg ?? 0) > 0 ? "good" : "neutral" },
        { icon: "▲", label: "Moved up this term", value: `${g.term.movedUp} / ${g.term.placed}`, meaning: t("students whose level rose"), tone: "info" },
        { icon: "💤", label: "Not reading", value: g.notReading.length, meaning: t("no activity for 2 weeks"), tone: g.notReading.length ? "warn" : "good" },
        { icon: "🧠", label: "Weak skills", value: g.weaknesses.length, meaning: t("class accuracy under 70%"), tone: g.weaknesses.length ? "warn" : "good" },
      ]} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Where the class is" icon="📊" hint={t("Expected range for Grade {g}: {lo}–{hi}.", { g: g.grade, lo: g.band.low, hi: g.band.high })}>
          <LevelHistogram buckets={g.distribution} title={t("Students by ReadRise Level")} />
        </Section>
        <Section title="Not reading" icon="💤" hint={t("No reading started or finished for 2 weeks.")}>
          {g.notReading.length === 0 ? <p className="text-sm text-slate-600">{t("Everyone read in the last 2 weeks.")}</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {g.notReading.map((x) => <li key={x.studentId} className="flex justify-between gap-2 py-1.5"><Link href={studentHref(x.studentId)} className="font-semibold text-brand-navy hover:underline">{x.name}</Link><span className="text-slate-500">{x.placed ? t("last activity {d}", { d: day(x.lastActivity) }) : t("No placement yet")}</span></li>)}
            </ul>
          )}
        </Section>
      </div>
      <Section title="Skill weaknesses across the class" icon="🧠" hint={t("Skills with class accuracy under 70% (8+ answers), with articles that practise them and that most of the class has not read.")}>
        {g.weaknesses.length === 0 ? <p className="text-sm text-slate-600">{t("No weak skill across the class right now.")}</p> : (
          <ul className="space-y-4">
            {g.weaknesses.map((w) => (
              <li key={w.skill} className="rounded-xl p-3 ring-1 ring-slate-200">
                <p className="font-semibold text-brand-navy">{t(skillLabel(w.skill))} <span className="ms-2 tabular-nums text-red-700">{fmt(w.cell.pct, "%")}</span> <span className="text-xs text-slate-400">({w.cell.correct}/{w.cell.total})</span></p>
                {w.struggling.length > 0 && <p className="mt-1 text-sm text-slate-700">{t("Under 60%")}: {w.struggling.slice(0, 12).map((x) => `${x.name} (${x.pct}%)`).join(", ")}</p>}
                <p className="mt-1 text-sm text-slate-700">{t("Suggested articles")}: {w.suggested.length ? w.suggested.map((a) => `${a.title} (${t("{n} questions", { n: a.questions })})`).join(" · ") : "—"}</p>
              </li>
            ))}
          </ul>
        )}
        {g.weaknesses.some((w) => w.suggested.length) && <p className="mt-3 text-sm"><Link href={assignHref} className="font-semibold text-brand-teal hover:underline">{t("Assign articles")} →</Link></p>}
      </Section>
      <Section title="Growth evidence by student" icon="✅" hint={t("Confirmed by = first-try readings that support the current level. The projection is an estimate with its range.")}>
        <div className="rk-box rk-tall">
          <table className="w-full min-w-[44rem] text-start text-sm">
            <thead><tr className="border-b text-xs text-slate-500"><th className="p-2 text-start">{t("Student")}</th><th className="p-2">{t("Level now")}</th><th className="p-2">{t("Growth this term")}</th><th className="p-2 text-start">{t("Growth confidence")}</th><th className="p-2">{t("Projected end of year")}</th><th className="p-2">{t("Grade range")}</th></tr></thead>
            <tbody>{g.students.map((x) => (
              <tr key={x.studentId} className="border-b last:border-0">
                <td className="p-2"><Link href={studentHref(x.studentId)} className="font-semibold text-brand-navy hover:underline">{x.name}</Link></td>
                <td className="p-2 text-center font-bold tabular-nums">{fmt(x.level)}</td>
                <td className={`p-2 text-center tabular-nums ${(x.growthTerm ?? 0) > 0 ? "text-emerald-700" : (x.growthTerm ?? 0) < 0 ? "text-red-700" : ""}`}>{signed(x.growthTerm)}</td>
                <td className="p-2 text-slate-700">{x.level === null ? "—" : <><b className="tabular-nums">{x.confirmedBy}</b> {t("readings")}{x.against ? <span className="ms-1 text-xs text-amber-800">({t("{n} under 50%", { n: x.against })})</span> : null}</>}</td>
                <td className="p-2 text-center tabular-nums">{x.projection ? <>{x.projection.mid}<span className="block text-[11px] text-slate-500">{x.projection.low}–{x.projection.high}</span></> : "—"}</td>
                <td className="p-2 text-center text-xs">{x.position ? t(POSITION_TEXT[x.position]) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

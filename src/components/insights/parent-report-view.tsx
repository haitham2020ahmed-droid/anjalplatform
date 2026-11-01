import type { ParentReport } from "@/server/insights/parent-report";
import { getT } from "@/i18n/server";
import type { Lang, TFn } from "@/i18n";

/** The summary sentence in the reader's language (the report carries an Arabic copy; English otherwise). */
export const summaryIn = (summary: ParentReport["summary"], lang: Lang): string => (lang === "ar" && summary.ar ? summary.ar : summary.en);

/** 👪 The parent report, in plain words. Used by the teacher (preview) and the parent. The interface words follow the
 *  reader's language (getT); skill names, MAP subjects and comments stay as written. `t`/`lang` override for tests. */
export async function ParentReportView({ r, t: tIn, lang: langIn }: { r: ParentReport; t?: TFn; lang?: Lang }) {
  const cur = tIn && langIn ? null : await getT();
  const t = tIn ?? cur!.t;
  const lang = langIn ?? cur!.lang;
  const box = "rounded-2xl bg-white p-5 ring-1 ring-slate-200 break-inside-avoid";
  const list = (xs: string[], empty: string) => (xs.length ? <ul className="mt-2 list-disc space-y-1 ps-6">{xs.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="mt-2 text-slate-500">{empty}</p>);
  const springGoal = (n: number) => t("Spring goal {n}", { n });
  return (
    <article className="space-y-4 text-slate-800">
      <header className="rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy to-brand-purple p-6 text-white">
        <p className="text-sm text-white/80">{t("Progress report")} · {r.date}</p>
        <h1 className="text-3xl font-extrabold"><bdi>{r.name}</bdi></h1>
        <p className="text-white/85">{t("Grade {n}", { n: r.grade })}{r.className ? <> · <bdi>{r.className}</bdi></> : ""}</p>
      </header>
      <section className={box}><p className="text-lg">{summaryIn(r.summary, lang)}</p>
        {r.share.note && <p className="mt-3 rounded-xl bg-teal-50 px-3 py-2 text-teal-900">💬 {t("Teacher:")} {r.share.note}</p>}</section>
      <section className={`${box} grid gap-3 sm:grid-cols-4`}>
        {([["Questions answered", String(r.practice.answers)], ["Correct", r.practice.accuracy === null ? "—" : `${r.practice.accuracy}%`], ["Practice this month", t("{n} min", { n: r.practice.minutesMonth })], ["Tasks finished", `${r.practice.tasksDone}${r.practice.tasksLate ? ` (${t("{n} late", { n: r.practice.tasksLate })})` : ""}`]] as const).map(([en, v]) => (
          <div key={en} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{t(en)}</p><p className="text-2xl font-extrabold text-brand-navy">{v}</p></div>
        ))}
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <section className={box}><h2 className="font-bold text-brand-navy">✅ {t("Skills Completed")}</h2>{list(r.completed.slice(0, 12), t("None yet — keep practising!"))}</section>
        <section className={box}><h2 className="font-bold text-brand-navy">💪 {t("Strengths")}</h2>{list(r.strengths, t("We will see them soon."))}</section>
        <section className={box}><h2 className="font-bold text-brand-navy">🎯 {t("Practise Next")}</h2>{list(r.practiseNext, t("Nothing urgent."))}</section>
      </div>
      {r.map.length > 0 && (
        <section className={box}><h2 className="font-bold text-brand-navy">🗺️ {t("MAP Test")}</h2>
          <div className="mt-2 grid gap-x-6 gap-y-1 text-[12px] leading-snug text-slate-600 sm:grid-cols-2">
            <p><b>{t("What is MAP Growth?")}</b> {t("A test that adapts to your child’s answers in real time to measure their level.")}</p>
            <p><b>{t("What is a RIT score?")}</b> {t("The overall score for a subject, on a scale from 100 to 350. Higher is further along.")}</p>
          </div>
          <ul className="mt-3 space-y-1">{r.map.map((m) => <li key={m.subject}><b>{m.subject}</b>: {t("Fall")} {m.fall ?? "—"}{m.latest ? ` → ${t(m.latestTerm ?? "")} ${m.latest}` : ""}{m.target ? ` · ${springGoal(m.target)}` : ""} — {t(m.status)}</li>)}</ul>
          <p className="mt-2 text-xs text-slate-500">{t("The MAP score (RIT) grows during the year. The Spring goal is the score NWEA expects your child to reach by the Spring MAP test, based on where they started.")}</p>
        </section>
      )}
      {r.mapPlans.length > 0 && (
        <section className={box}><h2 className="font-bold text-brand-navy">📋 {t("MAP Plan")}</h2>
          {r.mapPlans.map((pl) => (
            <div key={pl.id} className="mt-2">
              <p className="font-semibold">{pl.subject} · {t(pl.term)}{pl.goal ? ` · ${springGoal(pl.goal)}` : ""}</p>
              <ul className="mt-1 space-y-1">{pl.items.map((i) => <li key={i.name}>{i.icon} <b>{i.name}</b>{i.skills.length ? `: ${i.skills.join(", ")}` : ""} — {i.done ? `✅ ${t("done")}` : i.progress !== null ? `${i.progress}%` : t("to start")}</li>)}</ul>
            </div>
          ))}
          <p className="mt-2 text-xs text-slate-500">{t("The plan practises the MAP areas your child needs most, at the right level.")}</p>
        </section>
      )}
      {r.comments.length > 0 && (
        <section className={box}><h2 className="font-bold text-brand-navy">💬 {t("Teacher Comments")}</h2>
          <ul className="mt-2 space-y-2">{r.comments.map((c, i) => <li key={i}><span className="text-xs text-slate-500">{c.date}</span><p className="whitespace-pre-line">{c.body}</p></li>)}</ul>
        </section>
      )}
      {r.badges.length > 0 && <section className={box}><h2 className="font-bold text-brand-navy">🏅 {t("Badges")}</h2><p className="mt-2 text-2xl">{r.badges.map((b) => <span key={b.name} title={b.name} className="me-2">{b.icon}</span>)}</p></section>}
    </article>
  );
}

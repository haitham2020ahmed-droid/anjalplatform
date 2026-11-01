/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { StudentAnalytics } from "../../server/analytics/reports";
import type { StarStatus } from "../../server/skills/status";
import { makeT, type Lang } from "../../i18n";
import { getT } from "../../i18n/server";

function M({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-sm text-slate-500">{label}</dt><dd className="text-xl font-bold tabular-nums text-brand-navy">{value}</dd></div>;
}

const STAR_ICON: Record<StarStatus, string> = { NOT_STARTED: "☆", IN_PROGRESS: "◐", NEEDS_REVIEW: "🔄", MASTERED: "⭐", NEXT_LEVEL: "⭐" };
const STAR_WORD: Record<StarStatus, string> = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", NEEDS_REVIEW: "Needs review", MASTERED: "Mastered", NEXT_LEVEL: "Mastered" };

/**
 * Student analytics (brief §11), internal measures; imported MAP results shown separately.
 * Questions / accuracy / minutes = the Practice and time numbers; growth = the change of the stars in the period
 * (each skill's star at the start → now), never the engine's score change. Every label goes through t().
 */
export async function StudentAnalyticsView({ a, lang }: { a: StudentAnalytics; lang?: Lang }) {
  const t = lang ? makeT(lang) : (await getT()).t;
  const c = a.starChange;
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="text-lg font-bold text-brand-navy">{t("Progress: {period}", { period: t(a.period) })}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4 lg:grid-cols-6">
        <M label={t("Questions")} value={String(a.questions)} />
        <M label={t("Correct / incorrect")} value={`${a.correct} / ${a.incorrect}`} />
        <M label={t("Accuracy")} value={a.accuracyPct === null ? "–" : `${a.accuracyPct}%`} />
        <M label={t("Learning time")} value={t("{n} min", { n: a.minutes })} />
        <M label={t("Avg time per question")} value={a.avgSeconds === null ? "–" : `${a.avgSeconds}s`} />
        <M label={t("Sessions completed")} value={String(a.sessions)} />
        <M label={t("Longest session")} value={t("{n} min", { n: a.longestSessionMinutes })} />
        <M label={t("Skills practised")} value={String(a.skillsAttempted)} />
        <M label={t("⭐ Mastered / ◐ in progress")} value={`${a.skillsMastered} / ${a.skillsDeveloping}`} />
        <M label={t("🔄 Needing support")} value={String(a.skillsNeedingIntervention)} />
        <M label={t("Ability (θ)")} value={a.ability === null ? "–" : String(a.ability)} />
        <M label={t("Reading range")} value={a.readingRange ?? t("After placement")} />
        <M label={t("Best streak correct")} value={String(a.streakCorrect.longest)} />
        <M label={t("Current streak")} value={a.streakCorrect.current ? t("{n} correct", { n: a.streakCorrect.current }) : a.streakIncorrect.current ? t("{n} incorrect", { n: a.streakIncorrect.current }) : "–"} />
        <M label={t("Highest level correct")} value={a.highestLevelCorrect ? t("Level {n}", { n: a.highestLevelCorrect }) : "–"} />
        <M label={t("Curriculum progress")} value={a.curriculumProgressPct === null ? "–" : `${a.curriculumProgressPct}%`} />
      </dl>
      <p className="mt-3 text-xs text-slate-500">{t("Answers from skill practice, NAFS practice and ReadRise. Accuracy leaves out answers that were too fast to have been read.")}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div>
          <h3 className="font-semibold text-brand-navy">{t("Star change this period")}</h3>
          <p className="mt-2 text-lg font-bold text-brand-navy">{t("⭐ {n} new stars", { n: c.gained })} · {t("🔄 {n} needs review", { n: c.toReview })}</p>
          <p className="mt-1 text-sm text-slate-600">{t("{up} skills went up a star · {down} went down", { up: c.up, down: c.down })}</p>
          <p className="mt-3 text-sm text-slate-600">{t("Unit progress:")} {a.unitProgress.map((u) => `U${u.unit} ${u.pct}%`).join(", ")}</p>
        </div>
        <div>
          <h3 className="font-semibold text-brand-navy">{t("Stars by skill: start → now")}</h3>
          {a.starSkills.length === 0 ? <p className="mt-2 text-sm text-slate-600">{t("No skill practised for a star yet.")}</p> : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {a.starSkills.map((s) => (
                <li key={s.key} className="flex justify-between gap-3 py-1.5">
                  <span>{s.name}</span>
                  <span className="whitespace-nowrap" title={`${t(STAR_WORD[s.then])} → ${t(STAR_WORD[s.now])}`}>
                    <span aria-hidden="true">{STAR_ICON[s.then]} → {STAR_ICON[s.now]}</span>{" "}
                    <span className="text-slate-600">{t(STAR_WORD[s.now])}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="mt-6 rounded-xl bg-slate-50 p-4">
        <h3 className="font-semibold text-brand-navy">{t("Imported MAP Growth Results")}</h3>
        {a.importedMap.length === 0 ? <p className="mt-1 text-sm text-slate-600">{t("No MAP results have been imported for this student.")}</p> : (
          <ul className="mt-1 text-sm">{a.importedMap.map((m, i) => <li key={i}>{m.testDate}: {m.subject}{m.goalArea ? `, ${m.goalArea}` : ""}, RIT {m.rit}{m.percentile !== null ? `, ${t("percentile")} ${m.percentile}` : ""}</li>)}</ul>
        )}
        <p className="mt-1 text-xs text-slate-500">{t("Official values from imported files only; never calculated by this platform.")}</p>
      </div>
    </section>
  );
}

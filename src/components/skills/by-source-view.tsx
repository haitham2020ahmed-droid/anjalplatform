/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { BySourceReport, SkillSource, Trend } from "../../server/skills/skills-by-source";
import type { StarStatus } from "../../server/skills/status";
import { makeT, type Lang } from "../../i18n";
import { getT } from "../../i18n/server";
import { Sparkline } from "../nafs/charts";
import { SkillStar } from "./skill-star";

const ARROW: Record<Trend, string> = { UP: "↑", DOWN: "↓", FLAT: "→" };
const ARROW_LABEL: Record<Trend, string> = { UP: "Star went up", DOWN: "Star went down", FLAT: "Same star" };
const ARROW_TONE: Record<Trend, string> = { UP: "text-emerald-700", DOWN: "text-amber-700", FLAT: "text-slate-500" };
const STAR_ICON: Record<StarStatus, string> = { NOT_STARTED: "☆", IN_PROGRESS: "◐", NEEDS_REVIEW: "🔄", MASTERED: "⭐", NEXT_LEVEL: "⭐" };
const STAR_WORD: Record<StarStatus, string> = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", NEEDS_REVIEW: "Needs review", MASTERED: "Mastered", NEXT_LEVEL: "Mastered" };
/** the source names on screen (SOURCE_LABEL stays the English data value) */
const SOURCE_TEXT: Record<SkillSource, string> = {
  CURRICULUM: "Curriculum", MAP: "MAP Growth", GRAMMAR: "Grammar", READMASTER: "ReadMaster (NAFS-style)", RTI: "RTI / Intervention", ENRICHMENT: "Enrichment",
};

/**
 * ⭐ Skills by source: each source's skills with their star (the same stars as Student Skills, one row per skill), a
 * "star this period" table underneath it (↑ the star went up / → same star / ↓ went down, from the skill's star at the
 * period start → now; never ↓ on a ⭐ skill), a "practice score" sparkline (no verdict), and a cross-source summary.
 * Rendered by the teacher's student page (cookie language) and the Final Report (`lang` passed in).
 */
export async function BySourceView({ r, lang }: { r: BySourceReport; lang?: Lang }) {
  const t = lang ? makeT(lang) : (await getT()).t;
  const starText = (st: StarStatus | null) => (st ? `${STAR_ICON[st]} ${t(STAR_WORD[st])}` : "—");
  return (
    <section className="space-y-5" aria-labelledby="by-source-h">
      <h2 id="by-source-h" className="text-xl font-extrabold text-brand-navy">{t("⭐ Skills by source")}</h2>
      {r.groups.length === 0 && <p className="rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">{t("No practised skills yet.")}</p>}
      {r.groups.map((g) => (
        <div key={g.source} className="rounded-3xl bg-white p-5 ring-1 ring-slate-200 print:break-inside-avoid">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-brand-navy">{t(SOURCE_TEXT[g.source] ?? g.label)}</h3>
            <span className="text-sm font-semibold text-amber-700">
              {t("⭐ {n} of {total} mastered", { n: g.mastered, total: g.skills.length })}{g.avgMastery !== null ? <span className="font-normal text-slate-600"> · {t("average star score {n}", { n: g.avgMastery })}</span> : null}
            </span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead><tr className="border-b text-slate-500"><th className="py-1 pe-2 text-start">{t("Skill")}</th><th className="pe-2 text-start">{t("Star")}</th><th className="pe-2 text-start">{t("Star score")}</th><th className="pe-2 text-start">{t("Answers")}</th><th className="text-start">{t("Accuracy")}</th></tr></thead>
              <tbody>
                {g.skills.map((k) => (
                  <tr key={k.key} className="border-b last:border-0">
                    <td className="py-1 pe-2">{k.name}</td>
                    <td className="pe-2"><span className="inline-flex items-center gap-1.5"><SkillStar info={k.star} label={k.name} /><span className="text-slate-600">{t(k.band)}</span></span></td>
                    <td className="pe-2 tabular-nums text-slate-600">{k.status === "NOT_STARTED" ? "—" : k.score}</td>
                    <td className="pe-2 tabular-nums">{k.attempts}</td>
                    <td className="tabular-nums">{k.accuracyPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4 className="mt-4 text-sm font-bold text-brand-navy">{t("📈 Star this period")}</h4>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead><tr className="border-b text-slate-500"><th className="py-1 pe-2 text-start">{t("Skill")}</th><th className="pe-2 text-start">{t("Change")}</th><th className="pe-2 text-start">{t("Start → now")}</th><th className="text-start">{t("Practice score")}</th></tr></thead>
              <tbody>
                {g.skills.map((k) => (
                  <tr key={k.key} className="border-b last:border-0">
                    <td className="py-1 pe-2">{k.name}</td>
                    <td className={`pe-2 text-lg font-bold ${k.trend ? ARROW_TONE[k.trend] : "text-slate-400"}`} title={k.trend ? t(ARROW_LABEL[k.trend]) : t("Not started yet")}>
                      {k.trend ? ARROW[k.trend] : "—"}
                    </td>
                    <td className="pe-2 text-slate-600">{k.trend ? <>{starText(k.starThen)} → {starText(k.starNow)}</> : t("Not started yet")}</td>
                    <td>{k.series.some((p) => p.mastery !== null) ? <Sparkline points={k.series.map((p) => p.mastery)} label={`${k.name}: ${t("Practice score")}`} /> : <span className="text-slate-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200 print:break-inside-avoid">
        <h3 className="text-lg font-bold text-brand-navy">{t("Cross-source summary")}</h3>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            [t("Skills"), r.summary.totalSkills], [t("Avg star score"), r.summary.avgMastery ?? "—"], [t("⭐ Mastered"), r.summary.mastered], [t("🔄 Needs support"), r.summary.needsSupport],
            [t("↑ Star went up"), r.summary.up], [t("↓ Star went down"), r.summary.down], [t("→ Same star"), r.summary.flat],
          ] as const).map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white p-3 ring-1 ring-slate-200"><dt className="text-xs text-slate-500">{l}</dt><dd className="text-xl font-extrabold text-brand-navy">{v}</dd></div>
          ))}
        </dl>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead><tr className="border-b text-slate-500"><th className="py-1 pe-2 text-start">{t("Source")}</th><th className="pe-2 text-start">{t("Avg star score")}</th><th className="pe-2 text-start">{t("⭐ Mastered")}</th><th className="pe-2 text-start">{t("◐ In progress")}</th><th className="text-start">{t("🔄 Needs support")}</th></tr></thead>
            <tbody>
              {r.groups.map((g) => (
                <tr key={g.source} className="border-b last:border-0">
                  <td className="py-1 pe-2">{t(SOURCE_TEXT[g.source] ?? g.label)}</td><td className="pe-2 tabular-nums">{g.avgMastery ?? "—"}</td>
                  <td className="pe-2 tabular-nums">{g.mastered}</td><td className="pe-2 tabular-nums">{g.developing}</td><td className="tabular-nums">{g.needsSupport}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

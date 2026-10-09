/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { MapComparison } from "../../server/analytics/map-compare";

const SUBJECT: Record<string, string> = { READING: "Reading", LANGUAGE_USAGE: "Language Usage" };

/** MAP (imported, official) and platform mastery side by side — never converted into each other. */
export function MapComparisonView({ data }: { data: MapComparison[] }) {
  if (!data.length) return null;
  return (
    <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="text-lg font-bold text-brand-navy">MAP Growth and Platform Practice</h2>
      <p className="text-sm text-slate-500">MAP RIT values are imported official results. Platform mastery is this platform&apos;s own measure. They are shown side by side and are not converted into each other.</p>
      {data.map((c) => (
        <div key={c.subject} className="mt-4">
          <h3 className="font-semibold text-brand-navy">{SUBJECT[c.subject] ?? c.subject}: RIT {c.overallRit}{c.percentile !== null ? `, percentile ${c.percentile}` : ""} <span className="font-normal text-slate-500">({c.termName ?? c.testDate})</span></h3>
          <table className="mt-2 min-w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="px-2 py-1">MAP goal</th><th className="px-2 py-1">Goal RIT</th><th className="px-2 py-1">Platform mastery</th><th className="px-2 py-1">Suggestion</th></tr></thead>
            <tbody>{c.goals.map((g) => (
              <tr key={g.goalName} className="border-t border-slate-100 align-top">
                <td className="px-2 py-1.5">{g.goalName}</td>
                <td className="px-2 py-1.5 tabular-nums">{g.goalRit}{g.relativeWeakness ? <span className="block text-xs text-amber-800">below this student&apos;s overall RIT</span> : null}</td>
                <td className="px-2 py-1.5">{g.platformMastery === null ? "No practice yet" : `${g.platformMastery} (${g.platformSkills.map((s) => s.name).join(", ")})`}</td>
                <td className={["px-2 py-1.5", g.recommendation === "Additional practice recommended" ? "font-semibold text-amber-900" : "text-slate-600"].join(" ")}>{g.recommendation}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

/** @jsxRuntime automatic */
/** @jsxImportSource react */
/** Students × skills mastery heat map. Colour = stage; the number is the mastery score. */
import type { MasteryGrid } from "../../server/teacher/queries";
import type { MasteryBandName } from "../../types/domain";

const CELL: Record<MasteryBandName, string> = {
  BEGINNING: "bg-teal-50 text-teal-900",
  DEVELOPING: "bg-teal-100 text-teal-900",
  APPROACHING: "bg-teal-300 text-teal-950",
  PROFICIENT: "bg-teal-600 text-white",
  MASTERED: "bg-brand-gold text-slate-900",
};
const LABEL: Record<MasteryBandName, string> = { BEGINNING: "Beginning", DEVELOPING: "Developing", APPROACHING: "Approaching", PROFICIENT: "Proficient", MASTERED: "Mastered" };

export function HeatMap({ grid, studentHref }: { grid: MasteryGrid; studentHref: (id: string) => string }) {
  return (
    <div>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-semibold text-brand-navy">Student</th>
              {grid.skills.map((k) => (
                <th key={k.skillId} scope="col" className="h-40 w-11 min-w-11 align-bottom">
                  <span className="mx-auto block w-6 whitespace-nowrap pb-2 text-left font-medium text-slate-600 [writing-mode:vertical-rl] rotate-180">{k.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((r) => (
              <tr key={r.studentId}>
                <th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-t border-slate-100 bg-white px-4 py-2 text-left font-medium">
                  <a href={studentHref(r.studentId)} className="text-brand-navy hover:text-brand-teal">{r.name}</a>
                </th>
                {r.cells.map((c, i) => (
                  <td key={i} className="border-t border-slate-100 p-0.5">
                    {c ? (
                      <span title={`${grid.skills[i].name}: ${LABEL[c.band]} (${c.score})`} className={["flex h-9 w-10 items-center justify-center rounded-md text-xs font-semibold tabular-nums", CELL[c.band]].join(" ")}>{c.score}</span>
                    ) : (
                      <span title={`${grid.skills[i].name}: not started`} className="flex h-9 w-10 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">–</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600" aria-label="Key">
        <li className="flex items-center gap-2"><span className="h-4 w-4 rounded bg-slate-100" />Not started</li>
        {(Object.keys(LABEL) as MasteryBandName[]).map((b) => <li key={b} className="flex items-center gap-2"><span className={["h-4 w-4 rounded", CELL[b].split(" ")[0]].join(" ")} />{LABEL[b]}</li>)}
      </ul>
    </div>
  );
}

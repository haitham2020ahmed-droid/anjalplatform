/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * Students × skills grid of one unit: ⭐ the same star per student and skill as Student Skills (☆ Not started ·
 * ◐ In progress · ⭐ Mastered · ☆⬆ Next level · 🔄 Needs review), one column per skill (copies are one skill).
 * The small number under a started star is the star score (0–100).
 */
import type { MasteryGrid } from "../../server/teacher/queries";
import { SkillStar, StarGlyph } from "../skills/skill-star";

const CELL: Record<string, string> = {
  IN_PROGRESS: "bg-sky-50",
  MASTERED: "bg-amber-50",
  NEXT_LEVEL: "bg-amber-50",
  NEEDS_REVIEW: "bg-orange-50",
};

export function HeatMap({ grid, studentHref }: { grid: MasteryGrid; studentHref: (id: string) => string }) {
  return (
    <div>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-white px-4 py-3 text-left font-semibold text-brand-navy">Student</th>
              {grid.skills.map((k) => (
                <th key={k.key} scope="col" className="h-40 w-11 min-w-11 align-bottom">
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
                      <span data-star-cell={c.status} className={["flex h-9 w-10 flex-col items-center justify-center rounded-md text-[10px] tabular-nums text-slate-600", CELL[c.status] ?? "bg-slate-50"].join(" ")}>
                        <SkillStar info={c} label={grid.skills[i].name} size={16} />
                        {c.score}
                      </span>
                    ) : (
                      <span title={`${grid.skills[i].name}: Not started`} className="flex h-9 w-10 items-center justify-center rounded-md bg-slate-50"><StarGlyph status="NOT_STARTED" size={14} /></span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600" aria-label="Key">
        {([["NOT_STARTED", "Not started"], ["IN_PROGRESS", "In progress"], ["MASTERED", "Mastered"], ["NEXT_LEVEL", "Next level"], ["NEEDS_REVIEW", "Needs review"]] as const).map(([st, l]) => (
          <li key={st} className="flex items-center gap-1.5"><StarGlyph status={st} size={14} />{l}</li>
        ))}
        <li className="text-xs text-slate-500">The number is the star score (0–100).</li>
      </ul>
    </div>
  );
}

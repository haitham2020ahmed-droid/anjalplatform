import Link from "next/link";
/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { SkillCard, UnitSummary } from "../../server/queries/student-curriculum";
import { SkillRow } from "./skill-row";

const GROUP_ORDER = ["Literature", "Informational text", "Comprehension", "Vocabulary", "Word study", "Grammar", "Punctuation & capitals", "Spelling", "Writing"];

/** Unit page body: what to do next, then every skill of the unit grouped by kind. */
export function UnitSkills({ unit, cards, grade, bookTitle }: { unit: UnitSummary; cards: SkillCard[]; grade: number; bookTitle: string }) {
  const next = cards.filter((c) => c.recommended);
  const groups = GROUP_ORDER.map((g) => ({ g, items: cards.filter((c) => c.category === g) })).filter((x) => x.items.length);
  return (
    <div>
      <Link href="/student" className="text-sm font-medium text-brand-teal hover:underline">Back to Grade {grade} units</Link>
      <header className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Grade {grade}, {bookTitle}</p>
          <h1 className="text-3xl font-bold tracking-tight text-brand-navy">{/^Unit \d+$/.test(unit.title) ? unit.title : `Unit ${unit.number}: ${unit.title}`}</h1>
          {unit.lessons.length > 0 && <p className="mt-1 text-slate-600">{unit.lessons.join(", ")}</p>}
        </div>
        <p className="text-slate-600"><span className="text-2xl font-bold tabular-nums text-brand-navy">{unit.proficientOrBetter}</span> of {unit.skills} skills at Proficient or above</p>
      </header>

      {next.length > 0 && (
        <section aria-labelledby="next" className="mt-8 rounded-2xl bg-brand-navy p-6 text-white">
          <h2 id="next" className="text-lg font-semibold">Up Next for You</h2>
          <ol className="mt-4 grid gap-3 md:grid-cols-3">
            {next.map((c) => (
              <li key={c.skillId}>
                <a href={`/practice/${c.skillId}`} className="block h-full rounded-xl bg-white/10 p-4 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-gold">
                  <span className="block font-semibold">{c.name}</span>
                  <span className="mt-1 block text-sm text-white/80">{c.recommendedReason}.</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      {groups.map(({ g, items }) => (
        <section key={g} aria-labelledby={`g-${g}`} className="mt-10">
          <h2 id={`g-${g}`} className="text-xl font-bold text-brand-navy">{g}</h2>
          <ul className="mt-2">{items.map((c) => <SkillRow key={c.skillId} card={c} />)}</ul>
        </section>
      ))}
    </div>
  );
}

import Link from "next/link";
import type { FinderQuestion, FinderResult } from "@/server/curriculum/question-finder";
import { assignAdaptiveFromBankAction, assignReadySetFromBankAction } from "./actions";

const PREVIEW = 8;
const GROUPS: { key: keyof FinderResult["groups"]; label: string; hint: string }[] = [
  { key: "lesson", label: "Linked to this lesson", hint: "Questions placed on this lesson (or its Curriculum Map place) for this skill." },
  { key: "skill", label: "Same skill", hint: "More practice with the same skill, from any lesson or none." },
  { key: "standard", label: "Same standard — revision", hint: "Other skills of this grade with the same standard." },
];

function Preview({ items }: { items: FinderQuestion[] }) {
  if (!items.length) return <p className="mt-2 text-sm text-slate-500">None.</p>;
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {items.slice(0, PREVIEW).map((q) => (
        <li key={q.id} className="flex gap-2">
          <span className="shrink-0 rounded bg-slate-100 px-1.5 text-xs font-semibold text-slate-700" title="Difficulty level · Depth of Knowledge">D{q.difficultyLevel} · {q.dok ? `DOK ${q.dok}` : "DOK –"}</span>
          <span className="text-slate-800">{q.stem || "(no text)"}{q.standardCode ? <span className="text-xs text-slate-500"> · {q.standardCode}</span> : null}</span>
        </li>
      ))}
      {items.length > PREVIEW && <li className="text-xs text-slate-500">…and {items.length - PREVIEW} more.</li>}
    </ul>
  );
}

/** 🔎 Questions from the bank for a curriculum skill: counts per group, difficulty × DOK, gaps, previews, two ways to assign. */
export function BankPanel({ found, classId, link }: { found: FinderResult; classId: string; link: (o: Record<string, string>) => string }) {
  const pool = found.groups.lesson.length + found.groups.skill.length;
  const doks = [1, 2, 3, 4, null] as (number | null)[];
  const box = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <section aria-labelledby="bank-h" className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 id="bank-h" className="text-lg font-bold text-brand-navy">🔎 Questions from the bank</h2>
      <p className="text-sm text-slate-600">
        Matched by skill and standard{found.skill.standards.length ? ` (${found.skill.standards.map((x) => x.code).join(", ")})` : ""}, Grade {found.skill.grade}, published only. Questions do not need a lesson.
      </p>
      {found.lessons.length > 0 && (
        <nav aria-label="Lesson" className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link href={link({ lessonId: "" })} aria-current={!found.lesson ? "page" : undefined} className={`rounded-full px-3 py-1 font-semibold ${!found.lesson ? "bg-brand-navy text-white" : "ring-1 ring-slate-300"}`}>Any lesson</Link>
          {found.lessons.map((l) => <Link key={l.id} href={link({ lessonId: l.id })} aria-current={found.lesson?.id === l.id ? "page" : undefined} className={`rounded-full px-3 py-1 font-semibold ${found.lesson?.id === l.id ? "bg-brand-navy text-white" : "ring-1 ring-slate-300"}`}>{l.title}</Link>)}
        </nav>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.key} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200" title={g.hint}>
            <p className="text-2xl font-bold text-brand-navy">{g.key === "lesson" && !found.lesson ? "–" : found.groups[g.key].length}</p>
            <p className="text-sm font-semibold text-slate-700">{g.label}</p>
            {g.key === "lesson" && !found.lesson && <p className="text-xs text-slate-500">Choose a lesson above.</p>}
          </div>
        ))}
      </div>
      {pool > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="text-sm">
            <caption className="mb-1 text-left font-semibold text-slate-700">This skill's questions: difficulty × DOK</caption>
            <thead><tr><th scope="col" className="px-2 text-left">Difficulty</th>{doks.map((d) => <th key={String(d)} scope="col" className="px-2">{d ? `DOK ${d}` : "DOK not set"}</th>)}<th scope="col" className="px-2">Total</th></tr></thead>
            <tbody>
              {found.byDifficulty.map((r) => (
                <tr key={r.level} className={r.count ? "" : "text-slate-400"}>
                  <th scope="row" className="px-2 text-left font-medium">Level {r.level}</th>
                  {doks.map((d) => <td key={String(d)} className="px-2 text-center">{found.grid[`${r.level}|${d ?? "-"}`] ?? 0}</td>)}
                  <td className="px-2 text-center font-semibold">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {found.gaps.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200" aria-label="Gaps">
          {found.gaps.map((g) => <li key={g}>⚠️ {g}</li>)}
        </ul>
      )}
      <div className="mt-4 space-y-2">
        {GROUPS.filter((g) => g.key !== "lesson" || found.lesson).map((g) => (
          <details key={g.key} className="rounded-lg p-3 ring-1 ring-slate-200">
            <summary className="cursor-pointer font-semibold text-brand-navy">{g.label} ({found.groups[g.key].length})</summary>
            <Preview items={found.groups[g.key]} />
          </details>
        ))}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <form action={assignAdaptiveFromBankAction} className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
          <input type="hidden" name="classId" value={classId} /><input type="hidden" name="skillId" value={found.skill.id} /><input type="hidden" name="lessonId" value={found.lesson?.id ?? ""} />
          <p className="font-semibold text-slate-900">Adaptive practice</p>
          <p className="text-sm text-slate-600">The engine picks each student's questions by mastery, previous answers, difficulty and weakness.</p>
          <label className="mt-2 flex flex-col text-sm">Due date (optional)<input type="date" name="dueAt" className={box} /></label>
          <button disabled={pool === 0} className="mt-3 rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">Assign adaptive practice on this skill</button>
        </form>
        <form action={assignReadySetFromBankAction} className="rounded-xl bg-sky-50 p-4 ring-1 ring-sky-200">
          <input type="hidden" name="classId" value={classId} /><input type="hidden" name="skillId" value={found.skill.id} /><input type="hidden" name="lessonId" value={found.lesson?.id ?? ""} />
          <p className="font-semibold text-slate-900">Ready set</p>
          <p className="text-sm text-slate-600">Everyone gets the same balanced set: lesson questions first, then the skill, spread around the class's level.</p>
          <div className="mt-2 flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col">N (questions)<input type="number" name="n" min={3} max={30} defaultValue={10} className={`${box} w-24`} /></label>
            <label className="flex flex-col">Due date (optional)<input type="date" name="dueAt" className={box} /></label>
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="revision" value="1" disabled={!found.groups.standard.length} />Include revision (1–2 questions with the same standard)</label>
          <button disabled={pool === 0} className="mt-3 rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple disabled:opacity-50">Assign a ready set of N questions</button>
        </form>
      </div>
    </section>
  );
}

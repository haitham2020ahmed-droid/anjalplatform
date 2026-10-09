import Link from "next/link";
import type { SuggestionView } from "@/server/ai/jobs";
import { reviewAction } from "@/app/admin/ai-tools/actions";

const KIND: Record<string, [string, string]> = {
  KEY_ERROR: ["❗ Wrong answer key", "bg-red-100 text-red-800"], MULTIPLE_CORRECT: ["❗ More than one correct", "bg-red-100 text-red-800"],
  UNCLEAR: ["❓ Unclear", "bg-orange-100 text-orange-900"], WEAK_DISTRACTOR: ["🎯 Weak option", "bg-amber-100 text-amber-900"], SPELLING: ["✏️ Spelling / grammar", "bg-sky-100 text-sky-900"],
  TAG: ["🏷️ Tags", "bg-violet-100 text-violet-900"], READING_LEVEL: ["📖 Reading level", "bg-teal-100 text-teal-900"], DUPLICATE: ["👯 Duplicate", "bg-slate-200 text-slate-800"],
};

/** AI-suggested results: Approve / Edit / Reject one by one, or tick and approve all. Most serious first. */
export function ReviewTable({ rows, back, sample }: { rows: SuggestionView[]; back: string; sample?: boolean }) {
  if (!rows.length) return <p className="rounded-2xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">Nothing waiting for review. ✅</p>;
  return (
    <form action={reviewAction} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <input type="hidden" name="back" value={back} />
      <div className="mb-3 flex flex-wrap gap-2">
        <button name="decision" value="APPROVE" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">✓ Approve ticked{sample ? " (all)" : ""}</button>
        <button name="decision" value="REJECT" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300">✗ Reject ticked</button>
        <span className="self-center text-xs text-slate-500">Approve applies the suggestion where it can (tags, a single corrected key, reading level, archiving a duplicate); for other problems fix the question with ✏️ Edit, then approve to close it.</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start gap-3 py-3">
            <input type="checkbox" name="ids" value={r.id} defaultChecked={sample || r.kind === "TAG" || r.kind === "READING_LEVEL"} aria-label="Select" className="mt-1 h-4 w-4" />
            <div className="min-w-0 flex-1">
              <span className={`me-2 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${KIND[r.kind]?.[1] ?? "bg-slate-100"}`}>{KIND[r.kind]?.[0] ?? r.kind}</span>
              {r.stem && <span className="font-medium text-slate-900">{r.stem}</span>}
              <p className="mt-1 text-sm text-slate-700">{r.detail}</p>
              {r.kind === "DUPLICATE" && <p className="mt-1 text-xs text-slate-500">Kept: “{String(r.data.keepStem ?? "")}”</p>}
              {typeof r.data.suggestion === "string" && r.data.suggestion && <p className="mt-1 text-xs text-slate-500">💡 {r.data.suggestion}</p>}
            </div>
            <div className="flex shrink-0 gap-1 text-sm">
              {r.questionId && <Link href={`/admin/questions/${r.questionId}`} className="rounded-lg px-2 py-1 font-semibold text-brand-navy ring-1 ring-slate-300">✏️ Edit</Link>}
              <button name="one" value={`${r.id}|APPROVE`} className="rounded-lg bg-emerald-50 px-2 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-300" title="Approve this one">✓</button>
              <button name="one" value={`${r.id}|REJECT`} className="rounded-lg bg-white px-2 py-1 font-semibold text-slate-600 ring-1 ring-slate-300" title="Reject this one">✗</button>
            </div>
          </li>
        ))}
      </ul>
    </form>
  );
}

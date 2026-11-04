"use client";
import Link from "next/link";
import type { GrammarLesson2 } from "@/server/grammar/grammar";

/** the grammar item types named in the list (besides multiple choice) */
export const TYPE_LABELS: Record<string, string> = { ERROR_CORRECTION: "error correction", SENTENCE_ORDER: "sentence order", SENTENCE_COMBINE: "sentence combining" };

/** One grammar lesson row (name, standards, question count, rule, Preview/Assign) — shared by the flat list and the Curriculum tab. */
export function GrammarRow({ k, isTeacher }: { k: GrammarLesson2; isTeacher: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900"><span aria-hidden="true">{k.icon}</span> {k.name} <span className="ms-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{k.kind}</span></p>
        <p className="mt-0.5 text-xs text-slate-500">{k.lesson} · {k.standards.join(", ") || "No standard"} · {k.counts.total} questions{Object.entries(k.types ?? {}).filter(([t]) => TYPE_LABELS[t]).map(([t, n]) => ` · ${n} ${TYPE_LABELS[t]}`).join("")}</p>
        {k.rule && <details className="mt-1 text-xs text-slate-600"><summary className="cursor-pointer font-semibold text-brand-teal">The rule</summary><p className="mt-1 max-w-3xl leading-relaxed">{k.rule}</p></details>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {k.counts.total > 0 && <Link href={`/teacher/preview?skillId=${k.id}`} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">👀 Preview</Link>}
        {!isTeacher && <Link href={`/admin/questions?status=PUBLISHED&grade=${k.grade}&skill=${k.id}`} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Questions ({k.counts.total})</Link>}
        {isTeacher && (k.counts.total > 0 ? <Link href={`/teacher/skill-assign?skillId=${k.id}`} className="rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-purple">⭐ Assign</Link> : <span className="text-xs text-slate-500">Questions coming soon</span>)}
      </div>
    </li>
  );
}

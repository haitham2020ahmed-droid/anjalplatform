"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { GrammarLesson2 } from "@/server/grammar/grammar";

/** the grammar item types named in the list (besides multiple choice) */
const TYPE_LABELS: Record<string, string> = { ERROR_CORRECTION: "error correction", SENTENCE_ORDER: "sentence order", SENTENCE_COMBINE: "sentence combining" };

/** 🔤 Every grammar lesson in one list, with a search by skill name (or lesson, standard, kind). */
export function GrammarList({ lessons, isTeacher }: { lessons: GrammarLesson2[]; isTeacher: boolean }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return lessons;
    return lessons.filter((k) => { const hay = `${k.name} ${k.lesson} ${k.kind} ${k.standards.join(" ")}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
  }, [q, lessons]);
  return (
    <div>
      <label className="sticky top-2 z-10 mb-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-2 ring-brand-teal/40 focus-within:ring-brand-teal">
        <span aria-hidden="true" className="text-xl">🔎</span>
        <span className="sr-only">Search grammar lessons</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a skill — e.g. nouns, past tense, commas, L.4.1" className="w-full bg-transparent text-lg outline-none placeholder:text-slate-400" autoFocus />
        <span className="whitespace-nowrap text-sm text-slate-500">{shown.length} of {lessons.length}</span>
      </label>
      {!shown.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No lesson matches “{q}”. Try another word.</p> : (
        <ul className="divide-y divide-slate-100 rounded-3xl bg-white px-5 shadow-sm ring-1 ring-slate-200">
          {shown.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
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
          ))}
        </ul>
      )}
    </div>
  );
}

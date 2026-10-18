"use client";
import { useMemo, useState } from "react";
import type { GrammarLesson2 } from "@/server/grammar/grammar";
import { GrammarRow } from "./grammar-row";

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
          {shown.map((k) => <GrammarRow key={k.id} k={k} isTeacher={isTeacher} />)}
        </ul>
      )}
    </div>
  );
}

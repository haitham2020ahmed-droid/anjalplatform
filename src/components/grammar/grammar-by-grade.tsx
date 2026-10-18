"use client";
import { useMemo, useState } from "react";
import type { GrammarLesson2 } from "@/server/grammar/grammar";
import { GrammarRow } from "./grammar-row";

/** 🔤 Every grammar lesson grouped by grade (4 / 5 / 6) — the same lessons as the flat list, organized by the grade
 *  whose Grammar bank file they came from, so loading a grade's file fills its own section automatically. */
export function GrammarByGrade({ lessons, isTeacher, grades }: { lessons: GrammarLesson2[]; isTeacher: boolean; grades: number[] }) {
  const [open, setOpen] = useState<number | null>(grades[0] ?? null);
  const byGrade = useMemo(() => {
    const m = new Map<number, GrammarLesson2[]>();
    for (const g of grades) m.set(g, lessons.filter((k) => k.grade === g));
    return m;
  }, [lessons, grades]);
  return (
    <div className="space-y-4">
      {grades.map((g) => {
        const rows = byGrade.get(g) ?? [];
        const isOpen = open === g;
        return (
          <section key={g} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            <button type="button" onClick={() => setOpen(isOpen ? null : g)} aria-expanded={isOpen} className="flex w-full min-h-14 items-center justify-between gap-3 px-5 py-3 text-start">
              <span className="font-semibold text-slate-900">Grade {g}</span>
              <span className="flex items-center gap-2 text-sm text-slate-500">
                {rows.length} {rows.length === 1 ? "lesson" : "lessons"}
                <span aria-hidden="true" className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
              </span>
            </button>
            {isOpen && (rows.length
              ? <ul className="divide-y divide-slate-100 border-t border-slate-100 px-5">{rows.map((k) => <GrammarRow key={k.id} k={k} isTeacher={isTeacher} />)}</ul>
              : <p className="border-t border-slate-100 px-5 py-4 text-sm text-slate-500">No Grade {g} lessons loaded yet.</p>)}
          </section>
        );
      })}
    </div>
  );
}

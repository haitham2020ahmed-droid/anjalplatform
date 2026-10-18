"use client";
import { useState } from "react";
import type { GrammarLesson2 } from "@/server/grammar/grammar";
import { GrammarList } from "./grammar-list";
import { GrammarByGrade } from "./grammar-by-grade";

/** 🔤 All lessons (search, unchanged) / Curriculum (the same lessons split by Grade 4/5/6). */
export function GrammarTabs({ lessons, isTeacher, grades }: { lessons: GrammarLesson2[]; isTeacher: boolean; grades: number[] }) {
  const [tab, setTab] = useState<"all" | "curriculum">("all");
  const chip = (on: boolean) => `inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-brand-teal/60"}`;
  return (
    <div>
      <div role="tablist" aria-label="Grammar view" className="mb-4 flex flex-wrap gap-2">
        <button type="button" role="tab" aria-selected={tab === "all"} className={chip(tab === "all")} onClick={() => setTab("all")}>All lessons</button>
        <button type="button" role="tab" aria-selected={tab === "curriculum"} className={chip(tab === "curriculum")} onClick={() => setTab("curriculum")}>Curriculum</button>
      </div>
      {tab === "all" ? <GrammarList lessons={lessons} isTeacher={isTeacher} /> : <GrammarByGrade lessons={lessons} isTeacher={isTeacher} grades={grades} />}
    </div>
  );
}

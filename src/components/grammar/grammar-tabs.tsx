"use client";
import type { GrammarLesson2 } from "@/server/grammar/grammar";
import { GrammarList } from "./grammar-list";

// 🐛 fix (audit finding, Oct 2026): this used to be two tabs — "All lessons" (a flat searchable list) and
// "Curriculum" (the same lessons split into Grade 4/5/6 cards, each needing its own click to open). Since the two
// showed the exact same lessons, the split tab was pure extra navigation for no extra information — the teacher
// asked for one single "Curriculum" list with the search already at the top, same as "All lessons" always had.
// `grammar-by-grade.tsx` (the old per-grade grouping) is no longer used here; left in place, not deleted.
export function GrammarTabs({ lessons, isTeacher }: { lessons: GrammarLesson2[]; isTeacher: boolean }) {
  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-brand-navy">Curriculum</h2>
      <GrammarList lessons={lessons} isTeacher={isTeacher} />
    </div>
  );
}

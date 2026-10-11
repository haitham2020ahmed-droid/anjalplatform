"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { LessonCard, type LessonCardData } from "./lesson-card";

export interface StudentCurriculumUnit { code: string; title: string; lessons: LessonCardData[] }
export interface StudentCurriculumPlan { id: string; title: string; done: number; parts: number }

/**
 * The student's Curriculum Map: the Curriculum plans their teacher sent (top), then the lessons of each unit
 * (name, Text Idea, words, sections). No levels are shown. Accepts plain props so any page can reuse it.
 */
export function StudentCurriculum({ units, plans }: { units: StudentCurriculumUnit[]; plans: StudentCurriculumPlan[] }) {
  const t = useT();
  return (
    <div className="space-y-8">
      {plans.length > 0 && (
        <section aria-labelledby="sent-plans">
          <h2 id="sent-plans" className="text-xl font-semibold text-brand-navy">{t("Sent to you")}</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {plans.map((p) => (
              <li key={p.id}>
                <Link href={`/student/plans/${p.id}`} prefetch={false} className="flex min-h-11 items-center justify-between gap-3 rounded-3xl bg-white p-5 ring-1 ring-blue-200 hover:ring-blue-400">
                  <span className="font-semibold text-blue-900">{p.title}</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-600">{p.done}/{p.parts}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {units.map((u, i) => (
        <section key={u.code} aria-labelledby={`unit-${i}`}>
          <h2 id={`unit-${i}`} className="text-xl font-semibold text-brand-navy">{t("Unit {n}", { n: i + 1 })}</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {u.lessons.map((l) => <LessonCard key={l.code} lesson={l} showStatus={false} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

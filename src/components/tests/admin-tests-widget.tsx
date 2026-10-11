"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";
import type { TeacherTestCount } from "@/server/tests/assessments";

/** Admin dashboard card: tests created per teacher and students who completed them. */
export function AdminTestsWidget({ teachers, totals, limit = 5 }: { teachers: TeacherTestCount[]; totals: { tests: number; assigned: number; completed: number }; limit?: number }) {
  const t = useT();
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="flex items-center justify-between text-lg font-semibold text-brand-navy">📝 {t("Tests")} <Link href="/admin/tests" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-teal">{t("See all")} <span aria-hidden="true" className="ms-1 inline-block rtl:rotate-180">›</span></Link></h2>
      <p className="mt-1 text-slate-600">{t("{n} test(s)", { n: totals.tests })} · {t("{done} of {total} completed", { done: totals.completed, total: totals.assigned })}</p>
      {!teachers.some((t) => t.tests) ? <p className="mt-3 text-slate-600">{t("No tests yet")}</p> : (
        <ul className="mt-3 grid gap-1">
          {teachers.filter((x) => x.tests).slice(0, limit).map((x) => <li key={x.teacherId} className="flex justify-between gap-3"><span>{x.name}</span><span className="text-slate-600">{t("{n} test(s)", { n: x.tests })} · {t("{n} completed", { n: x.completed })}</span></li>)}
        </ul>
      )}
    </section>
  );
}

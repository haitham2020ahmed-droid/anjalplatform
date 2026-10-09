import Link from "next/link";
import type { CheckStep } from "@/server/teacher/week-plan";
import { hideChecklistAction } from "@/app/teacher/week/actions";

/** ✅ The first-week checklist for a teacher (hidden when done or dismissed). */
export function FirstWeekChecklist({ steps, back }: { steps: CheckStep[]; back: string }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="mb-6 rounded-3xl bg-gradient-to-br bg-linear-to-br from-sky-50 to-white p-5 ring-1 ring-sky-200 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-brand-navy">✅ Your first week on the platform · {done}/{steps.length}</h2>
        <form action={hideChecklistAction}><input type="hidden" name="hidden" value="1" /><input type="hidden" name="back" value={back} /><button className="text-sm font-semibold text-slate-500 underline">Hide</button></form>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-sky-200"><div className="h-full bg-sky-500" style={{ width: `${Math.round((100 * done) / steps.length)}%` }} /></div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {steps.map((s, i) => <li key={s.key}><Link href={s.href} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 ${s.done ? "bg-emerald-50 text-emerald-900 ring-emerald-200 line-through decoration-emerald-400" : "bg-white text-brand-navy ring-slate-200 hover:ring-brand-teal"}`}><span aria-hidden="true">{s.done ? "✅" : `${i + 1}.`}</span>{s.title}</Link></li>)}
      </ol>
    </section>
  );
}

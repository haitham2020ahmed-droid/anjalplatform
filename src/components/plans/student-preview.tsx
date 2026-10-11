"use client";
import { useT } from "@/i18n/client";
import { hideLevels } from "@/lib/hide-levels";
import type { Program } from "@/server/plans/program";
import { ProgramChip } from "./program-chip";

/**
 * The plan exactly as one student will see it: the My Plans sheet (title, progress, numbered parts) and the same
 * skills in My Work with the program tag. Nothing here is a working link. Level words are never shown.
 */
export function StudentPlanPreview({ title, studentName, className, program, skills, note, dueAt }: {
  title: string; studentName: string; className: string; program: Program | null; skills: string[]; note?: string | null; dueAt?: string | null;
}) {
  const t = useT();
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-label={t("Preview")}>
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("My Plans")}</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3 border-b-4 border-brand-teal pb-3">
          <div className="min-w-0">
            <h3 className="break-words text-xl font-bold text-brand-navy">{hideLevels(title)}</h3>
            <p className="text-sm text-slate-600"><bdi>{studentName}</bdi> · {className}</p>
          </div>
          <div className="min-w-[150px]">
            <div className="flex justify-between text-sm font-semibold text-slate-700"><span>{t("Progress")}</span><span className="tabular-nums">0/{skills.length} · 0%</span></div>
            <div className="mt-1 h-2.5 rounded-full bg-slate-100" />
          </div>
        </div>
        {note && <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">💬 {note}</p>}
        <ol className="mt-3 space-y-1">
          {skills.map((k, i) => <li key={`${k}|${i}`} className="flex min-h-11 items-center gap-2 rounded-xl px-2"><span aria-hidden="true">⚪</span><span className="tabular-nums text-slate-500">{i + 1}.</span><span className="font-medium text-slate-900">{hideLevels(k)}</span></li>)}
        </ol>
      </div>
      <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("My Work")}</p>
        <ul className="mt-2 divide-y divide-slate-100">
          {skills.map((k, i) => (
            <li key={`${k}|${i}`} className="flex min-h-11 flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1 font-medium text-slate-900">{hideLevels(k)}</span>
              <ProgramChip program={program} />
              {dueAt && <span className="text-xs text-slate-500">{t("Due {date}", { date: dueAt })}</span>}
              <span className="inline-flex min-h-11 items-center rounded-xl bg-brand-teal px-4 text-sm font-semibold text-white opacity-80" aria-disabled="true">{t("Start")}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

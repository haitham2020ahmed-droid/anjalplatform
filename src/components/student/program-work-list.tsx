import Link from "next/link";
import type { MyWorkItem } from "@/server/plans/wizard";
import { workProgress } from "@/server/student/program-work";
import { BTN_PRIMARY, BTN_SECONDARY, EmptyState, SourceTag, StatusPill } from "@/components/ui-kit";
import { getT } from "@/i18n/server";

const STATUS = { "Not started": "NOT_STARTED", "In progress": "IN_PROGRESS", Done: "DONE" } as const;
/** soft card colour per program (Curriculum blue, MAP green, RTI orange, Grammar purple, NAFS teal) */
export const PROGRAM_SOFT: Record<string, string> = {
  CURRICULUM: "bg-blue-50/70 ring-blue-100", MAP: "bg-green-50/70 ring-green-100", RTI: "bg-orange-50/70 ring-orange-100",
  GRAMMAR: "bg-purple-50/70 ring-purple-100", NAFS: "bg-teal-50/70 ring-teal-100", CUSTOM: "bg-slate-50 ring-slate-100",
};

/**
 * "Your MAP practice" / "Your RTI work" / "Your NAFS work": the program's rows of My Work (programWork), with a
 * progress line ("2 of 4 done"), a colored program chip and one button per row. Finished rows fold away.
 */
export async function ProgramWorkList({ items, title, program, id }: { items: MyWorkItem[]; title: string; program: string; id?: string }) {
  const { t } = await getT();
  const open = items.filter((r) => r.status !== "Done"), done = items.filter((r) => r.status === "Done");
  const p = workProgress(items);
  const row = (r: MyWorkItem) => (
    <li key={r.assignmentId} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
      <div className="min-w-0">
        <p className="font-semibold text-brand-navy"><bdi>{r.skill}</bdi></p>
        <div className="mt-1 flex flex-wrap items-center gap-2"><SourceTag source={r.sourceKey} /><StatusPill status={STATUS[r.status]} />{r.overdue && r.status !== "Done" && <span className="text-xs font-semibold text-red-700">{t("Late")}</span>}</div>
      </div>
      <Link prefetch={false} href={r.href} className={`${r.status === "Done" ? BTN_SECONDARY : BTN_PRIMARY} rounded-2xl`}>{t(r.action)}</Link>
    </li>
  );
  return (
    <section id={id} aria-labelledby={`${id ?? "pw"}-h`} className={`mt-6 rounded-3xl p-5 ring-1 sm:p-6 ${PROGRAM_SOFT[program] ?? PROGRAM_SOFT.CUSTOM}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id ?? "pw"}-h`} className="text-xl font-semibold text-brand-navy">{t(title)}</h2>
        {p.total > 0 && <span className="text-sm font-semibold text-slate-600">{t("{done} of {total} done", { done: p.done, total: p.total })}</span>}
      </div>
      {p.total > 0 && <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done} aria-label={t("{done} of {total} done", { done: p.done, total: p.total })}><div className="h-full rounded-full bg-emerald-500" style={{ width: `${p.pct}%` }} /></div>}
      {open.length ? <ul className="mt-4 grid gap-3 md:grid-cols-2">{open.map(row)}</ul> : (
        <div className="mt-4"><EmptyState compact icon={done.length ? "🎉" : "🌱"} title={done.length ? "No work right now — great job!" : "Nothing here yet"} text="Your teacher will add work here soon." /></div>
      )}
      {done.length > 0 && (
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-brand-navy">{t("Done ({n})", { n: done.length })}</summary>
          <ul className="mt-2 grid gap-3 md:grid-cols-2">{done.map(row)}</ul>
        </details>
      )}
    </section>
  );
}

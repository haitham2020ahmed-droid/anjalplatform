import Link from "next/link";
import type { StudentHome } from "@/server/student/student-home";
import { EmptyState, SourceTag, StatusPill, BTN_SECONDARY } from "@/components/ui-kit";
import type { TFn } from "@/i18n";
import { WORK_KIND_LABEL } from "@/lib/work-kinds";

type Row = StudentHome["work"][number];
const STATUS: Record<Row["status"], "NOT_STARTED" | "IN_PROGRESS" | "DONE"> = { "Not started": "NOT_STARTED", "In progress": "IN_PROGRESS", Done: "DONE" };
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
/** soft row colour per program (Curriculum blue, MAP green, Grammar purple, NAFS teal); support work looks like any work */
const SOFT: Record<string, string> = { CURRICULUM: "bg-blue-50/70 ring-blue-100 border-blue-300", MAP: "bg-green-50/70 ring-green-100 border-green-300", RTI: "bg-slate-50 ring-slate-100 border-slate-300", GRAMMAR: "bg-purple-50/70 ring-purple-100 border-purple-300", NAFS: "bg-teal-50/70 ring-teal-100 border-teal-300", CUSTOM: "bg-slate-50 ring-slate-100 border-slate-300" };

/**
 * One My Work row: 📌 (assigned by the teacher), the skill, its program chip, status, due date, one button.
 * Support (RTI) work is shown as ordinary practice: students never see RTI or support-level wording.
 */
export function WorkCard({ r, t }: { r: Row; t: TFn }) {
  return (
    <li data-testid="my-work-row" data-source={r.reteach ? "RETEACH" : r.sourceKey} data-kind={r.kind ?? "SKILL"} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border-s-4 px-3 py-2 ring-1 transition hover:shadow-card ${SOFT[r.sourceKey] ?? SOFT.CUSTOM}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[0.95rem] font-semibold leading-snug text-brand-navy"><span aria-label={t("Assigned by your teacher")} title={t("Assigned by your teacher")}>📌</span> <bdi>{r.skill}</bdi></p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {r.kind ? <SourceTag source={r.sourceKey} label={t(WORK_KIND_LABEL[r.kind])} /> : r.reteach ? <SourceTag source="CUSTOM" label={t("Reteach")} /> : r.sourceKey === "RTI" ? <SourceTag source="CUSTOM" label={t("Practice")} /> : <SourceTag source={r.sourceKey} icon />}
          <StatusPill status={STATUS[r.status]} />
          {r.overdue && r.status !== "Done" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">{t("Late")}</span>}
          {r.dueAt && r.status !== "Done" && !r.overdue && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">📅 {t("Due {date}", { date: day(r.dueAt) })}</span>}
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-2">
        <Link prefetch={false} href={r.href} className={`${BTN_SECONDARY} rounded-xl px-3 py-1.5 text-sm`}>{t(r.action)}</Link>
      </span>
    </li>
  );
}

/** The open rows (first `first`, the rest under "Show all") and the finished ones folded under "Done (n)". */
export function MyWorkList({ open, done, t, first = 10 }: { open: Row[]; done: Row[]; t: TFn; first?: number }) {
  return (
    <>
      {open.length ? (
        <>
          <ul className="grid gap-2">{open.slice(0, first).map((r) => <WorkCard key={r.assignmentId} r={r} t={t} />)}</ul>
          {open.length > first && (
            <details className="mt-3">
              <summary className="flex min-h-10 cursor-pointer items-center font-semibold text-brand-navy">{t("Show all ({n})", { n: open.length })}</summary>
              <ul className="mt-2 grid gap-2">{open.slice(first).map((r) => <WorkCard key={r.assignmentId} r={r} t={t} />)}</ul>
            </details>
          )}
        </>
      ) : (
        <EmptyState compact icon={done.length ? "🎉" : "🌈"} title={done.length ? "No work right now — great job!" : "Nothing here yet"} text="Your teacher will add work here soon. Pick something to read!" />
      )}
      {done.length > 0 && (
        <details id="my-work-done" className="mt-4 rounded-2xl bg-emerald-50/60 p-3 ring-1 ring-emerald-100">
          <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-semibold text-emerald-900"><span aria-hidden="true">✅</span>{t("Done ({n})", { n: done.length })}</summary>
          <ul className="mt-2 grid gap-2">{done.map((r) => <WorkCard key={r.assignmentId} r={r} t={t} />)}</ul>
        </details>
      )}
    </>
  );
}

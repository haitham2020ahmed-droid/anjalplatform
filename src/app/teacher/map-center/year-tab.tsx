import Link from "next/link";
import type { TFn } from "@/i18n";
import { EmptyState } from "@/components/ui-kit";
import { repo } from "@/server/auth/next";
import { ForbiddenError, type Actor } from "@/server/auth/rbac";
import { yearPlanView, type YearPlanView } from "@/server/map/year-plan";
import { studentYearPlan, yearPlanSentAt } from "@/server/map/year-plan-share";
import { classMembers, studentNames } from "@/server/insights/student-data";
import { YearPlanBoard } from "@/components/map/year-plan-board";
import { StudentYearPlanView } from "@/components/map/student-year-plan";
import { yearSendAction } from "./year-actions";

const chip = "inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-sm font-semibold ring-1";

/**
 * 🗓️ Year plan (owner r67): the class's 40 school weeks of 2–3 shared skills (src/server/map/year-plan.ts). The class
 * teacher edits and assigns (☆); the admin sees each class's plan read-only (the class pills above).
 * r68: ⬇ Download PDF (for the administration) · 📤 Send to students (their MAP page gets a "Year plan" tab) · 👁 Preview as
 * students (exactly their page, as one student of the class) · the questions behind each skill (on the board).
 */
export async function YearTab({ actor, t, classId, preview, student }: { actor: Actor; t: TFn; classId: string; preview?: boolean; student?: string }) {
  let v: YearPlanView | null = null;
  try { v = await yearPlanView(repo, actor, classId); } catch (e) { if (!(e instanceof ForbiddenError)) throw e; }
  if (!v) return <EmptyState icon="🗓️" title="Year plan" text="Choose one of your classes." />;
  const sentAt = await yearPlanSentAt(repo, classId);
  const base = `/teacher/map-center?${new URLSearchParams({ tab: "year", classId })}`;
  const hasSkills = v.weeks.some((w) => w.skills.length);
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2" data-testid="year-toolbar">
      {hasSkills && <a href={`/api/year-plan-pdf?${new URLSearchParams({ classId })}`} className={`${chip} bg-white text-brand-navy ring-slate-300 hover:ring-brand-teal`} data-testid="year-pdf">⬇ {t("Download PDF")}</a>}
      {hasSkills && (preview
        ? <Link prefetch={false} href={base} className={`${chip} bg-white text-brand-navy ring-slate-300 hover:ring-brand-teal`}>← {t("Back to the plan")}</Link>
        : <Link prefetch={false} href={`${base}&preview=1`} className={`${chip} bg-white text-brand-navy ring-slate-300 hover:ring-brand-teal`} data-testid="year-preview">👁 {t("Preview as students")}</Link>)}
      {v.canEdit && hasSkills && (
        <form action={yearSendAction} className="inline-flex">
          <input type="hidden" name="classId" value={classId} />
          <input type="hidden" name="on" value={sentAt ? "0" : "1"} />
          <button className={`${chip} ${sentAt ? "bg-white text-slate-700 ring-slate-300 hover:ring-rose-300" : "bg-brand-navy text-white ring-brand-navy hover:bg-brand-purple"}`} data-testid="year-send">
            {sentAt ? `🙈 ${t("Stop showing to students")}` : `📤 ${t("Send to students")}`}
          </button>
        </form>
      )}
      {sentAt && <span role="status" className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-900 ring-1 ring-teal-200">{t("Students see it since {date}", { date: sentAt.slice(0, 10) })}</span>}
    </div>
  );
  if (preview) {
    const ids = await classMembers(repo, classId);
    const names = await studentNames(repo, ids);
    const p = await studentYearPlan(repo, actor, { classId, asStudent: student ?? null });
    return (
      <section aria-label={t("Preview as students")} className="space-y-3">
        {toolbar}
        <p role="status" className="rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-900">{t("Preview: exactly what students see on their MAP page (Year plan tab). The stars are the chosen student's.")}</p>
        {ids.length > 1 && (
          <form method="get" action="/teacher/map-center" className="flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="tab" value="year" /><input type="hidden" name="classId" value={classId} /><input type="hidden" name="preview" value="1" />
            <label className="flex flex-col font-semibold text-slate-700">{t("Student")}
              <select name="student" defaultValue={student ?? ids[0]} className="h-10 rounded-lg border border-slate-300 px-2 font-normal">{ids.map((id) => <option key={id} value={id}>{names.get(id)?.name ?? "Student"}</option>)}</select></label>
            <button className="h-10 rounded-lg bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button>
          </form>
        )}
        {p ? <div className="rounded-3xl bg-slate-100 p-3 ring-1 ring-slate-200"><StudentYearPlanView p={p} t={t} preview /></div> : <EmptyState icon="🗓️" title="Year plan" text="Make the Year plan first (it needs MAP scores)." />}
      </section>
    );
  }
  return (
    <section aria-label={t("Year plan")} className="space-y-3">
      <p className="text-sm text-slate-600">{t("The skills most of {name} share as needs (MAP scores and the Learning Continuum), easiest first, 2–3 a week over 40 weeks. Press ☆ to assign a skill to the class.", { name: v.className })}</p>
      {toolbar}
      {!v.canEdit && <p role="status" className="rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-900">{t("Read only: the class teacher changes and assigns the plan.")}</p>}
      <YearPlanBoard initial={v} />
    </section>
  );
}

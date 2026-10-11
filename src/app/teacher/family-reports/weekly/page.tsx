import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { EmptyState } from "@/components/ui-kit";
import { PrintStyles } from "@/components/print/print-kit";
import { WEEKLY_CSS, WeeklySummarySheets } from "@/components/print/weekly-summary-sheet";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { accessibleClasses } from "@/server/teacher/assign";
import { classMembers, studentNames } from "@/server/insights/student-data";
import { weeklySummaries, type WeeklyBatch } from "@/reports/weekly-summary";
import { getT } from "@/i18n/server";

export const metadata = { title: "Weekly family summary" };

/**
 * 👪 The weekly family summary: one printable page per student (this week's practice, minutes, skills, a reading
 * snapshot, badges and one tip for home), for one student (?studentId=) or the whole class (?classId=, one page
 * each). The class's own teacher and the school admin only (checked on the server in weeklySummaries).
 */
export default async function WeeklySummaryPage({ searchParams }: { searchParams: Promise<{ classId?: string; studentId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = classes.some((c) => c.id === sp.classId) ? String(sp.classId) : classes[0] ? String(classes[0].id) : "";
  const studentId = sp.studentId ? String(sp.studentId) : "";
  let batch: WeeklyBatch | null = null;
  let denied = false;
  try { batch = studentId || classId ? await weeklySummaries(repo, actor, studentId ? { studentId } : { classId }) : null; }
  catch (e) { if (!(e instanceof ForbiddenError)) throw e; denied = true; }
  const pickClass = batch?.classId ?? classId;
  const names = pickClass ? [...(await studentNames(repo, await classMembers(repo, pickClass)))].map(([id, x]) => ({ id, name: x.name })).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <div className="print:hidden">
        <PageHeader back={{ href: "/teacher/family-reports", label: "Family Reports" }} icon="👪" title="Weekly family summary"
          subtitle={t("One page per student: this week's practice, reading and badges, with one tip for home. Check the preview, then print or save as PDF.")} />
        {classes.length > 1 && <nav aria-label={t("Class")} className="mb-4 flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} prefetch={false} href={`/teacher/family-reports/weekly?classId=${c.id}`} aria-current={!studentId && c.id === pickClass ? "page" : undefined} className={chip(!studentId && c.id === pickClass)}>{String(c.name)}</Link>)}</nav>}
        {pickClass && !denied && (
          <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <input type="hidden" name="classId" value={pickClass} />
            <label className="text-sm font-semibold text-slate-700">{t("Student")}
              <select name="studentId" defaultValue={studentId} className="mt-1 block min-h-11 min-w-60 rounded-xl border border-slate-300 bg-white px-3 py-2">
                <option value="">{t("The whole class (one page each)")}</option>
                {names.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </label>
            <button className="min-h-11 rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{t("Show")}</button>
            <span className="flex-1" />
            {batch && batch.items.length > 0 && <PrintButton label={batch.items.length > 1 ? t("Print {n} pages", { n: batch.items.length }) : t("Print")} />}
          </form>
        )}
        {batch && batch.items.length > 0 && <p className="mb-2 text-sm text-slate-500">{t("Preview: this is what prints.")}</p>}
      </div>
      {denied && <EmptyState icon="🔒" title="You cannot open this summary." text="Only the class teacher and the school admin can print it." />}
      {!denied && (!batch || batch.items.length === 0) && <EmptyState icon="👥" title="No students in this class yet" />}
      {batch && batch.items.length > 0 && (
        <>
          <PrintStyles extra={WEEKLY_CSS} />
          <WeeklySummarySheets batch={batch} t={t} />
        </>
      )}
    </AppShell>
  );
}

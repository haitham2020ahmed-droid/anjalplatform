import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { familyReport } from "@/server/reports/family-reports";
import { FamilyReportFields, FamilyReportView, StatusChip } from "@/components/reports/family-report-view";
import { saveFamilyReportAction, withdrawFamilyReportAction } from "../actions";
import { getT } from "@/i18n/server";
import { LANG_NAMES, makeT } from "@/i18n";

export const metadata = { title: "Family Report" };

/**
 * One family report: edit (draft / returned), send for approval, take back, or read the approved one. The monthly
 * report (written by the platform at month end, in English and Arabic) is read here, gets the teacher's note in
 * "Message to the family", then goes to the admin like every family report.
 */
export default async function FamilyReportEdit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; lang?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { id } = await params;
  const sp = await searchParams;
  const r = await familyReport(repo, actor, id);
  const { t } = await getT();
  const mine = r.createdById === actor.userId || actor.role !== "TEACHER";
  const editable = mine && (r.status === "DRAFT" || r.status === "RETURNED");
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/family-reports", label: "Family Reports" }} icon="👪" title={`Family Report · ${r.studentName}`}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><StatusChip status={r.status} /> {r.status === "PENDING" ? "A school admin will check it. You will be notified." : r.status === "APPROVED" ? `Approved ${r.reviewedAt}${r.reviewer ? ` by ${r.reviewer}` : ""}. The student and the parents can see it.` : "Read it, edit anything, then send it for approval."}</span>} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {r.kind === "MONTHLY" && editable && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-amber-950 ring-1 ring-amber-200">📅 {t("The platform wrote this month's report. Read it, add your note in “Message to the family”, then send it: the school admin approves it before the family sees it.")}</p>}
      {r.status === "RETURNED" && r.reviewNote && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-red-900 ring-1 ring-red-200">↩️ Returned by {r.reviewer ?? "the admin"}: <b>{r.reviewNote}</b></p>}
      <div className={editable ? "grid gap-6 xl:grid-cols-2" : ""}>
        {editable && (
          <form action={saveFamilyReportAction} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:hidden">
            <input type="hidden" name="id" value={r.id} />
            <h2 className="mb-3 text-lg font-bold text-brand-navy">✏️ Edit</h2>
            <FamilyReportFields title={r.title} c={r.content} />
            <div className="mt-4 flex flex-wrap gap-2">
              <button name="op" value="save" className="rounded-xl bg-white px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">💾 Save</button>
              <button name="op" value="send" className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">📨 Save & send for approval</button>
            </div>
          </form>
        )}
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
            <h2 className="text-lg font-bold text-brand-navy">👀 What the family will see</h2>
            <span className="flex gap-2">
              {r.status === "PENDING" && mine && <form action={withdrawFamilyReportAction}><input type="hidden" name="id" value={r.id} /><button className="rounded-xl bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-300">↩️ Take back to edit</button></form>}
              <PrintButton />
            </span>
          </div>
          {r.content.ar && (
            <nav aria-label={t("Language")} className="mb-2 flex gap-2 print:hidden">
              {(["en", "ar"] as const).map((l) => <Link key={l} prefetch={false} href={`/teacher/family-reports/${r.id}${l === "ar" ? "?lang=ar" : ""}`} className={`rounded-full px-3 py-1 text-sm font-semibold ${(sp.lang === "ar") === (l === "ar") ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{LANG_NAMES[l]}</Link>)}
            </nav>
          )}
          <FamilyReportView r={r} t={makeT(sp.lang === "ar" ? "ar" : "en")} lang={sp.lang === "ar" ? "ar" : "en"} />
          <p className="mt-3 text-sm print:hidden"><Link href={`/teacher/students/${r.studentId}`} className="font-semibold text-brand-teal underline">Open {r.studentName.split(" ")[0]}’s page</Link>
            {r.status === "APPROVED" && <> · <Link href={`/student/reports?view=family&preview=${encodeURIComponent(r.studentId)}`} className="font-semibold text-brand-teal underline">👀 {t("Preview as student")}</Link></>}</p>
        </div>
      </div>
    </AppShell>
  );
}

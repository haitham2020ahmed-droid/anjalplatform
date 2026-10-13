import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { familyReport } from "@/server/reports/family-reports";
import { FamilyReportView } from "@/components/reports/family-report-view";
import { ForbiddenError } from "@/server/auth/rbac";
import { getT } from "@/i18n/server";

export const metadata = { title: "Family Report" };

/** 👪 An approved report, for the student and the parents (staff can open it too). Printable. */
export default async function FamilyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT", "PARENT", "TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { id } = await params;
  const { t } = await getT();
  const r = await familyReport(repo, actor, id).catch((e) => { if (e instanceof ForbiddenError) return null; throw e; });
  const back = actor.role === "STUDENT" ? "/student/family" : actor.role === "PARENT" ? (r ? `/parent/family/${r.studentId}` : "/parent") : r ? `/teacher/family-reports/${r.id}` : "/teacher";
  return (
    <AppShell name={String(me.displayName)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden"><Link href={back} className="font-semibold text-brand-teal">← Back</Link>{r && <PrintButton />}</div>
      {r ? <FamilyReportView r={r} t={t} /> : <p className="rounded-2xl bg-white p-6 text-lg text-slate-700 ring-1 ring-slate-200">This report is not available.</p>}
    </AppShell>
  );
}

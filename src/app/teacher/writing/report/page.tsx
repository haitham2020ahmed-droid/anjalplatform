import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { readableClasses } from "@/server/teacher/coordinators";
import { writingResults } from "@/server/writing/locked";
import { InfoTip, ReportIntro, ReportSummary } from "@/components/report-kit";
import { writingSummary } from "@/lib/report-summaries";

export const metadata = { title: "Writing results" };

/** 📊 Writing results: the rubric score (%) of every graded writing task, per student, with the averages. */
export default async function WritingReportPage({ searchParams }: { searchParams: Promise<{ classId?: string; studentId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const res = klass ? await writingResults(repo, actor, String(klass.id), { studentId: sp.studentId || undefined }) : null;
  const tone = (p: number) => (p >= 80 ? "bg-emerald-50 text-emerald-900" : p >= 60 ? "bg-amber-50 text-amber-900" : "bg-red-50 text-red-900");
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="✍️" title="Writing results" subtitle={klass ? <><bdi>{String(klass.name)}</bdi> · {t("Rubric score (%) of graded writing.")}</> : undefined}><PrintButton /></PageHeader>
      <ReportIntro text="The rubric score (%) of each graded writing task, per student." />
      {!res || !res.tasks.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{t("No graded writing yet.")}</p> : (
        <>
          <p className="mb-3 text-sm text-slate-600">{t("Class average")}: <b dir="ltr">{res.average === null ? "—" : `${res.average}%`}</b></p>
          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600"><tr>
                <th className="p-3 text-start">{t("Student")}</th>
                {res.tasks.map((k) => <th key={k.id} className="p-3 text-start">{k.locked ? <Link prefetch={false} href={`/teacher/writing/task/${k.id}`} className="hover:underline">🔒 {k.title}</Link> : k.title}</th>)}
                <th className="p-3 text-start">{t("Average")} <InfoTip text="The average of the student's graded scores." /></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">{res.rows.map((r) => (
                <tr key={r.studentId}>
                  <td className="p-3 font-semibold text-brand-navy"><Link prefetch={false} href={`/teacher/students/${r.studentId}`} className="hover:underline"><bdi>{r.name}</bdi></Link></td>
                  {res.tasks.map((k) => <td key={k.id} className="p-3 tabular-nums">{r.pct[k.id] === undefined ? <span className="text-slate-400">—</span> : <span className={`rounded px-1.5 py-0.5 ${tone(r.pct[k.id])}`}>{r.pct[k.id]}%</span>}</td>)}
                  <td className="p-3 font-semibold tabular-nums">{r.average === null ? "—" : `${r.average}%`}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
      {res && klass && <ReportSummary summary={writingSummary(res, String(klass.id), actor.role !== "TEACHER")} />}
    </AppShell>
  );
}

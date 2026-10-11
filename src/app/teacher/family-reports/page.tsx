import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { classMembers, studentNames } from "@/server/insights/student-data";
import { staffFamilyReports, KIND_LABEL, type ReportStatus } from "@/server/reports/family-reports";
import { StatusChip } from "@/components/reports/family-report-view";
import { newFamilyReportAction } from "./actions";

export const metadata = { title: "Family Reports" };

/** 👪 Family reports: prepare (the platform) or write (the teacher), check, send for the admin's approval; follow their status. */
export default async function FamilyReportsPage({ searchParams }: { searchParams: Promise<{ classId?: string; status?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const ids = klass ? await classMembers(repo, String(klass.id)) : [];
  const names = [...(await studentNames(repo, ids))].map(([id, x]) => ({ id, name: x.name })).sort((a, b) => a.name.localeCompare(b.name));
  const status = (["DRAFT", "PENDING", "RETURNED", "APPROVED"] as const).find((x) => x === sp.status);
  const reports = await staffFamilyReports(repo, actor, status ? { status } : {});
  const count = (st: ReportStatus) => reports.filter((r) => r.status === st).length;
  const all = status ? reports : reports;
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="👪" title="Family Reports"
        subtitle="Prepare a report with one click (the platform writes it from MAP, the Diagnostic, reading fluency and practice) or write your own. Check it, edit it, then send it: a school admin approves it before the family sees it." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {klass && (
        <section className="rounded-3xl bg-gradient-to-br from-teal-50 to-white p-5 ring-1 ring-teal-200">
          <h2 className="text-lg font-bold text-brand-navy">➕ New family report</h2>
          <nav aria-label="Classes" className="mt-3 flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/family-reports?classId=${c.id}`} className={chip(c.id === klass.id)}>{String(c.name)}</Link>)}</nav>
          <form action={newFamilyReportAction} className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="back" value={`/teacher/family-reports?classId=${klass.id}`} />
            <label className="text-sm font-semibold text-slate-700">Student
              <select name="studentId" required className="mt-1 block min-w-60 rounded-xl border border-slate-300 bg-white px-3 py-2">{names.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select>
            </label>
            <button name="kind" value="AUTO" className="rounded-xl bg-brand-navy px-4 py-2.5 font-semibold text-white hover:bg-brand-purple">✨ Prepare it for me</button>
            <button name="kind" value="MANUAL" className="rounded-xl bg-white px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">✍️ I will write it</button>
          </form>
        </section>
      )}
      <nav aria-label="Status" className="mt-6 flex flex-wrap gap-2">
        <Link href="/teacher/family-reports" className={chip(!status)}>All</Link>
        {(["DRAFT", "PENDING", "RETURNED", "APPROVED"] as const).map((x) => <Link key={x} href={`/teacher/family-reports?status=${x}`} className={chip(status === x)}>{x === "DRAFT" ? "Drafts" : x === "PENDING" ? "Waiting" : x === "RETURNED" ? "Returned" : "Approved"}{!status ? ` · ${count(x)}` : ""}</Link>)}
      </nav>
      <ul className="mt-4 space-y-2">
        {all.map((r) => (
          <li key={r.id}><Link href={`/teacher/family-reports/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200 hover:ring-brand-teal">
            <span><span className="block font-semibold text-brand-navy"><bdi>{r.studentName}</bdi> <span className="text-sm font-normal text-slate-500">· {r.className}</span></span><span className="block text-xs text-slate-500">{KIND_LABEL[r.kind]} · {r.author} · {r.submittedAt ?? r.createdAt}{r.reviewNote && r.status === "RETURNED" ? ` · Note: ${r.reviewNote}` : ""}</span></span>
            <span className="flex items-center gap-2"><StatusChip status={r.status} />{r.status === "APPROVED" && <span className="text-xs text-slate-500">{r.seenByParentAt ? "👀 parent read it" : "not read yet"}</span>}</span>
          </Link></li>
        ))}
        {!all.length && <li className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No reports yet.</li>}
      </ul>
    </AppShell>
  );
}

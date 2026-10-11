import Link from "next/link";
import type { FamilyReportRow } from "@/server/reports/family-reports";
import { KIND_LABEL } from "@/server/reports/family-reports";
import { StatusChip } from "./family-report-view";
import { newFamilyReportAction } from "@/app/teacher/family-reports/actions";

/** 👪 On the student's page: prepare or write a family report, and the reports already made. */
export function FamilyReportPanel({ studentId, name, reports }: { studentId: string; name: string; reports: FamilyReportRow[] }) {
  return (
    <section className="mt-6 rounded-3xl bg-gradient-to-br from-teal-50 to-white p-5 ring-1 ring-teal-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand-navy">👪 Family Report</h2>
          <p className="text-sm text-slate-600">A report about {name.split(" ")[0]} for the family. You check it and send it; a school admin approves it, then the student and the parents see it.</p>
        </div>
        <form action={newFamilyReportAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="studentId" value={studentId} /><input type="hidden" name="back" value={`/teacher/students/${studentId}`} />
          <button name="kind" value="AUTO" className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">✨ Prepare it for me</button>
          <button name="kind" value="MANUAL" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">✍️ Write it myself</button>
        </form>
      </div>
      {reports.length > 0 && (
        <ul className="mt-4 space-y-2">{reports.slice(0, 6).map((r) => (
          <li key={r.id}><Link href={`/teacher/family-reports/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200 hover:ring-brand-teal">
            <span className="text-sm"><b className="text-brand-navy">{KIND_LABEL[r.kind]}</b> <span className="text-slate-500">· {r.author} · {r.submittedAt ?? r.createdAt}</span></span>
            <StatusChip status={r.status} />
          </Link></li>
        ))}</ul>
      )}
    </section>
  );
}

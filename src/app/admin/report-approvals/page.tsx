import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { KIND_LABEL, pendingApprovals, staffFamilyReports } from "@/server/reports/family-reports";
import { StatusChip } from "@/components/reports/family-report-view";

export const metadata = { title: "Reports to Approve" };

/** 📨 Reports to Approve: every family report a teacher sent; nothing reaches a family before an admin approves it. */
export default async function ReportApprovals({ searchParams }: { searchParams: Promise<{ msg?: string; tab?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const pending = await pendingApprovals(repo, actor);
  const done = sp.tab === "done" ? (await staffFamilyReports(repo, actor)).filter((r) => r.status === "APPROVED" || r.status === "RETURNED").slice(0, 100) : [];
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const list = sp.tab === "done" ? done : pending;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Administration" }} icon="📨" title="Reports to Approve"
        subtitle="Teachers’ reports for families. Open one, read it (you may correct it), then approve it — the student and the parents are notified — or return it to the teacher with a note." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <nav className="mb-4 flex gap-2"><Link href="/admin/report-approvals" className={chip(sp.tab !== "done")}>Waiting · {pending.length}</Link><Link href="/admin/report-approvals?tab=done" className={chip(sp.tab === "done")}>Done</Link></nav>
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.id}><Link href={`/admin/report-approvals/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200 hover:ring-brand-teal">
            <span><span className="block font-semibold text-brand-navy"><bdi>{r.studentName}</bdi> <span className="text-sm font-normal text-slate-500">· Grade {r.grade} · {r.className}</span></span><span className="block text-xs text-slate-500">{KIND_LABEL[r.kind]} · from {r.author} · sent {r.submittedAt ?? r.createdAt}</span></span>
            <StatusChip status={r.status} />
          </Link></li>
        ))}
        {!list.length && <li className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{sp.tab === "done" ? "Nothing yet." : "🎉 Nothing waiting."}</li>}
      </ul>
    </AppShell>
  );
}

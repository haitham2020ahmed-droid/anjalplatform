import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { familyReport, KIND_LABEL } from "@/server/reports/family-reports";
import { tierLine } from "@/server/tiers/views";
import { FamilyReportFields, FamilyReportView, StatusChip } from "@/components/reports/family-report-view";
import { reviewReportAction } from "../actions";

export const metadata = { title: "Approve a report" };

export default async function ReviewReport({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; edit?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { id } = await params;
  const sp = await searchParams;
  const r = await familyReport(repo, actor, id);
  const pending = r.status === "PENDING";
  // the student's support tier next to the text, so a "good progress" sentence for a Tier-3 student is caught (Update 39C)
  const tier = await tierLine(repo, r.studentId).catch(() => null);
  const full = r.kind === "PROGRESS" ? `/teacher/progress/${r.studentId}/report` : r.kind === "DIAGNOSTIC" ? `/teacher/diagnostic?student=${r.studentId}` : null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/report-approvals", label: "Reports to Approve" }} icon="📨" title={`${KIND_LABEL[r.kind]} · ${r.studentName}`}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><StatusChip status={r.status} /> From {r.author} · sent {r.submittedAt ?? r.createdAt}{r.reviewer ? ` · reviewed by ${r.reviewer} ${r.reviewedAt}` : ""}</span>} />
      {tier && <p className={`mb-4 rounded-xl px-4 py-3 text-sm ring-1 ${tier.tier === 3 ? "bg-red-50 text-red-900 ring-red-200" : tier.tier === 2 ? "bg-amber-50 text-amber-950 ring-amber-200" : "bg-slate-50 text-slate-700 ring-slate-200"}`}><b>Support tier: Tier {tier.tier}</b>{tier.since ? ` since ${tier.since}` : ""} — {tier.reason}{tier.tier > 1 ? " Check that the report's wording fits this." : ""}</p>}
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {full && <p className="mb-4 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-950 ring-1 ring-sky-200">Approving this shares the full live {r.kind === "PROGRESS" ? "progress" : "Diagnostic"} report with the family. <Link href={full} className="font-semibold underline">Open the full report</Link></p>}
      <form action={reviewReportAction} className="space-y-5">
        <input type="hidden" name="id" value={r.id} />
        {pending && sp.edit === "1" ? (
          <section className="rounded-3xl bg-white p-5 ring-1 ring-slate-200"><h2 className="mb-3 text-lg font-bold text-brand-navy">✏️ Correct the report</h2><FamilyReportFields title={r.title} c={r.content} /></section>
        ) : <FamilyReportView r={r} />}
        {pending && (
          <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <label className="block text-sm font-semibold text-slate-700">Note to the teacher (needed to return it)<textarea name="note" rows={2} maxLength={1000} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button name="op" value="approve" className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700">✅ Approve & send to the family</button>
              <button name="op" value="return" className="rounded-xl bg-white px-5 py-2.5 font-semibold text-red-700 ring-1 ring-red-200 hover:ring-red-400">↩️ Return to the teacher</button>
              {sp.edit === "1" ? <button name="op" value="save" className="rounded-xl bg-white px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300">💾 Save corrections</button>
                : <Link href={`/admin/report-approvals/${r.id}?edit=1`} className="rounded-xl bg-white px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">✏️ Correct it first</Link>}
            </div>
          </section>
        )}
      </form>
    </AppShell>
  );
}
